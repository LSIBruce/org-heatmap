## 1. Spikes (resolve before committing to the data design)

- [ ] 1.1 Tithely embed (USER ACTION, not blocking): place a test `<iframe>` pointing at any external HTTPS page in an embed block on an unpublished Tithely page; record whether the frame renders, whether inline `style` survives, and whether a `<script>` in the block executes. Note findings in design.md Open Questions.
- [x] 1.2 Natural Earth admin-1 measurement: download 1:50m and 1:10m admin-1 states/provinces, run a trial mapshaper simplify and per-country split for both, and record total size, median and max per-country size, and how many countries are missing or incomplete at 1:50m. (See `spike-results.md`: 1:50m has 294 features, unusable; 1:10m at 20 % gives median 6 KB, max 146 KB.)
- [x] 1.3 ISO code coverage: count admin-1 features whose `iso_3166_2` is blank, `-99`, or malformed, grouped by country, and count admin-0 features whose `ISO_A2` and `ISO_A2_EH` are both placeholders. Decide the override table entries. (188 non-strict admin-1 codes, 60 shared codes; admin-0 needs no override table beyond `ISO_A2_EH` plus the SO and CY merges.)
- [x] 1.4 Update design.md D6 (resolution choice, size budgets) and the Open Questions from the spike results.

## 2. Repository scaffold

- [x] 2.1 Initialize git in `D:\prototypes\heat-map-webpage`, add `.gitignore` (node_modules, tools/tmp, downloaded archives), `.nojekyll`, and a stub `README.md`.
- [x] 2.2 Create `tools/package.json` with mapshaper as a dev dependency and `prep` and `validate` scripts; install and confirm `npx mapshaper -v` runs. (mapshaper 0.6.121)
- [x] 2.3 Vendor `d3.v7.min.js` and `topojson-client.min.js` into `vendor/` with a `vendor/LICENSES.md` noting versions and licenses. (D3 7.9.0, topojson-client 3.1.0, both ISC)
- [x] 2.4 Create `config.js` exporting `sheetCsvUrl`, `colorBreaks` (default `[1, 2, 4, 8, 16]`), `palette`, `tooltipNameCap` (10), `narrowBreakpointPx` (700), and `title`. (Exposed as `window.ORG_HEATMAP_CONFIG`, plus data paths.)

## 3. Boundary preparation script (`tools/prep-boundaries.mjs`)

- [x] 3.1 Download the pinned Natural Earth 5.1.1 admin-0 (1:50m) and admin-1 (1:10m) archives from naciscdn.org into `tools/tmp/`, skipping if already present, and record the version in a `tools/ne-version.json`.
- [x] 3.2 Admin-0 pass: resolve each country's `code` via `ISO_A2_EH`, then `ISO_A2`; remap `SOL` to `SO` and `CYN` to `CY`; drop Antarctica; dissolve features sharing a code; set `interactive` false where unresolved; keep only `code`, `name`, `interactive`; write TopoJSON to `data/world.json` at 10 % simplification within the 150 KB budget.
- [x] 3.3 Admin-1 pass: join `adm0_a3` to the admin-0 alpha-2 (dropping and logging features with no interactive parent); resolve each feature's `code` as `iso_3166_2` when it matches `^[A-Z]{2}-[A-Z0-9]{1,3}$`, else synthetic `<XX>-~<diss_me>`; sort by area descending and dissolve on `code` so the largest constituent's name wins, collecting all constituent names; apply the ISO-level name override table (`MG-A` Toamasina, `MG-D` Antsiranana, `MG-F` Fianarantsoa, `MG-M` Mahajanga, `MG-T` Antananarivo, `MG-U` Toliara, `BA-BIH` Federation of Bosnia and Herzegovina, `IE-D` Dublin, `IE-TA` Tipperary, `PH-MNL` Metro Manila); keep only `code`, `name`, `country`; simplify 20 %; split by country into `data/regions/<XX>.json`.
- [x] 3.4 Skip writing a regions file for any country with fewer than two admin-1 features and record that in the manifest.
- [x] 3.5 Write `data/countries.json` with `code`, `name`, `hasRegions` for every interactive country.
- [x] 3.6 Emit `sheet/Countries.csv` with header stamp row, then canonical rows (display name, alpha-2, `Canonical`=TRUE) and alias rows from `NAME`, `NAME_LONG`, `ADMIN`, `FORMAL_EN`, plus accent-stripped variants and a small hand-maintained alias list (e.g. "United States", "USA", "UK").
- [x] 3.7 Emit `sheet/Subdivisions.csv` with header stamp row and rows of `Country Code`, `Name`, `Code`, `Canonical`, `Key` (lower-cased `country|name`), including aliases from `name`, `name_en`, `name_alt` (split on `|`), `gn_name`, `woe_name`, and accent-stripped variants; de-duplicate on `Key`.
- [x] 3.8 Run the script end to end from a clean `tools/tmp/` and commit `data/`, `sheet/*.csv`, and `tools/ne-version.json`.

## 4. Validation script (`tools/validate-data.mjs`)

- [x] 4.1 Parse `data/world.json`, `data/countries.json`, and every `data/regions/*.json`; fail on parse errors or duplicate codes within a file.
- [x] 4.2 Cross-check: every code in `sheet/Subdivisions.csv` exists in exactly one regions file; every `hasRegions` flag matches the presence of a regions file; every canonical country in `sheet/Countries.csv` is interactive in `world.json`.
- [x] 4.3 Enforce size budgets (world 150 KB, regions max 250 KB, regions median 50 KB) and print a summary of counts; exit non-zero on any failure.
- [x] 4.4 Run validation on the committed data and fix any findings.

## 5. Google Sheet setup (documented in `sheet/README.md`, performed in the live sheet)

- [x] 5.1 Write `sheet/README.md`: import steps for the two lookup tabs, the three formula columns with exact `ARRAYFORMULA` text, the Country dropdown range (a helper range filtered to `Canonical`=TRUE), the two red-cell conditional-format rules, the publish-to-web steps for the `Data` tab only, the five-minute cache note, the territories note (Puerto Rico, Greenland, Hong Kong are countries in the dropdown), and the "no private columns" rule.
- [x] 5.2 Import `Countries.csv` and `Subdivisions.csv` as new tabs in the live sheet; verify the stamp row is present. (Done inside the generated workbook `Waterbrooke Missionary Data (map-ready).xlsx` on 2026-09-07; takes effect once it is uploaded and saved as a Google Sheet. The working tab keeps its name; a derived `Data` tab is what gets published.)
- [x] 5.3 Rename or add columns on the data tab so the header row matches the schema: `Organization`, `Country`, `State / Province`, `Country Code`, `Subdivision Code`, `Region Code`, `Website`, `Notes`; rename the tab to `Data`. (Done inside the generated workbook `Waterbrooke Missionary Data (map-ready).xlsx` on 2026-09-07; takes effect once it is uploaded and saved as a Google Sheet. The working tab keeps its name; a derived `Data` tab is what gets published.)
- [x] 5.4 Add the `Country Code`, `Subdivision Code`, and `Region Code` array formulas; confirm a new row at the bottom fills itself. (Done inside the generated workbook `Waterbrooke Missionary Data (map-ready).xlsx` on 2026-09-07; takes effect once it is uploaded and saved as a Google Sheet. The working tab keeps its name; a derived `Data` tab is what gets published.)
- [x] 5.5 Add the Country dropdown validation and the two red-cell rules; walk the existing rows and clean any red cells (retype country from the dropdown, correct or blank unmatched provinces). (Done inside the generated workbook `Waterbrooke Missionary Data (map-ready).xlsx` on 2026-09-07; takes effect once it is uploaded and saved as a Google Sheet. The working tab keeps its name; a derived `Data` tab is what gets published.)
- [x] 5.6 Publish only the `Data` tab as CSV; paste the URL into `config.js`; fetch it once from a browser on another origin and confirm the header row and CORS. (Published 2026-09-07; verified: Data tab only, 15 rows, no private columns, CORS allowed from lsibruce.github.io, Cache-Control max-age=300. URL is in config.js.)

## 6. Page: data layer (`app.js`)

- [x] 6.1 Create `index.html` with the map container, back control, legend container, panel container, hidden debug container, and script tags for vendor libraries, `config.js`, and `app.js`.
- [x] 6.2 Load `data/world.json`, `data/countries.json`, and the sheet CSV in parallel; render a gray world with the data-unavailable message if the CSV fails, and a "no organizations found" message if it yields zero valid rows.
- [x] 6.3 Parse the CSV with header matching that is case- and whitespace-insensitive; validate rows against the `Organization` and `Region Code` rules; collect invalid rows with row numbers and reasons.
- [x] 6.4 Aggregate distinct organizations (trimmed, case-folded) per country (bare and subdivided rows) and per subdivision; keep a per-country list of unassigned organizations; keep a list of region codes not present in the boundary data.
- [x] 6.5 Log invalid rows and unmatched codes to the console; render the debug data-health panel only when `?debug=1` is present.

## 7. Page: world level

- [x] 7.1 Render `world.json` with an Equal Earth projection into a viewBox-scaled SVG; fill interactive countries through a `scaleThreshold` from `config.js`; non-interactive shapes gray and inert.
- [x] 7.2 Render the legend from the same scale with bands labeled as ranges, zero as its own neutral swatch.
- [x] 7.3 Implement the hover tooltip for pointer devices: name, count, up to `tooltipNameCap` names sorted alphabetically, "and N more"; "No organizations" for zero.
- [x] 7.4 Implement touch/narrow mode (`(hover: none)` or width under `narrowBreakpointPx`): tap selects and fills the panel with the full scrollable list; tap on empty space clears; panel height bounded so the page does not grow.
- [x] 7.5 Make interactive regions focusable with `aria-label` "<name>, <count> organizations"; mark the panel `aria-live="polite"`.

## 8. Page: country level and navigation

- [x] 8.1 On click (pointer) or "View regions" (touch) for a country with count > 0 and `hasRegions` true, fetch `data/regions/<XX>.json` once, cache it in memory, and set the hash to `#<XX>`.
- [x] 8.2 Zoom transition: rotate the projection to the country centroid, fit to its bounds with padding, and animate; respect `prefers-reduced-motion`; keep the world layer faintly visible beneath.
- [x] 8.3 Render subdivisions with the shared scale and the same tooltip and panel behavior as the world level; show a header line "<N> not assigned to a region" with names when bare-country organizations exist.
- [x] 8.4 Back control, Escape key, and `hashchange` all return to the world; focus moves to the back control on drill and back to the country on return.
- [x] 8.5 Deep link: on load with a hash, render the country level directly once data is ready.
- [x] 8.6 Empty countries and countries without regions never drill; the panel omits "View regions" for them.
- [x] 8.7 Verify antimeridian countries (Russia, Fiji, United States) render contiguously at the country level; note the United States appearance for the Albers-USA open question. (Verified 2026-09-07: Russia and Fiji contiguous via rotated fit; the US renders wide because of Alaska and Hawaii, Albers-USA remains an open question.)

## 9. Page: layout, styling, embed readiness

- [x] 9.1 `styles.css`: map fills container width with a readable max width, legend below, panel below on narrow screens, no horizontal scroll at 360 px; tooltip and panel text at 4.5:1 contrast.
- [x] 9.2 Post `{ type: "org-heatmap:height", height }` to `window.parent` on load and on resize; no-op when not framed. (Verified with test/embed.html: the page posted a 543 px preferred height into a 560 px clamp frame.)
- [x] 9.3 Confirm no `data/regions/*.json` request is made before a drill (network tab).

## 10. Local verification

- [x] 10.1 Serve the repo root with a static server and test against the live sheet on desktop: hover, click drill, back, Escape, deep link, legend.
- [x] 10.2 Test at a 360 px viewport with touch emulation: tap panel, "View regions", back, panel scroll, no horizontal scroll.
- [x] 10.3 Test the data-unavailable path by pointing `config.js` at a bad URL, and the zero-rows path with an empty published tab copy. (Bad URL and header-only CSV both verified; config.js restored to an empty sheetCsvUrl.)
- [x] 10.4 Open with `?debug=1` and confirm invalid rows and unmatched codes are listed; open without it and confirm the panel is hidden.
- [x] 10.5 Review the rendered world for disputed-border depiction and decide whether to keep Natural Earth's default. (World reviewed at 1:50m; Natural Earth default kept except the Somaliland and Northern Cyprus merges. Tiny island groups such as Fiji render angular at 20 % simplification; accepted.)

## 11. Publish to GitHub Pages

- [x] 11.1 Create the public GitHub repository (account and name per Open Questions); push `main`. (`LSIBruce/org-heatmap`, created via the GitHub API with the stored credential, 2026-09-07.)
- [x] 11.2 Enable GitHub Pages from `main` root; confirm the Pages URL loads, fetches the sheet, and serves `data/regions/KE.json` with a 200. (Verified 2026-09-07: index, config.js, data/world.json and data/regions/KE.json all 200 at https://lsibruce.github.io/org-heatmap/; no X-Frame-Options header.)
- [x] 11.3 Write `README.md`: what the map is, how data flows, how to regenerate boundaries (`npm run prep`, `npm run validate`), the "regenerate data and re-import Subdivisions together" rule, the config options, and the embed snippet with the optional height listener.

## 12. Embed in Tithely and smoke

- [ ] 12.1 Paste the iframe snippet into an embed block on an unpublished Tithely page.
- [ ] 12.2 Desktop smoke inside Tithely: renders, hover tooltip, click drill, back, no console errors (frame, mixed content, CORS).
- [ ] 12.3 Mobile smoke inside Tithely on a real phone: frame height at least 360 px, tap panel, "View regions", back, panel scrolls without growing the page.
- [ ] 12.4 If the spike showed scripts are allowed, add the height listener and confirm the frame resizes; otherwise confirm the clamp height is acceptable.
- [ ] 12.5 Move the block to the live page; record the smoke results here.

## 13. Wrap-up

- [x] 13.1 Tune `colorBreaks` against real counts (total organizations and largest single region) and update the legend check. (Set to [1, 2, 3, 5, 8] on 2026-09-07: 14 placed entries, most regions 1, Minnesota 2, the US 4.)
- [ ] 13.2 Resolve or carry forward the Open Questions in design.md (US projection, resolution, disputed borders, Website link).
- [ ] 13.3 Final `npm run validate`, commit, and confirm the Pages deployment matches `main`.
