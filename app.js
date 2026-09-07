/* Organization Heatmap
 *
 * Two-level choropleth: the world shaded by organizations per country, and any
 * selected country shaded by organizations per state or province. Data comes
 * from the published CSV of a Google Sheet (see sheet/README.md); boundaries
 * come from the generated files under data/ (see tools/prep-boundaries.mjs).
 *
 * Globals expected: d3 (v7), topojson (topojson-client v3), ORG_HEATMAP_CONFIG.
 */
(() => {
  "use strict";

  const cfg = Object.assign(
    {
      sheetCsvUrl: "",
      title: "Organization Heatmap",
      colorBreaks: [1, 2, 4, 8, 16],
      palette: ["#e6e6e6", "#fee8c8", "#fdbb84", "#fc8d59", "#e34a33", "#b30000"],
      tooltipNameCap: 10,
      narrowBreakpointPx: 700,
      worldPath: "data/world.json",
      countriesPath: "data/countries.json",
      regionsPathTemplate: "data/regions/{code}.json",
    },
    window.ORG_HEATMAP_CONFIG || {}
  );

  const W = 960, H = 500, PAD = 10;
  const REGION_RE = /^[A-Z]{2}(-[A-Z0-9~]{1,8})?$/;
  const ZOOM_MS = 750;

  const $ = (sel) => document.querySelector(sel);
  const el = {
    header: $("#header"), title: $("#title"), subtitle: $("#subtitle"), back: $("#back"),
    status: $("#status"), wrap: $("#map-wrap"), svg: $("#map"), tooltip: $("#tooltip"),
    legend: $("#legend"), unassigned: $("#unassigned"), panel: $("#panel"), debug: $("#debug"),
  };

  const debugMode = new URLSearchParams(location.search).get("debug") === "1";
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const hoverNone = matchMedia("(hover: none)");
  const panelMode = () => hoverNone.matches || window.innerWidth < cfg.narrowBreakpointPx;

  const state = {
    level: "world",       // "world" | "country"
    country: null,        // alpha-2 when level === "country"
    world: null,          // FeatureCollection of countries
    worldByCode: new Map(),
    manifest: new Map(),  // code -> { code, name, hasRegions }
    regionsCache: new Map(),
    data: null,           // aggregation when the sheet loaded and had rows
    dataOk: false,
    selected: null,       // selected region code in panel mode
    proj: null,           // current projection params
    loadedRegionCodes: new Map(), // country -> Set of subdivision codes (debug)
  };

  const projection = d3.geoEqualEarth();
  const geoPath = d3.geoPath(projection);
  const color = d3.scaleThreshold().domain(cfg.colorBreaks).range(cfg.palette);

  const svg = d3.select(el.svg).attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const gWorld = svg.append("g").attr("class", "layer world");
  const gOutline = svg.append("g").attr("class", "layer outline");
  const gRegions = svg.append("g").attr("class", "layer regions");

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  const clean = (v) => (v == null ? "" : String(v)).replace(/\s+/g, " ").trim();
  const normHeader = (h) => clean(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const byName = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });

  function setStatus(message) {
    el.status.textContent = message || "";
    el.status.hidden = !message;
  }

  function clearChildren(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function make(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  // ---------------------------------------------------------------------------
  // Data: fetch, parse, aggregate
  // ---------------------------------------------------------------------------

  function emptyEntry() {
    return { count: 0, names: [] };
  }

  function aggregate(rows) {
    const cols = new Map(rows.columns.map((c) => [normHeader(c), c]));
    const orgCol = cols.get("organization");
    const codeCol = cols.get("region code");
    const siteCol = cols.get("website");
    const result = {
      rowsParsed: rows.length, validRows: 0, blankRows: 0, invalid: [],
      byCountry: new Map(), bySub: new Map(), unassigned: new Map(),
      allOrgs: new Set(), missingColumns: [],
    };
    if (!orgCol) result.missingColumns.push("Organization");
    if (!codeCol) result.missingColumns.push("Region Code");
    if (result.missingColumns.length) return result;

    const add = (map, key, name, website) => {
      let entry = map.get(key);
      if (!entry) map.set(key, (entry = { orgs: new Map() }));
      const k = name.toLowerCase();
      if (!entry.orgs.has(k)) entry.orgs.set(k, { name, website });
    };

    rows.forEach((row, i) => {
      const rowNum = i + 2; // row 1 is the header
      const org = clean(row[orgCol]);
      const rawCode = clean(row[codeCol]);
      const code = rawCode.toUpperCase();
      if (Object.values(row).every((v) => clean(v) === "")) {
        result.blankRows++;
        return;
      }
      if (!org) {
        result.invalid.push({ row: rowNum, reason: "empty Organization" });
        return;
      }
      if (!REGION_RE.test(code)) {
        result.invalid.push({ row: rowNum, reason: rawCode ? `Region Code "${rawCode}" is not a valid code` : "empty Region Code" });
        return;
      }
      result.validRows++;
      const website = siteCol ? clean(row[siteCol]) : "";
      const country = code.slice(0, 2);
      result.allOrgs.add(org.toLowerCase());
      add(result.byCountry, country, org, website);
      if (code.length > 2) add(result.bySub, code, org, website);
      else add(result.unassigned, country, org, website);
    });

    // Freeze into { count, names[] } entries with names sorted.
    for (const map of [result.byCountry, result.bySub, result.unassigned]) {
      for (const [key, entry] of map) {
        const names = [...entry.orgs.values()].map((o) => o.name).sort(byName);
        map.set(key, { count: names.length, names });
      }
    }
    return result;
  }

  async function loadData() {
    if (!cfg.sheetCsvUrl) {
      return { ok: false, message: "No data source is configured yet. Set sheetCsvUrl in config.js." };
    }
    try {
      const res = await fetch(cfg.sheetCsvUrl, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = d3.csvParse(await res.text());
      const agg = aggregate(rows);
      if (agg.missingColumns.length) {
        return { ok: false, agg, message: `The data is missing required column(s): ${agg.missingColumns.join(", ")}.` };
      }
      if (agg.validRows === 0) {
        return { ok: false, agg, message: "No organizations were found in the data." };
      }
      return { ok: true, agg };
    } catch (err) {
      console.error("[org-heatmap] Could not load organization data:", err);
      return { ok: false, message: "Organization data is currently unavailable. The map is shown without counts." };
    }
  }

  function entry(map, key) {
    return (state.dataOk && map.get(key)) || emptyEntry();
  }

  function countryEntry(code) { return entry(state.data?.byCountry ?? new Map(), code); }
  function subEntry(code) { return entry(state.data?.bySub ?? new Map(), code); }
  function unassignedEntry(code) { return entry(state.data?.unassigned ?? new Map(), code); }

  function drillable(code) {
    return state.dataOk && state.manifest.get(code)?.hasRegions === true && countryEntry(code).count > 0;
  }

  // ---------------------------------------------------------------------------
  // Boundaries
  // ---------------------------------------------------------------------------

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async function loadRegions(code) {
    if (state.regionsCache.has(code)) return state.regionsCache.get(code);
    const topo = await fetchJson(cfg.regionsPathTemplate.replace("{code}", code));
    const fc = topojson.feature(topo, topo.objects.regions);
    state.regionsCache.set(code, fc);
    state.loadedRegionCodes.set(code, new Set(fc.features.map((f) => f.properties.code)));
    return fc;
  }

  // ---------------------------------------------------------------------------
  // Projection and zoom
  // ---------------------------------------------------------------------------

  function worldParams() {
    const p = d3.geoEqualEarth().rotate([0, 0]);
    p.fitExtent([[PAD, PAD], [W - PAD, H - PAD]], state.world);
    return { rotate: [0, 0], scale: p.scale(), translate: p.translate() };
  }

  function countryParams(feature) {
    const [lon] = d3.geoCentroid(feature);
    const p = d3.geoEqualEarth().rotate([-lon, 0]);
    p.fitExtent([[PAD * 3, PAD * 3], [W - PAD * 3, H - PAD * 3]], feature);
    return { rotate: [-lon, 0], scale: p.scale(), translate: p.translate() };
  }

  function applyProj(params) {
    projection.rotate(params.rotate).scale(params.scale).translate(params.translate);
  }

  function redraw() {
    svg.selectAll("path.region, path.outline").attr("d", geoPath);
  }

  function zoomTo(target, done) {
    const from = state.proj || target;
    state.proj = target;
    const duration = reducedMotion.matches ? 0 : ZOOM_MS;
    const finish = () => { applyProj(target); redraw(); if (done) done(); };
    if (duration === 0) return finish();

    const iRotate = d3.interpolate(from.rotate, target.rotate);
    const iTranslate = d3.interpolate(from.translate, target.translate);
    const ls0 = Math.log(from.scale), ls1 = Math.log(target.scale);
    svg.interrupt("zoom").transition("zoom").duration(duration).ease(d3.easeCubicInOut)
      .tween("projection", () => (t) => {
        applyProj({ rotate: iRotate(t), scale: Math.exp(ls0 + (ls1 - ls0) * t), translate: iTranslate(t) });
        redraw();
      })
      .on("end interrupt", finish);
  }

  // ---------------------------------------------------------------------------
  // Rendering: regions
  // ---------------------------------------------------------------------------

  function ariaLabel(name, count) {
    if (!state.dataOk) return name;
    return count === 0 ? `${name}, no organizations` : `${name}, ${plural(count, "organization")}`;
  }

  function fillFor(count) {
    return state.dataOk ? color(count) : cfg.palette[0];
  }

  function renderWorld() {
    const paths = gWorld.selectAll("path.region")
      .data(state.world.features, (f, i) => f.properties.code || `x${i}`)
      .join("path")
      .attr("class", (f) => `region country${f.properties.interactive ? " interactive" : ""}`)
      .attr("data-code", (f) => f.properties.code || null)
      .attr("d", geoPath);
    attachHandlers(paths.filter((f) => f.properties.interactive), "world");
    updateWorldFills();
  }

  function updateWorldFills() {
    gWorld.selectAll("path.region").each(function (f) {
      const p = f.properties;
      const e = p.interactive ? countryEntry(p.code) : emptyEntry();
      const node = d3.select(this);
      node.attr("fill", p.interactive ? fillFor(e.count) : cfg.palette[0]);
      if (p.interactive) {
        node.attr("aria-label", ariaLabel(p.name, e.count))
          .attr("role", "button")
          .attr("tabindex", state.level === "world" ? 0 : null);
      }
    });
  }

  function renderRegions(fc) {
    const paths = gRegions.selectAll("path.region")
      .data(fc.features, (f) => f.properties.code)
      .join("path")
      .attr("class", "region subdivision interactive")
      .attr("data-code", (f) => f.properties.code)
      .attr("role", "button")
      .attr("tabindex", 0)
      .attr("d", geoPath);
    paths.each(function (f) {
      const e = subEntry(f.properties.code);
      d3.select(this).attr("fill", fillFor(e.count)).attr("aria-label", ariaLabel(f.properties.name, e.count));
    });
    attachHandlers(paths, "country");
  }

  function attachHandlers(sel, level) {
    sel
      .on("pointerenter", (ev, f) => { if (!panelMode()) showTooltip(f, level, pointerPos(ev)); })
      .on("pointermove", (ev) => { if (!panelMode()) positionTooltip(pointerPos(ev)); })
      .on("pointerleave", hideTooltip)
      .on("focus", (ev, f) => { if (!panelMode()) showTooltip(f, level, centroidPos(f)); })
      .on("blur", hideTooltip)
      .on("click", (ev, f) => { ev.stopPropagation(); activate(f, level); })
      .on("keydown", (ev, f) => {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); activate(f, level); }
      });
  }

  function activate(feature, level) {
    const code = feature.properties.code;
    if (!code) return;
    if (panelMode()) {
      state.selected = code;
      highlightSelected();
      renderPanel();
      return;
    }
    if (level === "world" && drillable(code)) navigate(code);
  }

  function highlightSelected() {
    svg.selectAll("path.region").classed("selected", (f) => state.selected != null && f.properties.code === state.selected);
  }

  // ---------------------------------------------------------------------------
  // Rendering: tooltip
  // ---------------------------------------------------------------------------

  function pointerPos(ev) {
    const r = el.wrap.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function centroidPos(feature) {
    const [cx, cy] = geoPath.centroid(feature);
    const pt = el.svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    const s = pt.matrixTransform(el.svg.getScreenCTM());
    const r = el.wrap.getBoundingClientRect();
    return { x: s.x - r.left, y: s.y - r.top };
  }

  function describe(feature, level) {
    const p = feature.properties;
    const e = level === "world" ? countryEntry(p.code) : subEntry(p.code);
    return { name: p.name, count: e.count, names: e.names };
  }

  function showTooltip(feature, level, pos) {
    const d = describe(feature, level);
    clearChildren(el.tooltip);
    el.tooltip.appendChild(make("h3", null, d.name));
    if (state.dataOk) {
      el.tooltip.appendChild(make("div", "count", d.count === 0 ? "No organizations" : plural(d.count, "organization")));
      if (d.count > 0) {
        const ul = make("ul");
        d.names.slice(0, cfg.tooltipNameCap).forEach((n) => ul.appendChild(make("li", null, n)));
        el.tooltip.appendChild(ul);
        const more = d.count - cfg.tooltipNameCap;
        if (more > 0) el.tooltip.appendChild(make("div", "more", `and ${more} more`));
      }
      if (level === "world" && drillable(p(feature))) {
        el.tooltip.appendChild(make("div", "more", "Click to see regions"));
      }
    }
    el.tooltip.hidden = false;
    positionTooltip(pos);
  }

  const p = (feature) => feature.properties.code;

  function positionTooltip(pos) {
    if (el.tooltip.hidden) return;
    const wrapW = el.wrap.clientWidth, wrapH = el.wrap.clientHeight;
    const tw = el.tooltip.offsetWidth, th = el.tooltip.offsetHeight;
    let x = pos.x + 14, y = pos.y + 14;
    if (x + tw > wrapW - 4) x = Math.max(4, pos.x - tw - 14);
    if (y + th > wrapH - 4) y = Math.max(4, pos.y - th - 14);
    el.tooltip.style.left = `${x}px`;
    el.tooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    el.tooltip.hidden = true;
  }

  // ---------------------------------------------------------------------------
  // Rendering: header, legend, unassigned, panel
  // ---------------------------------------------------------------------------

  function renderHeader() {
    el.title.textContent = cfg.title;
    document.title = cfg.title;
    if (state.level === "world") {
      if (state.dataOk) {
        const orgs = state.data.allOrgs.size;
        const countries = [...state.data.byCountry.keys()].filter((c) => state.worldByCode.has(c)).length;
        el.subtitle.textContent = `${plural(orgs, "organization")} in ${plural(countries, "country").replace("countrys", "countries")}`;
      } else {
        el.subtitle.textContent = panelMode() ? "Tap a country to see its organizations" : "Hover over a country to see its organizations";
      }
      el.back.hidden = true;
    } else {
      const name = state.manifest.get(state.country)?.name ?? state.country;
      const e = countryEntry(state.country);
      el.subtitle.textContent = `${name}: ${plural(e.count, "organization")}`;
      el.back.hidden = false;
    }
    renderUnassigned();
  }

  function renderUnassigned() {
    if (state.level !== "country") { el.unassigned.hidden = true; return; }
    const u = unassignedEntry(state.country);
    if (u.count === 0) { el.unassigned.hidden = true; return; }
    el.unassigned.textContent = `${plural(u.count, "organization")} not assigned to a region: ${u.names.join(", ")}`;
    el.unassigned.hidden = false;
  }

  function renderLegend() {
    clearChildren(el.legend);
    el.legend.appendChild(make("span", "label", "Organizations per region"));
    const breaks = color.domain(), pal = color.range();
    const labels = ["0", ...breaks.map((b, i) => {
      const next = breaks[i + 1];
      if (next == null) return `${b}+`;
      return next - 1 === b ? `${b}` : `${b}–${next - 1}`;
    })];
    labels.forEach((label, i) => {
      const item = make("span", "item");
      const sw = make("span", "swatch");
      sw.style.background = pal[i];
      item.appendChild(sw);
      item.appendChild(make("span", null, label));
      el.legend.appendChild(item);
    });
  }

  function renderPanel() {
    if (!panelMode()) { el.panel.hidden = true; return; }
    clearChildren(el.panel);
    el.panel.hidden = false;

    if (!state.dataOk) {
      el.panel.appendChild(make("p", "hint", "Organization counts are not available right now."));
      return;
    }

    const level = state.level;
    if (!state.selected) {
      const hint = level === "world"
        ? "Tap a country to see its organizations."
        : `Tap a region of ${state.manifest.get(state.country)?.name ?? state.country} to see its organizations.`;
      el.panel.appendChild(make("p", "hint", hint));
      return;
    }

    const isCountry = state.selected.length === 2;
    const name = isCountry ? (state.manifest.get(state.selected)?.name ?? state.selected)
      : (state.regionsCache.get(state.country)?.features.find((f) => f.properties.code === state.selected)?.properties.name ?? state.selected);
    const e = isCountry ? countryEntry(state.selected) : subEntry(state.selected);

    el.panel.appendChild(make("h2", null, name));
    el.panel.appendChild(make("p", "count", e.count === 0 ? "No organizations" : plural(e.count, "organization")));
    if (e.count > 0) {
      const ul = make("ul");
      e.names.forEach((n) => ul.appendChild(make("li", null, n)));
      el.panel.appendChild(ul);
    }
    if (isCountry && level === "world" && drillable(state.selected)) {
      const actions = make("div", "actions");
      const btn = make("button", null, "View regions");
      btn.type = "button";
      btn.addEventListener("click", () => navigate(state.selected));
      actions.appendChild(btn);
      el.panel.appendChild(actions);
    }
  }

  // ---------------------------------------------------------------------------
  // Navigation: hash is the single source of truth for the current country
  // ---------------------------------------------------------------------------

  function navigate(code) {
    const target = code ? `#${code}` : "";
    if (location.hash === target || (!target && !location.hash)) { applyHash(); return; }
    if (target) location.hash = target;
    else history.pushState(null, "", location.pathname + location.search), applyHash();
  }

  async function applyHash() {
    const code = decodeURIComponent(location.hash.slice(1)).toUpperCase();
    if (code && state.manifest.get(code)?.hasRegions) {
      if (state.level === "country" && state.country === code) return;
      await enterCountry(code);
    } else if (state.level !== "world") {
      leaveToWorld();
    }
  }

  async function enterCountry(code) {
    const feature = state.worldByCode.get(code);
    if (!feature) return;
    let fc;
    try {
      fc = await loadRegions(code);
    } catch (err) {
      console.error("[org-heatmap] Could not load regions for", code, err);
      setStatus(`Regions for ${feature.properties.name} could not be loaded.`);
      return;
    }
    state.level = "country";
    state.country = code;
    state.selected = null;
    hideTooltip();
    gRegions.selectAll("*").remove();
    gOutline.selectAll("*").remove();
    gOutline.append("path").datum(feature).attr("class", "outline").attr("d", geoPath);
    gWorld.classed("context", true);
    updateWorldFills();
    renderRegions(fc);
    highlightSelected();
    renderHeader();
    renderPanel();
    zoomTo(countryParams(feature), () => {
      el.back.focus({ preventScroll: true });
      postHeight();
    });
  }

  function leaveToWorld() {
    const previous = state.country;
    state.level = "world";
    state.country = null;
    state.selected = null;
    hideTooltip();
    gRegions.selectAll("*").remove();
    gOutline.selectAll("*").remove();
    gWorld.classed("context", false);
    updateWorldFills();
    highlightSelected();
    renderHeader();
    renderPanel();
    zoomTo(worldParams(), () => {
      if (previous) el.svg.querySelector(`path[data-code="${previous}"]`)?.focus({ preventScroll: true });
      postHeight();
    });
  }

  // ---------------------------------------------------------------------------
  // Embed support: tell a listening parent how tall we would like to be
  // ---------------------------------------------------------------------------

  function postHeight() {
    if (window.parent === window) return;
    const mapH = el.wrap.clientWidth * (H / W);
    const extra = (el.unassigned.hidden ? 0 : el.unassigned.offsetHeight) + (panelMode() ? 220 : 0) + (el.debug.hidden ? 0 : 240);
    const height = Math.round(el.header.offsetHeight + mapH + el.legend.offsetHeight + extra + 40);
    window.parent.postMessage({ type: "org-heatmap:height", height }, "*");
  }

  // ---------------------------------------------------------------------------
  // Debug panel (?debug=1)
  // ---------------------------------------------------------------------------

  async function renderDebug(loadResult) {
    if (!debugMode) return;
    el.debug.hidden = false;
    clearChildren(el.debug);
    el.debug.appendChild(make("h2", null, "Data health"));
    const add = (text) => el.debug.appendChild(make("div", null, text));
    add(`Source: ${cfg.sheetCsvUrl || "(none configured)"}`);
    if (!loadResult.agg) { add(`Status: ${loadResult.message}`); return; }
    const a = loadResult.agg;
    add(`Rows parsed: ${a.rowsParsed}; valid: ${a.validRows}; blank: ${a.blankRows}; invalid: ${a.invalid.length}`);
    if (state.dataOk) {
      add(`Distinct organizations: ${a.allOrgs.size}; countries with organizations: ${a.byCountry.size}; subdivisions with organizations: ${a.bySub.size}`);
    } else add(`Status: ${loadResult.message}`);

    const list = (title, items) => {
      el.debug.appendChild(make("div", null, `${title} (${items.length})`));
      if (!items.length) return;
      const ul = make("ul");
      items.forEach((t) => ul.appendChild(make("li", null, t)));
      el.debug.appendChild(ul);
    };
    list("Invalid rows", a.invalid.map((r) => `row ${r.row}: ${r.reason}`));

    const unmatchedCountries = [...a.byCountry.keys()].filter((c) => !state.worldByCode.has(c));
    list("Country codes with no shape on the map", unmatchedCountries);

    const unmatchedSubs = [];
    const countriesToCheck = new Set([...a.bySub.keys()].map((c) => c.slice(0, 2)));
    for (const cc of countriesToCheck) {
      const m = state.manifest.get(cc);
      if (!m) continue; // already reported above
      if (!m.hasRegions) {
        for (const code of a.bySub.keys()) if (code.startsWith(cc + "-")) unmatchedSubs.push(`${code} (${m.name} has no regions on the map)`);
        continue;
      }
      try { await loadRegions(cc); } catch { unmatchedSubs.push(`${cc}-* (regions file failed to load)`); continue; }
      const known = state.loadedRegionCodes.get(cc);
      for (const code of a.bySub.keys()) if (code.startsWith(cc + "-") && !known.has(code)) unmatchedSubs.push(code);
    }
    list("Subdivision codes with no shape on the map", unmatchedSubs.sort());
    postHeight();
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  async function main() {
    renderHeader();
    renderLegend();

    let worldTopo, manifest;
    try {
      [worldTopo, manifest] = await Promise.all([fetchJson(cfg.worldPath), fetchJson(cfg.countriesPath)]);
    } catch (err) {
      console.error("[org-heatmap] Could not load map data:", err);
      el.subtitle.textContent = "";
      setStatus("The map data could not be loaded.");
      return;
    }
    state.world = topojson.feature(worldTopo, worldTopo.objects.countries);
    for (const f of state.world.features) if (f.properties.interactive) state.worldByCode.set(f.properties.code, f);
    for (const c of manifest) state.manifest.set(c.code, c);

    state.proj = worldParams();
    applyProj(state.proj);
    renderWorld();

    const dataPromise = loadData();
    const result = await dataPromise;
    state.dataOk = result.ok;
    state.data = result.agg || null;
    setStatus(result.ok ? "" : result.message);
    updateWorldFills();
    renderHeader();
    renderPanel();

    el.back.addEventListener("click", () => navigate(""));
    document.addEventListener("keydown", (ev) => { if (ev.key === "Escape" && state.level === "country") navigate(""); });
    el.svg.addEventListener("click", () => {
      if (panelMode() && state.selected) { state.selected = null; highlightSelected(); renderPanel(); }
    });
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("resize", () => { hideTooltip(); renderHeader(); renderPanel(); postHeight(); });
    hoverNone.addEventListener?.("change", () => { renderHeader(); renderPanel(); });

    await applyHash();
    postHeight();
    renderDebug(result);
  }

  main();
})();
