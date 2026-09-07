# Setting up the Google Sheet

The map reads one tab of a Google Sheet. This guide sets up that tab, the two lookup tabs that turn typed names into codes, and the publish step that lets the page fetch the data. It takes about twenty minutes the first time.

The two CSV files in this folder, `Countries.csv` and `Subdivisions.csv`, are **generated** by `tools/prep-boundaries.mjs` from the same Natural Earth data the map draws. Never edit them by hand. If the map data is ever regenerated, re-import both tabs at the same time.

## The tabs

| Tab | Who edits it | What it is |
|---|---|---|
| `Data` | People | One row per organization per region. The only tab that is published. |
| `Countries` | Nobody (imported) | Every country name and alias the map knows, with its two-letter code. |
| `Subdivisions` | Nobody (imported) | Every state, province, county, or region name and alias, with its code. |

## 1. Import the lookup tabs

1. In the spreadsheet, **File → Import → Upload** and choose `Countries.csv`.
2. Import location: **Insert new sheet(s)**. Separator type: **Comma**. Leave "Convert text to numbers, dates, and formulas" on.
3. Rename the new tab to exactly `Countries`.
4. Repeat for `Subdivisions.csv` and name that tab `Subdivisions`.

Each imported tab has a stamp in row 1 saying which Natural Earth version it came from, headers in row 2, and data from row 3 down.

`Countries` columns: `Key`, `Name`, `Alpha-2`, `Canonical`.
`Subdivisions` columns: `Key`, `Country Code`, `Name`, `Code`, `Canonical`.

`Canonical` is TRUE on the one preferred name for each place and FALSE on aliases (alternate spellings, English names, versions without accents). Lookups use every row; the Country dropdown uses only canonical rows.

5. In the `Countries` tab, put this in cell **F3** to build the dropdown list:

```
=FILTER(B3:B, UPPER(TO_TEXT(D3:D))="TRUE")
```

Give F2 the header `Dropdown`. You can hide column A (`Key`) on both lookup tabs if you like; the formulas still see it.

## 2. Shape the Data tab

Rename the tab that holds the organization list to exactly `Data`. Its header row (row 1) must contain these column names. Order does not matter to the page, but the formulas below assume this order, columns A to H:

| Col | Header | Filled by |
|---|---|---|
| A | `Organization` | People |
| B | `Country` | People, from the dropdown |
| C | `State / Province` | People, free text |
| D | `Country Code` | Formula |
| E | `Subdivision Code` | Formula |
| F | `Region Code` | Formula |
| G | `Website` | People, optional |
| H | `Notes` | People, optional |

If your existing sheet already has `Country` and `State` columns, rename `State` to `State / Province` and insert the three code columns after it.

One row is one organization in one place. An organization in Texas and Oklahoma is two rows.

## 3. Add the formulas

These go in **row 2** only. They fill every row below automatically, including rows added later. Columns D, E, and F must otherwise be empty.

**D2, Country Code**

```
=ARRAYFORMULA(IF(LEN(TRIM(B2:B))=0, "", IFERROR(VLOOKUP(LOWER(TRIM(B2:B)), Countries!$A$3:$C, 3, FALSE), "")))
```

**E2, Subdivision Code**

```
=ARRAYFORMULA(IF((LEN(TRIM(C2:C))=0)+(LEN(D2:D)=0), "", IFERROR(VLOOKUP(LOWER(D2:D)&"|"&LOWER(TRIM(C2:C)), Subdivisions!$A$3:$D, 4, FALSE), "")))
```

**F2, Region Code**

```
=ARRAYFORMULA(IF(LEN(D2:D)=0, "", IF(LEN(E2:E)>0, E2:E, D2:D)))
```

`Region Code` is what the map uses. It is the subdivision code when one matched (`US-TX`, `CA-ON`, `KE-110`) and otherwise the bare country code (`KE`). A bare country code is fine: the organization counts toward the country and is listed as "not assigned to a region" inside that country's view.

## 4. Add the Country dropdown

1. Select column B from row 2 down (click B2, then Ctrl+Shift+↓, or select `B2:B`).
2. **Data → Data validation → Add rule**.
3. Criteria: **Dropdown (from a range)**. Range: `Countries!$F$3:$F`.
4. If data is invalid: **Reject the input**.
5. Save.

Existing rows typed before the dropdown keep their text. If a typed country is not a known name or alias, its code cell stays empty and the next step turns it red.

## 5. Add the red-cell rules

**Format → Conditional formatting**, then two rules with "Custom formula is":

| Apply to range | Custom formula | Meaning |
|---|---|---|
| `B2:B` | `=AND(LEN(TRIM(B2))>0, LEN(D2)=0)` | A country was typed but nothing matched |
| `C2:C` | `=AND(LEN(TRIM(C2))>0, LEN(E2)=0)` | A state/province was typed but nothing matched |

Pick a red fill for both. A red cell means "the map will not find this". Fix it by retyping from the dropdown (country) or correcting the spelling (state/province). If a province name is genuinely missing from the lookup, see "Adding an alias" below.

Walk the sheet once after setup and clear every red cell.

## 6. Publish only the Data tab

1. **File → Share → Publish to web**.
2. On the **Link** tab, change "Entire Document" to **Data**.
3. Change "Web page" to **Comma-separated values (.csv)**.
4. Leave "Automatically republish when changes are made" checked.
5. Click **Publish**, confirm, and copy the URL. It looks like `https://docs.google.com/spreadsheets/d/e/2PACX-…/pub?gid=…&single=true&output=csv`.
6. Paste that URL into `config.js` as `sheetCsvUrl` and commit.

Only the `Data` tab is exposed. The lookup tabs are not published. Do not add any column to `Data` that should not be public; everything in that tab is readable by anyone with the URL.

## Things to know

- **Edits take a few minutes to appear.** Google caches the published CSV for roughly five minutes.
- **Territories are countries in the dropdown.** Puerto Rico, Greenland, Hong Kong, Macao, Guam, and similar places are their own entries because that is how the map draws them. Pick them from the Country dropdown rather than as a state of another country.
- **Small places without regions.** Some countries (Puerto Rico, Vatican, Monaco, most island dependencies) have no state/province level on the map. Leave `State / Province` blank for them.
- **Cities are not regions.** Type the state or province, not the city. A city name will not match unless it happens to also be a subdivision name (Nairobi, Bogota, and Mexico City are; most are not).
- **Older subdivision schemes.** The boundary data lags some countries' reforms. Kenya shows its 8 former provinces, not the 47 counties. If a name does not match, try the older name or leave the field blank so the organization still counts toward the country.
- **Blank rows are harmless.** The published CSV may include trailing blank rows produced by the formulas; the page ignores them.
- **Checking what the map sees.** Open the page with `?debug=1` on the end of its URL to see any rows the map skipped and why.

## Adding an alias

If people keep typing a name the lookup does not know, the durable fix is to add it to the alias lists in `tools/prep-boundaries.mjs` (`COUNTRY_EXTRA_ALIASES`, or `SUBDIVISION_NAME_OVERRIDES` for display names), regenerate with `npm run prep`, run `npm run validate`, and re-import both lookup tabs. A quicker but temporary fix is to add a row at the bottom of the `Subdivisions` tab with `Key` = lowercase `cc|name` (for example `ke|nairobi county`), the `Country Code`, the `Name`, the `Code` it should map to, and `Canonical` = FALSE. Hand-added rows are lost the next time the tab is re-imported.
