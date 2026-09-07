## Context

A ministry network keeps its list of partner organizations in a Google Sheet (one row per organization, with `Country` and `State` columns) and publishes its website through Tithely, a hosted church CMS whose pages accept custom embed blocks. There is no map today. The goal is an interactive choropleth heatmap showing how many organizations are in each region, with the organization names revealed on hover or tap, embedded in the Tithely site, hosted for free, and built entirely from open-source software and public-domain data.

Constraints that shaped the design:

- **No subscriptions, no API keys.** Rules out commercial map SDKs, tile providers with keys, and the Google Sheets API (which needs a Cloud project and key).
- **Editors are non-technical.** They will keep typing organization names, countries, and states into a sheet. The design must make bad data visible in the sheet, not in a browser console.
- **The CMS is a black box.** Tithely accepts an embed block. We assume an `<iframe>` works and nothing more; whether scripts are allowed in a block is unknown.
- **"State or province" applies everywhere**, not just the United States. That forces a two-level map rather than one flat composite.
- **Public repository.** GitHub Pages is free only on public repos. Everything shown on the map is already public, so nothing sensitive can be in the published tab.

Repository lives at `D:\prototypes\heat-map-webpage` for the prototype and will be pushed to a new public GitHub repository.

## Goals / Non-Goals

**Goals:**
- A single static page that renders the world shaded by organization count per country, and any selected country shaded by count per first-level subdivision.
- Organization names visible per region on hover (pointer devices) or tap (touch devices).
- Data flows from the Google Sheet to the page with no redeploy and no intermediate service.
- The sheet itself validates and codes the data so editors see mistakes as red cells.
- Boundary data, lookup tabs, and join keys are generated from one source so they cannot drift apart.
- Loads fast on a phone: small initial payload, per-country detail fetched on demand.
- Embeds in Tithely with a copy-paste snippet that needs no script.
- Reproducible: one script rebuilds all generated data.

**Non-Goals:**
- Pre-splitting large countries into states at the world level.
- Dependent State/Province dropdowns in the sheet.
- Point or density heatmaps from coordinates.
- Search, filtering, or clicking through to an organization's website.
- Scheduled data snapshots via GitHub Actions (a possible follow-up if Google's publish endpoint proves unreliable).
- Analytics, authentication, or any server component.

## Decisions

### D1. Two-level drill-down instead of one flat map

**Choice:** World level shows countries. Selecting a country zooms into it and shows its subdivisions. A back control returns to the world.

**Why:** Natural Earth's first-level subdivisions number roughly 4,600 worldwide. Drawn all at once at world zoom they are illegible for anything smaller than a US state, unhoverable on desktop, and hopeless on a phone. Two levels keep every country legible, make touch interaction natural (tap country, tap province), and let each country's detail load only when someone opens it.

**Alternatives considered:**
- *Flat composite with every subdivision:* rejected for legibility and payload size.
- *Flat composite with only the United States subdivided:* the original idea, rejected once scope grew to all countries.
- *Hybrid, pre-splitting only large countries (US, CA, AU, BR) at world level:* deferred. It is additive to the two-level design and can come later if seeing US states at a glance matters.

### D2. D3 + topojson-client, vendored, no tiles

**Choice:** Render SVG with D3 v7 and decode TopoJSON with topojson-client. Both library files are committed under `vendor/` and served from the GitHub Pages origin.

**Why:** A choropleth needs no street basemap, so a vector-only approach avoids any tile provider and its usage policy. D3 gives direct control over the zoom-to-country transition, the shared color scale, and per-path interaction, and choropleth patterns are extensively documented. Vendoring means the page has exactly one external runtime dependency (the Google CSV) and keeps working if a CDN changes paths.

**Alternatives considered:**
- *Apache ECharts:* built-in tooltip and legend, but still needs the same GeoJSON preparation, and its bundle is several times larger than D3. Less control over the drill-down transition.
- *Leaflet:* excellent with a tile basemap, which we do not want.
- *MapLibre GL:* needs vector tiles; far more machinery than the problem warrants.
- *CDN-hosted libraries with SRI hashes:* acceptable, but vendoring is one fewer moving part for a page whose only deploy mechanism is a commit.

### D3. Data via "Publish to web" CSV of one tab, fetched in the browser

**Choice:** The `Data` tab is published to the web as CSV. The page fetches that URL on load and parses it with D3's CSV parser. The URL lives in `config.js`.

**Why:** Publish-to-web exposes exactly one tab, needs no key, serves with permissive CORS headers, and is the least machinery that satisfies "edit the sheet, site updates." The lookup tabs never leave the sheet.

**Alternatives considered:**
- *Google Visualization query endpoint:* works but requires link-sharing the whole spreadsheet, exposing every tab.
- *Sheets API v4:* requires a Google Cloud project and an API key embedded in a public page.
- *GitHub Action that snapshots the sheet into `data.json`:* sturdier and keeps the sheet private, but adds a workflow and a delay. Held as a fallback if the publish endpoint proves flaky. The page reads a normalized row shape, so switching sources later does not touch the map code.

**Known behavior:** Google caches published output for roughly five minutes. Editors are told this in the sheet's setup notes.

### D4. The sheet computes codes; the page trusts them

**Choice:** The sheet carries three formula columns: `Country Code` (ISO 3166-1 alpha-2), `Subdivision Code` (ISO 3166-2 or a synthetic fallback, see D6), and `Region Code` (the subdivision code if present, else the country code). The page reads only `Organization` and `Region Code` (plus `Website` for future use). Name matching happens in the sheet via lookup tabs.

**Why:** Putting the match in the sheet gives editors instant feedback: a typed province that matches nothing leaves an empty code cell, and a conditional-format rule turns it red. The page stays simple and has no fuzzy-matching logic to maintain. It also means an editor can fix data without anyone touching code.

**Sheet mechanics:**
- `Country` is a dropdown fed from the canonical names in the `Countries` tab. `State / Province` is free text.
- Lookups use `ARRAYFORMULA` in the header row so new rows fill themselves. Keys are trimmed and case-insensitive.
- Alias rows in the lookup tabs (alternate names, English names, accent-stripped forms) let "Sao Paulo" resolve to `BR-SP` without diacritics.
- A bare country code is valid. The organization counts toward the country and appears in that country's view as "not assigned to a region."
- Red-cell rules: `State / Province` filled but `Subdivision Code` empty; or `Country` filled but `Country Code` empty (only possible for legacy free-typed rows).

**Alternatives considered:**
- *Match names in the page (strip accents, fuzzy match):* more forgiving, but editors would only learn of a miss by opening a browser console. Rejected.
- *Editors type ISO codes directly:* fragile and unfriendly. Rejected.
- *Dependent State dropdown filtered by Country:* Google Sheets needs a helper row per data row to do this. Deferred until typos prove to be a real problem.

### D5. Aggregation and counting rules in the page

- Header names are matched case- and whitespace-insensitively.
- A row is valid when `Organization` is non-empty and `Region Code` matches `^[A-Z]{2}(-[A-Z0-9~]{1,8})?$`. Invalid rows are skipped and listed in the console with their row numbers.
- Country total = distinct organizations whose region code starts with that country's alpha-2, whether bare or subdivided.
- Subdivision count = distinct organizations with exactly that subdivision code.
- Distinctness is by trimmed, case-folded organization name within a region, so two campuses of one organization in the same state count once and list once.
- `?debug=1` on the page URL reveals a data-health panel: invalid rows, unmatched codes (codes present in the sheet but absent from the boundary data), and totals. This is for editors and the developer, not for visitors.

### D6. Natural Earth boundaries, prepared with mapshaper, split per country

**Choice:** Admin-0 countries from Natural Earth 1:50m (v5.1.1 as served by naciscdn.org) become `data/world.json`, simplified to 10 % with Antarctica removed. Admin-1 states and provinces from Natural Earth 1:10m are simplified to 20 %, dissolved where several features share one ISO 3166-2 code, and split into one TopoJSON per country at `data/regions/<XX>.json`. A small `data/countries.json` manifest lists each country's name and whether it has subdivision data. A committed script under `tools/` performs the whole conversion with mapshaper and pins the Natural Earth version.

**Why:** Natural Earth is public domain and the only complete, freely licensed worldwide admin-1 dataset. Per-country splitting keeps the initial payload to the world outline; a visitor downloads only the countries they open. The spike (2026-09-07) settled the resolution: the 1:50m admin-1 file has only 294 features covering about ten large countries, so 1:10m is required. Simplification at 20 % keeps the largest country file (Russia) under 150 KB, and the world at 10 % is 108 KB. Antarctica is dropped because it has no organizations, wastes a third of the map height on an equal-area projection, and is the norm for choropleths.

**Identity rules applied by the script (from the spike's attribute analysis):**
- Country code: `ISO_A2_EH`, falling back to `ISO_A2`. This alone fixes Taiwan, Norway, Kosovo (`XK`), and France. Australia's two Indian Ocean territories also carry `AU`; features sharing a code are dissolved into one shape so hovering Christmas Island reads as Australia. Somaliland is merged into Somalia (`SO`) and Northern Cyprus into Cyprus (`CY`), following ISO 3166-1 rather than Natural Earth's de facto split. Siachen Glacier has no code and is drawn non-interactive.
- Admin-1 parentage comes from the admin-0 join on `adm0_a3`, not from the admin-1 file's own `iso_a2`, which disagrees for Tokelau and the territories above. Admin-1 features whose parent is absent from the 1:50m admin-0 file (Gibraltar, Clipperton, Coral Sea Islands, the Cyprus bases, Baikonur, Spratly, US minor islands, Guantanamo) are dropped and logged; none can be reached from the world map.
- Subdivision code: `iso_3166_2` when it matches `^[A-Z]{2}-[A-Z0-9]{1,3}$`. Otherwise a synthetic key `XX-~<diss_me>` from Natural Earth's numeric dissolve id, because `adm1_code` contains values like `ATA+00?`. 188 features need this, almost all in territories where Natural Earth already writes placeholder codes such as `XK-X02~`.
- Shared codes: 60 strict codes appear on more than one feature, in three patterns: exact duplicates (Parwan twice), a province plus a city inside it (Cork county and Cork city, Cebu province and Cebu city), and a coarser ISO level than Natural Earth draws (Madagascar's 22 regions onto 6 ISO provinces, Bosnia's cantons onto `BA-BIH`, Dublin's four councils onto `IE-D`). Features sharing a strict code are dissolved into one shape. The display name is the largest constituent's name unless a small manual table supplies the ISO-level name (Madagascar's six provinces, `BA-BIH`, `IE-D`, `IE-TA`, `PH-MNL`). Every constituent name becomes an alias in the `Subdivisions` seed, so an editor typing "Fingal" still resolves to `IE-D`.
- Properties kept per feature: `code`, `name`, `country`. Everything else is dropped to save bytes.

**Size budgets (measured by the spike, enforced by the validation script):** `world.json` at most 150 KB (measured 108 KB); each `regions/<XX>.json` at most 250 KB (measured max 146 KB); median regions file at most 50 KB (measured 6 KB). All 251 regions files together are about 2.7 MB in the repository, of which a visitor downloads only what they open.

**Alternatives considered:**
- *world-atlas / us-atlas npm packages:* excellent for countries and US states but do not cover admin-1 worldwide.
- *One combined admin-1 file loaded lazily:* simpler build, but multiple megabytes for a visitor who opens one country. Rejected.
- *GeoJSON instead of TopoJSON:* several times larger for the same shapes.

### D7. Lookup seeds generated from the boundary data

**Choice:** The same script emits `sheet/Countries.csv` and `sheet/Subdivisions.csv`. Each has canonical rows (used for dropdowns) and alias rows (used for lookups), with a `Canonical` flag. Aliases include Natural Earth's alternate and English names plus accent-stripped variants of every name. Keys are unique per (country, name).

**Why:** If the sheet's lookup and the map's shapes come from the same records in the same run, a match in the sheet is guaranteed to be a shape on the map. Regenerating one without the other is the failure mode, so the script always writes both, and the `Subdivisions` tab header carries the Natural Earth version it was generated from.

### D8. View state, projection, and interaction model

- **State machine:** `world` and `country(XX)`. The current country is reflected in the URL hash so a view can be linked and the browser back button works within the frame.
- **Projection:** Equal Earth at world level, so shaded areas are not distorted by projection. At country level, the projection is rotated to the country's centroid and fitted to its bounds with padding, which handles countries straddling the antimeridian (Russia, Fiji, the United States with the Aleutians). The world layer stays visible beneath at low opacity for context.
- **Pointer devices:** hover shows a floating tooltip (name, count, up to ten organization names, then "and N more"). Click on a country with at least one organization drills in. Escape or the back control returns to the world.
- **Touch or narrow screens** (detected by the `(hover: none)` media query or a viewport under 700 px): tap selects and fills a sticky panel below the map with the full scrollable list; the panel offers a "View regions" button to drill in. Tapping empty map space clears the selection. Two-step drilling avoids accidental zooms.
- **Empty countries** (zero organizations) and countries with no subdivision data show a tooltip or panel entry but do not drill.
- **Color:** one `scaleThreshold` shared by both levels so a color means the same count everywhere. Default breaks `[1, 2, 4, 8, 16]` over a five-step sequential palette; zero is a neutral light gray. Breaks live in `config.js` and will be tuned once real counts are known. A legend below the map shows the ranges.
- **Accessibility:** interactive regions are focusable with `aria-label` "Kenya, 7 organizations"; Enter drills; the panel is an `aria-live` region; transitions respect `prefers-reduced-motion`; tooltip and panel text meet 4.5:1 contrast.

### D9. Embed via iframe with an inline `clamp()` height

**Choice:** The Tithely snippet is a single `<iframe>` with `width="100%"`, `style="height: clamp(360px, 70vh, 720px); border: 0"`, `loading="lazy"`, and a `title`. No script is required in the block. Inside the frame the layout is designed to fit: map on top, legend, and on narrow screens a scrollable panel of bounded height.

**Why:** We do not know whether Tithely allows scripts in an embed block, so the default path must not need one. A fixed aspect ratio starves phones (a 16:10 frame at 360 px wide is 225 px tall), while `clamp()` with a viewport-height middle term gives phones a tall frame and desktops a bounded one using only an inline style.

**Optional enhancement:** the page posts `{ type: "org-heatmap:height", height }` to its parent on resize. If Tithely does allow a script in the block, a three-line listener can size the iframe exactly. Not required.

**Hosting:** GitHub Pages from the `main` branch root, with a `.nojekyll` file so nothing is preprocessed. GitHub Pages sends no frame-blocking headers, both origins are HTTPS, and the Google CSV endpoint permits any origin, so the frame works without special configuration.

### D10. Repository layout and tooling

```
index.html                 page shell
app.js                     page logic (ES module)
styles.css
config.js                  sheet CSV URL, color breaks, labels, tooltip cap
vendor/                    d3.v7.min.js, topojson-client.min.js
data/world.json            admin-0, generated
data/countries.json        manifest, generated
data/regions/<XX>.json     admin-1 per country, generated
sheet/Countries.csv        lookup seed, generated
sheet/Subdivisions.csv     lookup seed, generated
sheet/README.md            sheet setup: import tabs, formulas, dropdown, red rule, publish
tools/prep-boundaries.mjs  download Natural Earth, run mapshaper, write data/ and sheet/
tools/validate-data.mjs    parse every file, check codes, uniqueness, size budgets
tools/package.json         mapshaper as a dev dependency
.nojekyll
README.md
```

Node.js LTS is needed only on the developer machine for the tools. The page has no build step. Local testing uses any static file server.

## Risks / Trade-offs

- **Google changes or un-publishes the CSV endpoint** → The page shows a clear "data unavailable" message over a gray map instead of an empty one; the sheet README documents re-publishing; the GitHub Action snapshot remains a ready fallback.
- **Natural Earth lags real-world subdivision changes** (Kenya's 2013 counties, Nepal's 2015 provinces) → Editors may not find their region; the bare country code still counts correctly. Aliases can be added to the `Subdivisions` tab by hand, and the Natural Earth version is pinned so an upgrade is a deliberate, tested step.
- **Subdivisions without ISO 3166-2 codes** → Synthetic keys keep them joinable. The risk is regenerating data and lookups separately; mitigated by one script that always writes both and stamps the version in the tab header.
- **Boundary data and sheet lookups drift** → Same mitigation: regenerate together, re-import the `Subdivisions` tab, run the validation script.
- **Disputed borders** (Crimea, Kashmir, Taiwan, Western Sahara) → Natural Earth's default is a de facto view. Review the rendered map before launch; Natural Earth 5.x carries per-country point-of-view fields that the script can select if a different depiction is wanted.
- **Territories vs. countries** (Puerto Rico, Greenland, Hong Kong appear as their own admin-0 units) → Editors pick from the Country dropdown, which lists what the map knows, so the choice is consistent. The sheet README calls this out.
- **Antimeridian and far-flung territories** → Rotated projection fit handles bounds; the United States will render wide because of Alaska and Hawaii. An Albers-USA special case is an open question.
- **Very large per-country files** (Russia, Canada, Indonesia coastlines) → Measured: the worst is 146 KB at 20 % simplification. Budgets are enforced by the validation script so a future Natural Earth upgrade cannot silently regress.
- **Dissolving shared ISO codes hides Natural Earth detail** (a Philippine city merges into its province; Madagascar shows 6 provinces, not 22 regions) → This matches what ISO 3166-2 defines and what an editor can look up. All constituent names remain as aliases, so nothing an editor types stops matching.
- **Tiny places absent from the 1:50m country file** (Gibraltar is the only inhabited one) → Cannot appear in the Country dropdown. Accepted; revisit only if an organization there is added.
- **Tithely strips scripts** → The design needs none. Only the optional height message would be lost.
- **Phone frame height** → `clamp()` inline height plus an internal layout that scrolls the panel rather than growing the page.
- **Five-minute publish cache confuses editors** → Documented in the sheet README with the expectation set.
- **Busy regions** → Tooltip capped at ten names with a count; the panel shows the full scrollable list.
- **Two different organizations with the same name in one region are merged** → Accepted; editors can disambiguate names if it ever occurs.
- **Public repository** → Nothing in the repo is sensitive; the published tab must never gain a private column. The README states this.

## Migration Plan

1. **Spikes first.** Confirm a Tithely embed block renders an iframe from an external HTTPS origin. Measure Natural Earth admin-1 output sizes at 1:50m and 1:10m after simplification and count subdivisions lacking ISO codes. Adjust D6 if needed.
2. **Generate data.** Run the prep script; commit `data/`, `sheet/`, and the version stamp. Run the validation script.
3. **Prepare the sheet.** Import `Countries` and `Subdivisions` as new tabs. Add the three code columns with formulas, the Country dropdown, and the red-cell rules to the existing data tab. Existing rows are untouched; rows that turn red get a one-time cleanup. Publish only the `Data` tab as CSV and paste the URL into `config.js`.
4. **Build and test locally** against the real sheet with a static file server, on desktop and a phone-sized viewport.
5. **Publish.** Push to a new public GitHub repository, enable Pages from `main` root, confirm the page loads at the Pages URL and fetches the sheet.
6. **Embed.** Add the iframe snippet to an unpublished or staging Tithely page, verify on desktop and mobile, then move it to the live page.

**Rollback:** remove the embed block from Tithely. The sheet changes are additive (new columns and tabs) and can stay or be deleted independently. The repository can be made private or removed without affecting anything else.

## Open Questions

- **United States projection:** rotated fit (Alaska and Hawaii make the mainland small) or a dedicated Albers-USA composite for that one country (Puerto Rico then needs its own handling)? Decide after seeing the rotated fit.
- **Color breaks:** the defaults assume small counts. Need the total organization count and the largest single-region count to set breaks that read well.
- **Tithely embed block behavior** (task 1.1, needs someone in the Tithely admin): does an external iframe render, does its inline `style` survive, and does a `<script>` in the block run? The design assumes iframe yes, style yes, script no. Only the optional height listener depends on the answer.
- **Disputed-border depiction:** the script follows ISO 3166-1 for Somaliland and Northern Cyprus and leaves Natural Earth's default elsewhere (Taiwan, Kosovo, Western Sahara, and Palestine all have ISO codes and stay as drawn; Crimea and Kashmir follow Natural Earth). Review the rendered world before launch.
- **GitHub account:** personal or organizational, and the repository name, which determines the Pages URL.
- **Website column:** captured now; whether to surface it as a link in the panel is a cheap follow-up.
