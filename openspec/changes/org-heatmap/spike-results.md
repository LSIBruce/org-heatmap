# Spike results (tasks 1.2 and 1.3), 2026-09-07

Source: Natural Earth 5.1.1 as served by naciscdn.org (the GitHub release tag is v5.1.2; the archives' VERSION.txt says 5.1.1). mapshaper 0.6.121. Raw analysis is in `tools/tmp/spike-analysis.txt` (not committed).

## Resolution

| File | Records | Verdict |
|---|---|---|
| `ne_50m_admin_1_states_provinces` | 294 | About ten large countries only. Unusable for worldwide subdivisions. |
| `ne_10m_admin_1_states_provinces` | 4,596 across 251 `adm0_a3` codes | Required. |
| `ne_50m_admin_0_countries` | 242 | Fine for the world level. |

## Sizes (TopoJSON, quantization 1e4, `keep-shapes`)

World, 1:50m admin-0, all countries:

| Simplify | Size |
|---|---|
| 5 % | 75 KB |
| 10 % | 108 KB |
| 20 % | 171 KB |

Regions, 1:10m admin-1 split by `adm0_a3` (251 files, before dissolve):

| Simplify | Total | Median | p90 | Max (Russia) |
|---|---|---|---|---|
| 5 % | 1.5 MB | 4 KB | 13 KB | 56 KB |
| 10 % | 1.9 MB | 5 KB | 17 KB | 87 KB |
| 20 % | 2.7 MB | 6 KB | 25 KB | 146 KB |

Chosen: world 10 %, regions 20 %. Budgets set to world 150 KB, regions max 250 KB, regions median 50 KB.

## Admin-0 identity

- `ISO_A2` is a placeholder but `ISO_A2_EH` is good for: Taiwan (`CN-TW` → `TW`), Norway, Kosovo (`XK`), France, Indian Ocean Territories (`AU`), Ashmore and Cartier Islands (`AU`).
- Both placeholders: Somaliland, Northern Cyprus, Siachen Glacier. Decision: merge Somaliland into `SO`, Northern Cyprus into `CY`; Siachen non-interactive.
- `AU` appears on three features; dissolve by code.
- `TYPE` values: Sovereign country 185, Dependency 28, Country 19, Disputed 4, Indeterminate 4, Sovereignty 2.
- Every admin-0 feature has at least one admin-1 row.

## Admin-1 identity

- 188 of 4,596 features lack a strict `^[A-Z]{2}-[A-Z0-9]{1,3}$` code. Almost all are territories where Natural Earth writes its own placeholders (`XK-X02~`, `HK-X16~`, `-99-X15~`). Largest groups: Kosovo 30, Hong Kong 18, Anguilla 14, Åland 11, Cook Islands 11.
- `adm1_code` is not safe as a synthetic id (values like `ATA+00?`); use numeric `diss_me`.
- Admin-1 `iso_a2` disagrees with the parent for Tokelau (under NZL) and the territories above; derive the parent from `adm0_a3` joined to admin-0 instead.
- Nine `adm0_a3` values have no admin-0 feature at 1:50m: CLP, CSI, ESB, GIB, KAB, PGA, UMI, USG, WSB. Gibraltar is the only inhabited one. Drop and log.
- 37 countries have exactly one admin-1 feature (Aruba, Curaçao, Puerto Rico, Macau, Vatican, Monaco, and other small dependencies). These get `hasRegions` false.

## Shared ISO 3166-2 codes (60)

Three patterns:

1. Exact duplicates of one unit: `AF-PAR` Parwan ×2, `HR-12`, `MD-RE`, `MW-CT`, `MZ-L`, `UG-410`, `SI-054` (Krško / Krsko).
2. A province and a city inside it: Ireland (`IE-CO` Cork, `IE-G` Galway, `IE-LK` Limerick, `IE-WD` Waterford), Latvia (`LV-JEL`, `LV-DGV`, `LV-JKB`, `LV-VEN`, `LV-REZ`), the Philippines (19 codes, e.g. `PH-CEB` Cebu province and Cebu city, `PH-BEN` Benguet and Baguio), `KZ-ALA`, `PE-LIM`, `CO-CUN`, `MU-PL`, `AU-NSW` with Lord Howe Island.
3. ISO defines a coarser level than Natural Earth draws: Madagascar 22 regions → 6 provinces (`MG-A/D/F/M/T/U`), Bosnia cantons → `BA-BIH`, Dublin's four councils → `IE-D`, North and South Tipperary → `IE-TA`, Metro Manila cities → `PH-MNL`, `MD-SN` Stînga Nistrului / Transnistria.

Decision: dissolve on strict code. Name from the largest constituent, with an override table for pattern 3 where no constituent carries the ISO-level name. All constituent names become aliases.

## Aliases

- Name fields available on admin-1: `name` (7 blank), `name_en` (7 blank), `name_alt` (1,980 filled, `|`-separated), `gn_name` (4,464), `woe_name` (4,224).
- Accent-folding creates no collisions between distinct units. The only fold collision is Krško / Krsko, which share a code anyway.
- 27 (country, name) pairs are duplicated in the raw data; all are resolved by the dissolve.

## Not done

- Task 1.1 (Tithely embed block behavior) needs someone in the Tithely admin. The design assumes iframe and inline style work and scripts do not; only the optional height listener depends on the answer.
