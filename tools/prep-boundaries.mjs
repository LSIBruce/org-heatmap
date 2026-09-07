#!/usr/bin/env node
/**
 * prep-boundaries.mjs
 *
 * Builds every generated data file for the organization heatmap from Natural
 * Earth (public domain) in one run:
 *
 *   data/world.json            admin-0 countries, TopoJSON, Antarctica removed
 *   data/countries.json        manifest: code, name, hasRegions
 *   data/regions/<XX>.json     admin-1 states/provinces per country, TopoJSON
 *   sheet/Countries.csv        Google Sheet lookup seed (canonical + alias rows)
 *   sheet/Subdivisions.csv     Google Sheet lookup seed (canonical + alias rows)
 *   tools/ne-version.json      provenance stamp
 *
 * The topologies and the sheet seeds come from the same records in the same
 * run, so a name that matches in the sheet is guaranteed to be a shape on the
 * map. Never regenerate one without the other.
 *
 * Usage:  cd tools && npm install && npm run prep
 * Needs:  Node.js 18+ (uses global fetch), mapshaper (dev dependency).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mapshaper from "mapshaper";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const NE_VERSION = "5.1.1"; // as served by naciscdn.org; recorded in ne-version.json
const NE_BASE = "https://naciscdn.org/naturalearth";
const SOURCES = {
  adm0: {
    file: "ne_50m_admin_0_countries.zip",
    url: `${NE_BASE}/50m/cultural/ne_50m_admin_0_countries.zip`,
  },
  adm1: {
    file: "ne_10m_admin_1_states_provinces.zip",
    url: `${NE_BASE}/10m/cultural/ne_10m_admin_1_states_provinces.zip`,
  },
};

const WORLD_SIMPLIFY = "10%";
const REGIONS_SIMPLIFY = "20%";
const QUANTIZATION = "1e4";

// Admin-0 features removed entirely.
const EXCLUDE_A3 = ["ATA"]; // Antarctica

// Admin-0 units that Natural Earth draws separately but ISO 3166-1 folds into
// a neighbour. Applied to admin-0 and to admin-1 parentage.
const A3_REMAP = { SOL: "SO", CYN: "CY" };

// Dissolved subdivisions whose ISO-level name is not among the constituents.
const SUBDIVISION_NAME_OVERRIDES = {
  "MG-A": "Toamasina",
  "MG-D": "Antsiranana",
  "MG-F": "Fianarantsoa",
  "MG-M": "Mahajanga",
  "MG-T": "Antananarivo",
  "MG-U": "Toliara",
  "BA-BIH": "Federation of Bosnia and Herzegovina",
  "IE-D": "Dublin",
  "IE-TA": "Tipperary",
  "PH-MNL": "Metro Manila",
};

// Hand-maintained country aliases (in addition to Natural Earth's name fields).
const COUNTRY_EXTRA_ALIASES = {
  US: ["United States", "USA", "U.S.", "U.S.A.", "America", "United States of America"],
  GB: ["UK", "U.K.", "Great Britain", "Britain", "England", "Scotland", "Wales", "Northern Ireland"],
  KR: ["South Korea", "Korea, South", "Republic of Korea"],
  KP: ["North Korea", "Korea, North"],
  CD: ["DRC", "DR Congo", "Congo-Kinshasa", "Democratic Republic of Congo", "Democratic Republic of the Congo"],
  CG: ["Congo-Brazzaville", "Republic of Congo", "Republic of the Congo"],
  CI: ["Ivory Coast", "Cote d'Ivoire"],
  CZ: ["Czech Republic", "Czechia"],
  MM: ["Burma", "Myanmar"],
  SZ: ["Swaziland", "Eswatini"],
  MK: ["Macedonia", "North Macedonia"],
  TL: ["East Timor", "Timor-Leste"],
  CV: ["Cape Verde", "Cabo Verde"],
  VA: ["Vatican City", "Holy See", "Vatican"],
  RU: ["Russian Federation", "Russia"],
  IR: ["Iran"],
  SY: ["Syria"],
  LA: ["Laos"],
  VN: ["Vietnam", "Viet Nam"],
  BO: ["Bolivia"],
  VE: ["Venezuela"],
  TZ: ["Tanzania"],
  AE: ["UAE", "United Arab Emirates"],
  TW: ["Taiwan"],
  PS: ["Palestine", "West Bank", "Gaza", "Palestinian Territories"],
  NL: ["Holland", "The Netherlands", "Netherlands"],
  BS: ["The Bahamas", "Bahamas"],
  GM: ["The Gambia", "Gambia"],
  TR: ["Turkey", "Türkiye", "Turkiye"],
  MO: ["Macao", "Macau"],
  HK: ["Hong Kong"],
  BN: ["Brunei"],
  FM: ["Micronesia"],
  MD: ["Moldova"],
  SO: ["Somalia", "Somaliland"],
  CY: ["Cyprus", "Northern Cyprus"],
  XK: ["Kosovo"],
  EH: ["Western Sahara"],
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(toolsDir, "..");
const tmpDir = path.join(toolsDir, "tmp");
const dataDir = path.join(rootDir, "data");
const regionsDir = path.join(dataDir, "regions");
const sheetDir = path.join(rootDir, "sheet");
const posix = (p) => p.replace(/\\/g, "/");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn("  !", ...a);

const SPECIAL_FOLD = {
  ł: "l", Ł: "L", ø: "o", Ø: "O", æ: "ae", Æ: "AE", œ: "oe", Œ: "OE",
  ß: "ss", đ: "d", Đ: "D", þ: "th", Þ: "Th", ð: "d", Ð: "D", ı: "i",
  "’": "'", "‘": "'", "`": "'", "–": "-", "—": "-",
};

/** Strip diacritics and fold a few letters NFKD does not decompose. */
function fold(s) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[łŁøØæÆœŒßđĐþÞðÐı’‘`–—]/g, (c) => SPECIAL_FOLD[c] ?? c);
}

const clean = (s) => (s ?? "").toString().replace(/\s+/g, " ").trim();
const keyOf = (s) => clean(s).toLowerCase();
const isBlank = (s) => {
  const c = clean(s);
  return c === "" || c === "-99" || c === "-1" || c === "null";
};

/** Expand a list of raw names into cleaned unique aliases, with folded forms. */
function expandAliases(rawNames) {
  const out = new Map(); // key -> display
  for (const raw of rawNames) {
    if (raw == null) continue;
    for (const part of String(raw).split("|")) {
      const c = clean(part);
      if (isBlank(c)) continue;
      const variants = [c, fold(c), c.replace(/[’'`]/g, ""), fold(c).replace(/[’'`]/g, "")];
      for (const v of variants) {
        const k = keyOf(v);
        if (k && !out.has(k)) out.set(k, v);
      }
    }
  }
  return out;
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csvRow = (cells) => cells.map(csvCell).join(",");

function stampRow(kind) {
  return csvRow([
    `# ${kind} lookup generated from Natural Earth ${NE_VERSION} on ${new Date().toISOString().slice(0, 10)} by tools/prep-boundaries.mjs. Do not edit by hand; regenerate with npm run prep and re-import this tab together with the map data.`,
  ]);
}

async function download(src) {
  const dest = path.join(tmpDir, src.file);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    log(`  cached  ${src.file}`);
    return dest;
  }
  log(`  fetch   ${src.url}`);
  const res = await fetch(src.url);
  if (!res.ok) throw new Error(`Download failed ${res.status} ${src.url}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Pass A: admin-0 → world.json + attribute table
// ---------------------------------------------------------------------------

async function buildWorld(adm0Zip) {
  const attrsOut = path.join(tmpDir, "adm0-attrs.json");
  const worldOut = path.join(dataDir, "world.json");
  const remapJs = JSON.stringify(A3_REMAP);
  const excludeJs = JSON.stringify(EXCLUDE_A3);

  const cmd = [
    `-i ${posix(adm0Zip)} -drop target=*.VERSION`,
    `-filter '${excludeJs}.indexOf(ADM0_A3) < 0'`,
    `-each 'var eh = String(ISO_A2_EH || ""), a2 = String(ISO_A2 || "");` +
      ` code = /^[A-Z]{2}$/.test(eh) ? eh : (/^[A-Z]{2}$/.test(a2) ? a2 : "");` +
      ` code = (${remapJs})[ADM0_A3] || code; area = this.area'`,
    `-sort 'area' descending`,
    `-dissolve code where='code != ""' copy-fields=NAME,ADM0_A3` +
      ` calc='a3s = collect(ADM0_A3), names = collect(NAME), longs = collect(NAME_LONG),` +
      ` admins = collect(ADMIN), formals = collect(FORMAL_EN), ens = collect(NAME_EN), types = collect(TYPE)'`,
    `-each 'name = NAME; interactive = code != ""'`,
    `-rename-layers countries`,
    `-o format=json ${posix(attrsOut)}`,
    `-filter-fields code,name,interactive`,
    `-simplify ${WORLD_SIMPLIFY} keep-shapes`,
    `-o format=topojson quantization=${QUANTIZATION} ${posix(worldOut)}`,
  ].join(" ");

  await mapshaper.runCommands(cmd);

  const attrs = JSON.parse(fs.readFileSync(attrsOut, "utf8"));
  const countries = new Map(); // code -> { code, name, a3s:Set, aliases:Map }
  let nonInteractive = [];
  for (const r of attrs) {
    if (!r.interactive) {
      nonInteractive.push(r.NAME);
      continue;
    }
    const a3s = new Set(r.a3s ?? [r.ADM0_A3]);
    const aliases = expandAliases([
      r.NAME, ...(r.names ?? []), ...(r.longs ?? []), ...(r.admins ?? []),
      ...(r.formals ?? []), ...(r.ens ?? []), ...(COUNTRY_EXTRA_ALIASES[r.code] ?? []),
    ]);
    countries.set(r.code, { code: r.code, name: clean(r.NAME), a3s, aliases });
  }
  // Remapped units are reachable by their target code even if the dissolve
  // recorded them under it already; make the a3 lookup complete either way.
  for (const [a3, code] of Object.entries(A3_REMAP)) countries.get(code)?.a3s.add(a3);

  log(`  world.json  ${(fs.statSync(worldOut).size / 1024).toFixed(0)} KB, ${countries.size} interactive countries`);
  if (nonInteractive.length) log(`  non-interactive (no ISO code): ${nonInteractive.join(", ")}`);
  return countries;
}

// ---------------------------------------------------------------------------
// Pass B: admin-1 → regions/<XX>.json (raw), then post-process in Node
// ---------------------------------------------------------------------------

async function buildRegions(adm1Zip, countries) {
  // a3 -> alpha-2 join table
  const a3map = path.join(tmpDir, "a3map.csv");
  const rows = ["a3,alpha2"];
  for (const c of countries.values()) for (const a3 of c.a3s) rows.push(`${a3},${c.code}`);
  fs.writeFileSync(a3map, rows.join("\n") + "\n");

  // Attribute-only pass to report what gets dropped.
  const attrsOut = path.join(tmpDir, "adm1-attrs.json");
  await mapshaper.runCommands(
    `-i ${posix(adm1Zip)} -drop target=*.VERSION -filter-fields adm0_a3,name,diss_me -o format=json ${posix(attrsOut)}`
  );
  const allAttrs = JSON.parse(fs.readFileSync(attrsOut, "utf8"));
  const knownA3 = new Set([...countries.values()].flatMap((c) => [...c.a3s]));
  const dropped = new Map();
  for (const r of allAttrs) {
    if (!knownA3.has(r.adm0_a3)) dropped.set(r.adm0_a3, (dropped.get(r.adm0_a3) ?? 0) + 1);
  }
  if (dropped.size) {
    log(`  dropped admin-1 features with no interactive parent: ` +
      [...dropped].map(([a3, n]) => `${a3}(${n})`).join(" "));
  }

  const rawDir = path.join(tmpDir, "regions-raw");
  rmrf(rawDir);
  fs.mkdirSync(rawDir, { recursive: true });

  const cmd = [
    `-i ${posix(adm1Zip)} -drop target=*.VERSION`,
    `-join ${posix(a3map)} keys=adm0_a3,a3 fields=alpha2`,
    `-filter 'alpha2 != null && alpha2 !== ""'`,
    `-each 'var iso = String(iso_3166_2 || "");` +
      ` code = (/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(iso) && iso.slice(0, 2) === alpha2) ? iso : alpha2 + "-~" + diss_me;` +
      ` area = this.area'`,
    `-sort 'area' descending`,
    `-dissolve code copy-fields=name,alpha2` +
      ` calc='names = collect(name), ens = collect(name_en), alts = collect(name_alt),` +
      ` gns = collect(gn_name), woes = collect(woe_name), n = count()'`,
    `-each 'country = alpha2'`,
    `-filter-fields code,name,country,names,ens,alts,gns,woes,n`,
    `-simplify ${REGIONS_SIMPLIFY} keep-shapes`,
    `-rename-layers regions`,
    `-split country`,
    `-o format=topojson quantization=${QUANTIZATION} singles ${posix(rawDir)}/`,
  ].join(" ");

  await mapshaper.runCommands(cmd);

  // Post-process each raw file: rename object, trim properties, harvest aliases.
  rmrf(regionsDir);
  fs.mkdirSync(regionsDir, { recursive: true });

  const manifestHasRegions = new Map(); // code -> boolean
  const subdivisionRows = []; // { country, code, name, aliases:Map }
  let dissolvedCount = 0;
  const sizes = [];

  for (const file of fs.readdirSync(rawDir).sort()) {
    const m = /^(?:regions-)?([A-Z]{2})\.json$/.exec(file);
    if (!m) {
      warn(`unexpected raw file ${file}`);
      continue;
    }
    const country = m[1];
    const topo = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8"));
    const objKey = Object.keys(topo.objects)[0];
    const geoms = topo.objects[objKey].geometries;

    if (geoms.length < 2) {
      manifestHasRegions.set(country, false);
      continue; // single-feature countries have no drill-down
    }

    const seenCodes = new Set();
    const usedNameKeys = new Map(); // display names must be unique within a country
    for (const g of geoms) {
      const p = g.properties;
      if (p.country !== country) throw new Error(`country mismatch in ${file}: ${p.country}`);
      if (seenCodes.has(p.code)) throw new Error(`duplicate code ${p.code} in ${file}`);
      seenCodes.add(p.code);
      if ((p.n ?? 1) > 1) dissolvedCount++;

      let name = SUBDIVISION_NAME_OVERRIDES[p.code]
        ?? [p.name, ...(p.ens ?? []), ...(p.gns ?? []), ...(p.woes ?? [])].map(clean).find((v) => !isBlank(v))
        ?? "Unnamed area";
      if (usedNameKeys.has(keyOf(name))) {
        let i = 2;
        while (usedNameKeys.has(keyOf(`${name} (${i})`))) i++;
        warn(`${country}: two subdivisions named "${name}"; ${p.code} becomes "${name} (${i})"`);
        name = `${name} (${i})`;
      }
      usedNameKeys.set(keyOf(name), p.code);
      const aliases = expandAliases([name, p.name, ...(p.names ?? []), ...(p.ens ?? []),
        ...(p.alts ?? []), ...(p.gns ?? []), ...(p.woes ?? [])]);
      subdivisionRows.push({ country, code: p.code, name, aliases });
      g.properties = { code: p.code, name, country };
    }

    topo.objects = { regions: topo.objects[objKey] };
    const out = path.join(regionsDir, `${country}.json`);
    fs.writeFileSync(out, JSON.stringify(topo));
    sizes.push(fs.statSync(out).size);
    manifestHasRegions.set(country, true);
  }

  sizes.sort((a, b) => a - b);
  const median = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;
  log(`  regions/    ${sizes.length} files, median ${(median / 1024).toFixed(0)} KB, max ${(sizes.at(-1) / 1024).toFixed(0)} KB, ` +
    `${dissolvedCount} dissolved units, ${subdivisionRows.length} subdivisions`);
  return { manifestHasRegions, subdivisionRows };
}

// ---------------------------------------------------------------------------
// Outputs: manifest, seed CSVs, version stamp
// ---------------------------------------------------------------------------

function writeManifest(countries, manifestHasRegions) {
  const list = [...countries.values()]
    .map((c) => ({ code: c.code, name: c.name, hasRegions: manifestHasRegions.get(c.code) === true }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  fs.writeFileSync(path.join(dataDir, "countries.json"), JSON.stringify(list));
  const withRegions = list.filter((c) => c.hasRegions).length;
  log(`  countries.json  ${list.length} countries, ${withRegions} with regions`);
}

function writeCountriesCsv(countries) {
  const lines = [stampRow("Countries"), csvRow(["Key", "Name", "Alpha-2", "Canonical"])];
  const sorted = [...countries.values()].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const usedKeys = new Map(); // key -> code, to detect cross-country alias collisions
  let aliasCount = 0;
  for (const c of sorted) {
    lines.push(csvRow([keyOf(c.name), c.name, c.code, "TRUE"]));
    usedKeys.set(keyOf(c.name), c.code);
  }
  for (const c of sorted) {
    for (const [k, display] of c.aliases) {
      if (k === keyOf(c.name)) continue;
      const prior = usedKeys.get(k);
      if (prior && prior !== c.code) {
        warn(`country alias "${display}" is ambiguous between ${prior} and ${c.code}; skipping`);
        continue;
      }
      if (prior) continue;
      usedKeys.set(k, c.code);
      lines.push(csvRow([k, display, c.code, "FALSE"]));
      aliasCount++;
    }
  }
  fs.writeFileSync(path.join(sheetDir, "Countries.csv"), "﻿" + lines.join("\r\n") + "\r\n");
  log(`  Countries.csv  ${sorted.length} canonical + ${aliasCount} alias rows`);
}

function writeSubdivisionsCsv(subdivisionRows) {
  const lines = [stampRow("Subdivisions"), csvRow(["Key", "Country Code", "Name", "Code", "Canonical"])];
  const sorted = [...subdivisionRows].sort((a, b) =>
    a.country.localeCompare(b.country) || a.name.localeCompare(b.name, "en"));
  const usedKeys = new Map(); // "cc|name" -> code
  let aliasCount = 0;
  for (const r of sorted) {
    const k = `${r.country.toLowerCase()}|${keyOf(r.name)}`;
    if (usedKeys.has(k)) throw new Error(`canonical name collision ${k} (${usedKeys.get(k)} vs ${r.code})`);
    usedKeys.set(k, r.code);
    lines.push(csvRow([k, r.country, r.name, r.code, "TRUE"]));
  }
  for (const r of sorted) {
    for (const [nameKey, display] of r.aliases) {
      const k = `${r.country.toLowerCase()}|${nameKey}`;
      const prior = usedKeys.get(k);
      if (prior === r.code) continue;
      if (prior) {
        warn(`subdivision alias "${display}" in ${r.country} is ambiguous between ${prior} and ${r.code}; skipping`);
        continue;
      }
      usedKeys.set(k, r.code);
      lines.push(csvRow([k, r.country, display, r.code, "FALSE"]));
      aliasCount++;
    }
  }
  fs.writeFileSync(path.join(sheetDir, "Subdivisions.csv"), "﻿" + lines.join("\r\n") + "\r\n");
  log(`  Subdivisions.csv  ${sorted.length} canonical + ${aliasCount} alias rows`);
}

function writeVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.join(toolsDir, "node_modules/mapshaper/package.json"), "utf8"));
  const stamp = {
    naturalEarthVersion: NE_VERSION,
    sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.url])),
    generatedAt: new Date().toISOString(),
    mapshaperVersion: pkg.version,
    worldSimplify: WORLD_SIMPLIFY,
    regionsSimplify: REGIONS_SIMPLIFY,
    quantization: QUANTIZATION,
    excludedAdmin0: EXCLUDE_A3,
    admin0Remap: A3_REMAP,
    subdivisionNameOverrides: SUBDIVISION_NAME_OVERRIDES,
  };
  fs.writeFileSync(path.join(toolsDir, "ne-version.json"), JSON.stringify(stamp, null, 2) + "\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  for (const d of [tmpDir, dataDir, sheetDir]) fs.mkdirSync(d, { recursive: true });

  log("Downloading Natural Earth " + NE_VERSION);
  const adm0Zip = await download(SOURCES.adm0);
  const adm1Zip = await download(SOURCES.adm1);

  log("Building world (admin-0)");
  const countries = await buildWorld(adm0Zip);

  log("Building regions (admin-1)");
  const { manifestHasRegions, subdivisionRows } = await buildRegions(adm1Zip, countries);

  log("Writing manifest and sheet seeds");
  writeManifest(countries, manifestHasRegions);
  writeCountriesCsv(countries);
  writeSubdivisionsCsv(subdivisionRows);
  writeVersion();

  log("Done. Next: npm run validate");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
