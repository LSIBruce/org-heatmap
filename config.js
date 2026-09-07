// Organization Heatmap configuration.
// Everything an editor or maintainer might need to change lives here.
// The page code (app.js) reads these values and never needs editing for them.

window.ORG_HEATMAP_CONFIG = {
  // Published-to-web CSV URL of the Google Sheet's "Data" tab.
  // File > Share > Publish to web > choose the "Data" tab > "Comma-separated values (.csv)".
  // Leave as an empty string until the sheet is published; the page shows a
  // "data unavailable" message in that case instead of an empty map.
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRhQ0VXtqKoXDdnG9KSH9mIFq_B72oGp8yLYwKZn5xYBZqIOLOrH0kIMFB6-9yPO0fCmiLxherfG0SP/pub?gid=1735613454&single=true&output=csv",

  // Title shown above the map and used as the page <title>.
  title: "Where Our Partner Organizations Are",

  // Color scale breaks for the organization count. A region with a count of
  // at least breaks[i] and less than breaks[i+1] gets palette[i+1]. Zero is
  // always palette[0]. Five breaks means six bands: 0, 1, 2, 3-4, 5-7, 8+.
  // Tuned 2026-09-07 to the real data (most regions 1, a few 2, the US 4);
  // widen the upper breaks as the list grows.
  colorBreaks: [1, 2, 3, 5, 8],

  // Six colors: the first is the neutral "zero" fill, the rest form a
  // sequential ramp from light to dark. Multi-hue sequential (yellow to deep
  // red) reads well for counts and stays distinguishable for common forms of
  // color-vision deficiency.
  palette: ["#e6e6e6", "#fee8c8", "#fdbb84", "#fc8d59", "#e34a33", "#b30000"],

  // Maximum organization names listed in the hover tooltip before
  // "and N more". The tap panel always shows the full list.
  tooltipNameCap: 10,

  // Viewports narrower than this (in CSS pixels) use the tap panel layout
  // even on devices that support hover.
  narrowBreakpointPx: 700,

  // Relative paths to the generated boundary data.
  worldPath: "data/world.json",
  countriesPath: "data/countries.json",
  regionsPathTemplate: "data/regions/{code}.json",
};
