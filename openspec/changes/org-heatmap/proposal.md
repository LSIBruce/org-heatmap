## Why

A ministry network needs to show where its partner organizations are, at a glance, on its Tithely-hosted website. The organization list already lives in a Google Sheet that non-technical staff maintain; there is no map, and every commercial map-embed product either costs a subscription or locks the data behind an account. This change delivers an interactive choropleth heatmap (organization count per region, with names on hover or tap) that reads the sheet directly, runs on open-source libraries and public-domain boundary data, is hosted for free on GitHub Pages, and drops into a Tithely embed block.

## What Changes

- **New static web page** (`index.html` + assets) that renders a two-level choropleth: the world shaded by organizations per country, and on selecting a country, that country shaded by organizations per state/province. Built with D3 and TopoJSON; no map tiles, no API keys, no build step for the page itself.
- **Live data from Google Sheets.** The page fetches the published-to-web CSV of one sheet tab on load, aggregates organizations by region code, and renders. Edits to the sheet appear on the site within Google's publish cache window (about five minutes) with no redeploy.
- **Region codes as the join key.** Countries are identified by ISO 3166-1 alpha-2 (`BR`), subdivisions by ISO 3166-2 (`US-TX`, `CA-ON`, `KE-30`). A bare country code is valid and counts toward the country only.
- **A defined sheet schema** with a human-edited `Data` tab and two generated lookup tabs (`Countries`, `Subdivisions`) that fill the code columns by formula, validate the Country column with a dropdown, and flag unmatched State/Province names with a red cell. The lookup tabs are seeded from the same Natural Earth file the map draws, so a match in the sheet is a match on the map by construction.
- **A one-time data-prep step** (committed script + committed outputs) that converts Natural Earth admin-0 and admin-1 boundaries into a small world topology, one per-country subdivision topology loaded on demand, and the CSV seeds for the two lookup tabs (including accent-stripped name aliases).
- **Mobile-first interaction.** Hover shows a floating tooltip on pointer devices; on touch devices a tap shows a sticky details panel below the map. Selecting a country zooms into it; a back control returns to the world.
- **Hosting and embed.** Public GitHub repository served by GitHub Pages; embedded in Tithely via an `<iframe>` in an embed block, sized either by fixed aspect ratio or by a height message posted from the frame.

## Capabilities

### New Capabilities
- `sheet-data-source`: the Google Sheet contract and its consumption. Tab and column schema, lookup-tab seeding and formulas, dropdown and red-cell validation, publish-to-web CSV configuration, in-page CSV parsing, region-code normalization, aggregation to counts and name lists per region, handling of unmatched and bare-country rows, and the data-unavailable state.
- `region-boundaries`: the boundary data pipeline. Natural Earth admin-0 and admin-1 sourcing, mapshaper conversion to a world topology and per-country subdivision topologies, ISO code assignment and fallback for shapes lacking codes, generation of the `Countries` and `Subdivisions` seed CSVs with aliases, file-size budgets, and the reproducible rebuild procedure.
- `heatmap-view`: the rendered map and its behavior. World and country levels, shared threshold color scale and legend, hover tooltip and tap panel with organization names, drill-down and back navigation, on-demand loading of a country's subdivisions, empty-country handling, responsive layout for narrow screens, and accessibility basics (keyboard focus, readable contrast).
- `site-embed`: delivery to the website. GitHub Pages configuration on a public repository, the Tithely embed-block iframe snippet, iframe sizing strategy, and the smoke procedure that confirms the map renders inside Tithely on desktop and mobile.

### Modified Capabilities
<!-- None. Greenfield project. -->

## Impact

- **New repository** at `D:\prototypes\heat-map-webpage` (prototype), to be pushed to a new public GitHub repository with GitHub Pages enabled. Repository visibility is public by decision; all data shown on the map is public by nature.
- **Google Sheet changes:** the existing organization sheet gains three computed columns on its data tab (Country Code, Subdivision Code, Region Code), a dropdown on Country, a conditional-format rule on State/Province, and two new lookup tabs. Only the `Data` tab is published to the web; the lookup tabs never leave the sheet. Existing rows are preserved; rows whose country or subdivision names don't match the lookups surface as red cells for a one-time cleanup.
- **Runtime dependencies:** the browser fetches one Google Sheets CSV URL at page load. If that URL is unreachable or the tab is un-published, the page shows a data-unavailable message rather than an empty map. Everything else (D3, TopoJSON client, boundary files) is served from the GitHub Pages origin or a CDN and is fully static.
- **Open-source and cost posture:** D3 (ISC), topojson-client (ISC), mapshaper (MPL-2.0, build-time only), Natural Earth boundaries (public domain). GitHub Free with Pages on a public repo, Google Sheets on an existing account. No paid tiers, keys, or subscriptions.
- **Tithely:** one embed block on one page receives an iframe snippet. No theme or template changes. The embed block's iframe support is confirmed by an early spike task before the page work is finalized.
- **Out of scope for this change:** pre-splitting large countries at the world level (US, Canada, Australia, Brazil as states at world zoom), dependent State/Province dropdowns in the sheet, density heatmaps from lat/lng points, search or filtering, clicking an organization to visit its website (the Website column is captured but not yet surfaced), scheduled data snapshots via GitHub Actions, and analytics. Each is a deliberate follow-up if wanted.
