#!/usr/bin/env node
/**
 * validate-data.mjs
 *
 * Checks the generated data for the organization heatmap:
 *   - every file parses
 *   - codes are unique within each file and consistent with file names
 *   - world.json has no Antarctica and every interactive country has a code
 *   - countries.json hasRegions flags match the presence of regions files
 *   - every code in sheet/Subdivisions.csv exists in exactly one regions file
 *   - every alpha-2 in sheet/Countries.csv is an interactive country
 *   - each seed has exactly one canonical row per code and unique keys
 *   - size budgets: world ≤ 150 KB, each regions file ≤ 250 KB, median ≤ 50 KB
 *
 * Exits non-zero on any failure.  Usage: cd tools && npm run validate
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(toolsDir, "..");
const dataDir = path.join(rootDir, "data");
const regionsDir = path.join(dataDir, "regions");
const sheetDir = path.join(rootDir, "sheet");

const BUDGET = { worldBytes: 150 * 1024, regionMaxBytes: 250 * 1024, regionMedianBytes: 50 * 1024 };

const failures = [];
const fail = (msg) => failures.push(msg);
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    fail(`${path.relative(rootDir, p)}: cannot parse (${e.message})`);
    return null;
  }
}

/** Minimal RFC 4180 CSV parser (handles quotes, CRLF, BOM). */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Seeds have a stamp row, then a header row, then data. */
function readSeed(name) {
  const p = path.join(sheetDir, name);
  if (!fs.existsSync(p)) { fail(`${name}: missing`); return null; }
  const rows = parseCsv(fs.readFileSync(p, "utf8"));
  if (!rows[0]?.[0]?.startsWith("# ") || !/Natural Earth \d/.test(rows[0][0])) fail(`${name}: first row is not the version stamp`);
  const header = rows[1] ?? [];
  const data = rows.slice(2).filter((r) => r.length > 1 || (r[0] ?? "") !== "");
  return { header, data: data.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) };
}

// ---------------------------------------------------------------------------
// world.json
// ---------------------------------------------------------------------------

const worldPath = path.join(dataDir, "world.json");
const world = fs.existsSync(worldPath) ? readJson(worldPath) : (fail("data/world.json: missing"), null);
const interactiveCodes = new Set();
if (world) {
  const size = fs.statSync(worldPath).size;
  if (size > BUDGET.worldBytes) fail(`world.json is ${kb(size)}, budget ${kb(BUDGET.worldBytes)}`);
  const obj = world.objects?.countries;
  if (!obj) fail("world.json: objects.countries missing");
  else {
    const seen = new Set();
    for (const g of obj.geometries) {
      const p = g.properties ?? {};
      if (p.interactive) {
        if (!/^[A-Z]{2}$/.test(p.code ?? "")) fail(`world.json: interactive feature "${p.name}" has bad code "${p.code}"`);
        if (seen.has(p.code)) fail(`world.json: duplicate code ${p.code}`);
        seen.add(p.code);
        interactiveCodes.add(p.code);
      } else if (p.code) fail(`world.json: non-interactive feature "${p.name}" carries code ${p.code}`);
      if (p.code === "AQ" || /antarctica/i.test(p.name ?? "")) fail("world.json: Antarctica present");
      if (!p.name) fail("world.json: feature without name");
    }
  }
}

// ---------------------------------------------------------------------------
// countries.json + regions/*.json
// ---------------------------------------------------------------------------

const manifestPath = path.join(dataDir, "countries.json");
const manifest = fs.existsSync(manifestPath) ? readJson(manifestPath) : (fail("data/countries.json: missing"), null);
const regionFiles = fs.existsSync(regionsDir) ? fs.readdirSync(regionsDir).filter((f) => f.endsWith(".json")).sort() : [];
const regionsByCountry = new Map(); // XX -> Set(codes)
const sizes = [];

for (const file of regionFiles) {
  const m = /^([A-Z]{2})\.json$/.exec(file);
  if (!m) { fail(`regions/${file}: unexpected file name`); continue; }
  const cc = m[1];
  const p = path.join(regionsDir, file);
  const size = fs.statSync(p).size;
  sizes.push(size);
  if (size > BUDGET.regionMaxBytes) fail(`regions/${file} is ${kb(size)}, budget ${kb(BUDGET.regionMaxBytes)}`);
  const topo = readJson(p);
  if (!topo) continue;
  const obj = topo.objects?.regions;
  if (!obj) { fail(`regions/${file}: objects.regions missing`); continue; }
  if (obj.geometries.length < 2) fail(`regions/${file}: fewer than two features`);
  const codes = new Set();
  for (const g of obj.geometries) {
    const pr = g.properties ?? {};
    const keys = Object.keys(pr).sort().join(",");
    if (keys !== "code,country,name") fail(`regions/${file}: feature ${pr.code} has properties [${keys}]`);
    if (pr.country !== cc) fail(`regions/${file}: feature ${pr.code} has country ${pr.country}`);
    if (!new RegExp(`^${cc}-([A-Z0-9]{1,3}|~\\d+)$`).test(pr.code ?? "")) fail(`regions/${file}: bad code "${pr.code}"`);
    if (codes.has(pr.code)) fail(`regions/${file}: duplicate code ${pr.code}`);
    codes.add(pr.code);
    if (!pr.name) fail(`regions/${file}: ${pr.code} has no name`);
  }
  regionsByCountry.set(cc, codes);
  if (!interactiveCodes.has(cc)) fail(`regions/${file}: no interactive country ${cc} in world.json`);
}

sizes.sort((a, b) => a - b);
const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
if (median > BUDGET.regionMedianBytes) fail(`regions median is ${kb(median)}, budget ${kb(BUDGET.regionMedianBytes)}`);

if (manifest) {
  const manifestCodes = new Set();
  for (const c of manifest) {
    if (!interactiveCodes.has(c.code)) fail(`countries.json: ${c.code} is not an interactive country in world.json`);
    if (manifestCodes.has(c.code)) fail(`countries.json: duplicate ${c.code}`);
    manifestCodes.add(c.code);
    const has = regionsByCountry.has(c.code);
    if (c.hasRegions !== has) fail(`countries.json: ${c.code} hasRegions=${c.hasRegions} but regions file ${has ? "exists" : "is absent"}`);
  }
  for (const code of interactiveCodes) if (!manifestCodes.has(code)) fail(`countries.json: missing interactive country ${code}`);
}

// ---------------------------------------------------------------------------
// Seeds
// ---------------------------------------------------------------------------

const subs = readSeed("Subdivisions.csv");
let subCanon = 0, subAlias = 0;
if (subs) {
  const want = ["Key", "Country Code", "Name", "Code", "Canonical"];
  if (subs.header.join(",") !== want.join(",")) fail(`Subdivisions.csv: header is [${subs.header}]`);
  const keys = new Set(), canonPerCode = new Map();
  for (const r of subs.data) {
    if (keys.has(r.Key)) fail(`Subdivisions.csv: duplicate key ${r.Key}`);
    keys.add(r.Key);
    const set = regionsByCountry.get(r["Country Code"]);
    if (!set) fail(`Subdivisions.csv: ${r.Code} references country ${r["Country Code"]} with no regions file`);
    else if (!set.has(r.Code)) fail(`Subdivisions.csv: code ${r.Code} not found in regions/${r["Country Code"]}.json`);
    if (r.Key !== `${r["Country Code"].toLowerCase()}|${r.Name.trim().toLowerCase()}`) fail(`Subdivisions.csv: key "${r.Key}" does not match its row`);
    if (r.Canonical === "TRUE") { subCanon++; canonPerCode.set(r.Code, (canonPerCode.get(r.Code) ?? 0) + 1); } else subAlias++;
  }
  for (const [cc, codes] of regionsByCountry) for (const code of codes) {
    if ((canonPerCode.get(code) ?? 0) !== 1) fail(`Subdivisions.csv: ${code} has ${canonPerCode.get(code) ?? 0} canonical rows (want 1)`);
  }
}

const ctry = readSeed("Countries.csv");
let ctryCanon = 0, ctryAlias = 0;
if (ctry) {
  const want = ["Key", "Name", "Alpha-2", "Canonical"];
  if (ctry.header.join(",") !== want.join(",")) fail(`Countries.csv: header is [${ctry.header}]`);
  const keys = new Set(), canonPerCode = new Map();
  for (const r of ctry.data) {
    if (keys.has(r.Key)) fail(`Countries.csv: duplicate key ${r.Key}`);
    keys.add(r.Key);
    if (!interactiveCodes.has(r["Alpha-2"])) fail(`Countries.csv: ${r["Alpha-2"]} ("${r.Name}") is not an interactive country`);
    if (r.Key !== r.Name.trim().toLowerCase()) fail(`Countries.csv: key "${r.Key}" does not match its row`);
    if (r.Canonical === "TRUE") { ctryCanon++; canonPerCode.set(r["Alpha-2"], (canonPerCode.get(r["Alpha-2"]) ?? 0) + 1); } else ctryAlias++;
  }
  for (const code of interactiveCodes) if ((canonPerCode.get(code) ?? 0) !== 1) fail(`Countries.csv: ${code} has ${canonPerCode.get(code) ?? 0} canonical rows (want 1)`);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log(`world.json          ${world ? kb(fs.statSync(worldPath).size) : "-"}  interactive countries: ${interactiveCodes.size}`);
console.log(`countries.json      ${manifest ? manifest.length : "-"} entries, ${[...regionsByCountry.keys()].length} with regions`);
console.log(`regions/            ${regionFiles.length} files, median ${kb(median)}, max ${kb(sizes.at(-1) ?? 0)}, total ${kb(sizes.reduce((a, b) => a + b, 0))}`);
console.log(`Subdivisions.csv    ${subCanon} canonical + ${subAlias} alias rows`);
console.log(`Countries.csv       ${ctryCanon} canonical + ${ctryAlias} alias rows`);

if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const f of failures.slice(0, 50)) console.error("  - " + f);
  if (failures.length > 50) console.error(`  ... and ${failures.length - 50} more`);
  process.exit(1);
}
console.log("\nAll checks passed.");
