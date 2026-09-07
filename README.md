# Organization Heatmap

An interactive map of where partner organizations are. The world is shaded by how many organizations are in each country; selecting a country zooms in and shades its states or provinces. Hovering (or tapping, on a phone) shows the organization names. The data comes live from a Google Sheet, so editing the sheet updates the map within a few minutes with no redeploy.

Everything is open source or public domain and there is nothing to pay for: D3 and topojson-client for rendering, Natural Earth for boundaries, GitHub Pages for hosting, and a Google Sheet as the data source.

## How it fits together

```
Google Sheet  ──publish to web (CSV)──▶  browser fetch  ──▶  index.html + app.js (D3)
                                                                     │
                     data/world.json, data/countries.json  ◀─────────┤  loaded at start
                     data/regions/<XX>.json                ◀─────────┘  loaded when a country is opened

Tithely page  ──<iframe>──▶  GitHub Pages serves this repository
```

- **The sheet** has one row per organization per region. Two formula columns turn the typed country and state/province into ISO codes, and a third combines them into the `Region Code` the map uses (`US-TX`, `CA-ON`, `KE`). Setup is in [`sheet/README.md`](sheet/README.md).
- **The page** is static. `index.html`, `styles.css`, `app.js`, and `config.js` at the root, with the libraries in `vendor/`. No build step.
- **The boundaries** under `data/` are generated from Natural Earth by `tools/prep-boundaries.mjs`, together with the two lookup CSVs under `sheet/` that seed the sheet's lookup tabs. Because both come from the same records in the same run, a name that matches in the sheet is guaranteed to be a shape on the map.

## Configuration (`config.js`)

| Key | What it does |
|---|---|
| `sheetCsvUrl` | The published CSV URL of the sheet's `Data` tab. Empty means "no data source yet" and the page says so. |
| `title` | Heading above the map and the browser tab title. |
| `colorBreaks` | Thresholds for the color bands. The current `[1, 2, 3, 5, 8]` gives bands 0, 1, 2, 3–4, 5–7, 8+; widen them as the list grows. |
| `palette` | Six colors: the neutral zero fill, then five sequential shades. |
| `tooltipNameCap` | How many names the hover tooltip lists before "and N more". The tap panel always lists all of them. |
| `narrowBreakpointPx` | Below this viewport width the tap panel is used instead of the hover tooltip. Touch-only devices always use the panel. |

Changing any of these is a commit to `config.js`; nothing else needs editing.

## Embedding in the website

The page is live at <https://lsibruce.github.io/org-heatmap/>. The Tithely embed block accepts both HTML and scripts (confirmed 2026-09-07), so the snippet is the iframe plus a small listener that sizes the frame to the map's preferred height:

```html
<iframe
  id="org-heatmap"
  src="https://lsibruce.github.io/org-heatmap/"
  title="Map of partner organizations by country and region"
  width="100%"
  style="height: clamp(360px, 70vh, 720px); border: 0; display: block;"
  loading="lazy"></iframe>
<script>
  (function () {
    var frame = document.getElementById("org-heatmap");
    window.addEventListener("message", function (ev) {
      if (ev.origin !== "https://lsibruce.github.io") return;
      if (!ev.data || ev.data.type !== "org-heatmap:height") return;
      var h = Number(ev.data.height);
      if (frame && h >= 300 && h <= 2000) frame.style.height = h + "px";
    });
  })();
</script>
```

How it works: the inline `clamp()` height is what the frame has until the map loads. The map then posts `{ type: "org-heatmap:height", height }` to the parent page on load, on resize, and when it drills into a country or back, and the listener applies that height. The origin check means only messages from the map's own domain are honoured. If the script is ever removed, the iframe alone still works at the `clamp()` height; the map lays itself out to fit whatever height it gets, and on narrow screens the organization list scrolls inside the frame.

`test/embed.html` is a local stand-in for the site page that runs the same listener against a local copy of the map.

Deep links work: `…/#KE` opens the map already zoomed into Kenya.

## Checking the data

Open the page with `?debug=1` appended to its URL. A data-health box lists rows the map skipped and why, and any region codes in the sheet that have no shape on the map. Skipped rows are also logged to the browser console.

## Regenerating the boundary data

Only needed when Natural Earth publishes a new release or when the alias lists in `tools/prep-boundaries.mjs` change.

```
cd tools
npm install
npm run prep        # downloads Natural Earth, writes data/ and sheet/*.csv, stamps tools/ne-version.json
npm run validate    # checks codes, consistency and size budgets; exits non-zero on any problem
```

Then commit `data/`, `sheet/*.csv`, and `tools/ne-version.json` together, and **re-import both lookup tabs** (`Countries` and `Subdivisions`) into the sheet. Regenerating the map data without re-importing the tabs, or the other way round, is the one way to make names stop matching.

What the preparation does, in short: Natural Earth 1:50m countries become `data/world.json` (Antarctica removed, features sharing an ISO code dissolved, Somaliland and Northern Cyprus folded into Somalia and Cyprus per ISO 3166-1). Natural Earth 1:10m states and provinces become one file per country under `data/regions/`, keyed by ISO 3166-2 where Natural Earth has a strict code and by a stable synthetic code otherwise, with features that share a code dissolved into one shape. Details and the measured sizes are in `openspec/changes/org-heatmap/`.

## Local development

Serve the repository root with any static file server, for example:

```
python -m http.server 8765
```

then open `http://localhost:8765/`. `test/sample-data.csv` is a fixture that exercises every data rule (duplicates, unassigned rows, invalid rows, codes with no shape); point `sheetCsvUrl` at `test/sample-data.csv` to use it.

## Licenses

- Code in this repository: no license file has been chosen yet. MIT is the usual choice for a small public page like this; add a `LICENSE` file once decided.
- D3 7.9.0 and topojson-client 3.1.0: ISC, see `vendor/LICENSES.md`.
- Boundary data: derived from [Natural Earth](https://www.naturalearthdata.com/), public domain. Version recorded in `tools/ne-version.json`.

## Public data notice

This repository is public and so is everything the published `Data` tab contains. Do not add columns to that tab that should not be on the internet.
