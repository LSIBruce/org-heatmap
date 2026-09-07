## ADDED Requirements

### Requirement: World topology from Natural Earth admin-0
The preparation script SHALL produce `data/world.json`, a TopoJSON of Natural Earth 1:50m admin-0 countries excluding Antarctica, in which every feature carries `code` (ISO 3166-1 alpha-2) and `name`, SHALL dissolve features that share a code into one feature, SHALL merge Somaliland into `SO` and Northern Cyprus into `CY`, and SHALL mark features whose code cannot be resolved as non-interactive rather than dropping them.

#### Scenario: Standard country
- **WHEN** the script processes the feature for Brazil
- **THEN** the output feature has `code` `BR` and `name` "Brazil"

#### Scenario: Country whose ISO_A2 is a placeholder
- **WHEN** the source feature for France has `ISO_A2` = `-99`
- **THEN** the script uses `ISO_A2_EH` and the output feature has `code` `FR`

#### Scenario: Several source features share one code
- **WHEN** Australia, Indian Ocean Territories, and Ashmore and Cartier Islands all resolve to `AU`
- **THEN** the output has exactly one feature with `code` `AU` whose geometry covers all three

#### Scenario: De facto state merged per ISO 3166-1
- **WHEN** the script processes Somaliland
- **THEN** its geometry is part of the `SO` feature and no separate Somaliland feature exists

#### Scenario: Country with no ISO code in any field
- **WHEN** a source feature such as Siachen Glacier resolves to no code
- **THEN** the output feature has `code` empty, `interactive` false, and is still drawn

#### Scenario: Antarctica excluded
- **WHEN** `data/world.json` is inspected
- **THEN** it contains no feature for Antarctica

#### Scenario: Size budget
- **WHEN** `data/world.json` is written
- **THEN** its size is at most 150 KB

### Requirement: Per-country subdivision topologies
The script SHALL produce one TopoJSON per country at `data/regions/<XX>.json` from Natural Earth 1:10m admin-1 states and provinces, simplified, with each feature carrying `code`, `name`, and `country`. Parentage SHALL come from joining `adm0_a3` to the admin-0 file, and features whose parent is not an interactive country SHALL be dropped and logged.

#### Scenario: Subdivision with a real ISO 3166-2 code
- **WHEN** the source feature for Ontario has `iso_3166_2` = `CA-ON`
- **THEN** the output feature in `data/regions/CA.json` has `code` `CA-ON`

#### Scenario: Subdivision without a strict ISO 3166-2 code
- **WHEN** a source feature has `iso_3166_2` empty, `-99`, or a placeholder such as `XK-X02~`
- **THEN** the output feature has a synthetic `code` of the form `<XX>-~<diss_me>` that is stable across runs

#### Scenario: Several features share one strict code
- **WHEN** Cork county and Cork city both carry `IE-CO`
- **THEN** `data/regions/IE.json` has exactly one feature with `code` `IE-CO` covering both, named "Cork"

#### Scenario: Dissolved feature takes the ISO-level name from the override table
- **WHEN** four Madagascar regions share `MG-T`
- **THEN** the dissolved feature is named "Antananarivo" and each region's name appears as an alias in the seed CSV

#### Scenario: Dissolved feature without an override takes the largest constituent's name
- **WHEN** Cundinamarca and Bogota both carry `CO-CUN` and no override exists
- **THEN** the dissolved feature is named "Cundinamarca" and "Bogota" is an alias

#### Scenario: Parent country absent from the world file
- **WHEN** a source feature's `adm0_a3` is `GIB` and no interactive admin-0 feature has that code
- **THEN** the feature is omitted from every regions file and listed in the script's log

#### Scenario: Only needed properties are kept
- **WHEN** any regions file is inspected
- **THEN** features carry only `code`, `name`, and `country`

#### Scenario: Size budgets
- **WHEN** all regions files are written
- **THEN** each is at most 250 KB and the median is at most 50 KB

#### Scenario: Country with a single subdivision feature
- **WHEN** a country's admin-1 data has fewer than two features
- **THEN** the manifest marks that country as having no subdivisions and no regions file is required

### Requirement: Country manifest
The script SHALL produce `data/countries.json` listing every interactive country with its `code`, `name`, and `hasRegions` flag.

#### Scenario: Country with regions
- **WHEN** `data/regions/KE.json` exists with two or more features
- **THEN** the manifest entry for `KE` has `hasRegions` true

#### Scenario: Country without regions
- **WHEN** no regions file exists for a country
- **THEN** its manifest entry has `hasRegions` false

### Requirement: Lookup seed CSVs generated from the same run
The script SHALL produce `sheet/Countries.csv` and `sheet/Subdivisions.csv` from the same source records used for the topologies, with canonical rows flagged for dropdown use and alias rows for lookup, including accent-stripped variants of every name.

#### Scenario: Canonical and alias rows for a country
- **WHEN** the United States is processed
- **THEN** `Countries.csv` has one row with `Canonical` true for its display name and alias rows for its alternate names, all mapping to `US`

#### Scenario: Accent-stripped alias
- **WHEN** the subdivision "São Paulo" is processed
- **THEN** `Subdivisions.csv` contains both "São Paulo" and "Sao Paulo" mapping to `BR-SP` for country `BR`

#### Scenario: Unique keys
- **WHEN** `Subdivisions.csv` is validated
- **THEN** no two rows share the same (country code, lower-cased name) pair

#### Scenario: Version stamp
- **WHEN** either seed CSV is written
- **THEN** its first row records the Natural Earth version and generation date

### Requirement: Reproducible rebuild
The preparation script SHALL pin the Natural Earth release it downloads, SHALL run from a clean checkout with Node.js and its declared dev dependencies, and SHALL write both the topologies and the seed CSVs in a single invocation.

#### Scenario: Clean run
- **WHEN** the script is run on a machine with Node.js LTS and after installing `tools/package.json` dependencies
- **THEN** it downloads the pinned Natural Earth archives, writes `data/` and `sheet/`, and exits successfully

#### Scenario: Partial regeneration is not possible
- **WHEN** the script is invoked
- **THEN** it always regenerates topologies and seed CSVs together

### Requirement: Validation script
A validation script SHALL parse every generated file, verify code uniqueness within each file, verify every seed code has a shape, verify every manifest `hasRegions` flag matches the presence of a regions file, and enforce the size budgets, exiting non-zero on any failure.

#### Scenario: All checks pass
- **WHEN** the validation script runs against a fresh generation
- **THEN** it reports counts of countries, regions files, and seed rows, and exits zero

#### Scenario: A seed code has no shape
- **WHEN** a code in `Subdivisions.csv` is absent from every regions file
- **THEN** the script names the code and exits non-zero

#### Scenario: A file exceeds its budget
- **WHEN** any regions file exceeds 250 KB or `world.json` exceeds 150 KB
- **THEN** the script names the file and exits non-zero
