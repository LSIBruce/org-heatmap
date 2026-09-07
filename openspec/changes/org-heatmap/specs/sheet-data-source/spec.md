## ADDED Requirements

### Requirement: Data tab schema
The Google Sheet SHALL contain a tab named `Data` with, at minimum, the columns `Organization`, `Country`, `State / Province`, `Country Code`, `Subdivision Code`, `Region Code`, `Website`, and `Notes`. Each row SHALL represent one organization in one region. `Organization`, `Country`, `State / Province`, `Website`, and `Notes` are edited by people; `Country Code`, `Subdivision Code`, and `Region Code` SHALL be computed by formula and never typed.

#### Scenario: United States organization with a state
- **WHEN** a row has `Country` = "United States of America" and `State / Province` = "Texas"
- **THEN** `Country Code` is `US`, `Subdivision Code` is `US-TX`, and `Region Code` is `US-TX`

#### Scenario: Organization outside the United States with a province
- **WHEN** a row has `Country` = "Canada" and `State / Province` = "Ontario"
- **THEN** `Country Code` is `CA`, `Subdivision Code` is `CA-ON`, and `Region Code` is `CA-ON`

#### Scenario: Organization with no state or province
- **WHEN** a row has `Country` = "Kenya" and `State / Province` is empty
- **THEN** `Country Code` is `KE`, `Subdivision Code` is empty, and `Region Code` is `KE`

#### Scenario: Same organization in two regions
- **WHEN** an organization operates in Texas and Oklahoma
- **THEN** it appears as two rows, one with `Region Code` `US-TX` and one with `US-OK`

#### Scenario: New row fills its own codes
- **WHEN** an editor adds a row below the last existing row and fills `Country` and `State / Province`
- **THEN** the three code columns populate without the editor copying any formula

### Requirement: Country is validated by a dropdown
The `Country` column SHALL offer a dropdown of canonical country names drawn from the `Countries` lookup tab, and SHALL reject values not in that list for newly edited cells.

#### Scenario: Editor selects a country
- **WHEN** an editor opens the `Country` cell dropdown and picks "Brazil"
- **THEN** `Country Code` becomes `BR`

#### Scenario: Legacy free-typed country not in the lookup
- **WHEN** an existing row has `Country` = "USA" which is not a canonical name and has no alias
- **THEN** `Country Code` is empty and the `Country` cell is highlighted red

#### Scenario: Legacy free-typed country matches an alias
- **WHEN** an existing row has `Country` = "United States" and the `Countries` tab lists "United States" as an alias of `US`
- **THEN** `Country Code` is `US` and the cell is not highlighted

### Requirement: Subdivision names resolve through the lookup with aliases
`Subdivision Code` SHALL be resolved by looking up the pair (`Country Code`, `State / Province`) in the `Subdivisions` tab, matching case-insensitively after trimming whitespace, including alias and accent-stripped names.

#### Scenario: Name typed without diacritics
- **WHEN** a row has `Country Code` `BR` and `State / Province` = "Sao Paulo"
- **THEN** `Subdivision Code` is `BR-SP`

#### Scenario: Name with surrounding whitespace and different case
- **WHEN** a row has `State / Province` = "  ontario "
- **THEN** `Subdivision Code` is `CA-ON`

#### Scenario: Name that matches nothing
- **WHEN** a row has `Country Code` `IN` and `State / Province` = "Bombay" and no alias exists
- **THEN** `Subdivision Code` is empty, `Region Code` is `IN`, and the `State / Province` cell is highlighted red

#### Scenario: Same subdivision name in two countries
- **WHEN** two rows both have `State / Province` = "Punjab", one with `Country Code` `IN` and one with `PK`
- **THEN** the codes are `IN-PB` and `PK-PB` respectively

### Requirement: Lookup tabs are generated and match the map
The `Countries` and `Subdivisions` tabs SHALL be imported from the CSV seeds produced by the boundary preparation script, SHALL carry the Natural Earth version they were generated from, and every code they contain SHALL correspond to a shape in the boundary data.

#### Scenario: Every subdivision code has a shape
- **WHEN** the validation script cross-checks `sheet/Subdivisions.csv` against `data/regions/*.json`
- **THEN** every code in the CSV is found in exactly one regions file

#### Scenario: Version stamp is present
- **WHEN** the `Subdivisions` tab is opened
- **THEN** a header note states the Natural Earth version and generation date

### Requirement: Only the Data tab is published
The `Data` tab SHALL be published to the web as CSV. The `Countries` and `Subdivisions` tabs SHALL NOT be published or otherwise exposed.

#### Scenario: Published URL returns the data tab
- **WHEN** the configured CSV URL is fetched from a browser on a different origin
- **THEN** the response is CSV whose header row includes `Organization` and `Region Code`, and the response permits cross-origin reads

#### Scenario: Lookup tabs are not reachable
- **WHEN** the published URL is modified to request another tab's `gid`
- **THEN** the request does not return the `Countries` or `Subdivisions` content

### Requirement: The page parses the CSV and aggregates by region
The page SHALL fetch the configured CSV on load, match headers case- and whitespace-insensitively, keep rows whose `Organization` is non-empty and whose `Region Code` matches `^[A-Z]{2}(-[A-Z0-9~]{1,8})?$`, and aggregate distinct organizations per country and per subdivision.

#### Scenario: Country total includes bare and subdivided rows
- **WHEN** the CSV has rows with `Region Code` `KE`, `KE-30`, and `KE-30` for three different organizations
- **THEN** Kenya's count is 3 and the Nairobi subdivision's count is 2

#### Scenario: Duplicate organization within one region counts once
- **WHEN** two rows both have `Organization` = "Hope Center" and `Region Code` = `US-TX`
- **THEN** Texas counts Hope Center once and lists it once

#### Scenario: Same name differing only in case and whitespace
- **WHEN** rows have `Organization` = "Hope Center" and " hope center" in the same region
- **THEN** they are treated as one organization

#### Scenario: Invalid rows are skipped and reported
- **WHEN** a row has an empty `Organization`, or a `Region Code` that fails the pattern, or a typed `Country` that produced no `Region Code`
- **THEN** it does not affect any count and the browser console lists its row number and reason

#### Scenario: Rows with no country are not placed and not errors
- **WHEN** a row has an `Organization` but both `Country` and `Region Code` are empty (a global or unlocated ministry)
- **THEN** it does not affect any count, is not reported as invalid, and is listed separately as "not placed" in the debug panel

#### Scenario: Header with different casing
- **WHEN** the CSV header reads `region code` instead of `Region Code`
- **THEN** the column is still recognized

#### Scenario: Region code present in the sheet but absent from the map
- **WHEN** a valid `Region Code` has no matching shape in the boundary data
- **THEN** the organization still counts toward its country total and the code is listed as unmatched in the debug panel

### Requirement: Data unavailable state
When the CSV cannot be fetched or parsed, or yields zero valid rows, the page SHALL display a clear message and SHALL NOT present an unshaded map as if it were real data.

#### Scenario: Fetch fails
- **WHEN** the CSV request returns an error or is blocked
- **THEN** the page shows the world outline in neutral gray with a visible message that organization data is currently unavailable, and no tooltips claim zero organizations

#### Scenario: Zero valid rows
- **WHEN** the CSV parses but contains no valid rows
- **THEN** the page shows a message that no organizations were found

### Requirement: Debug data-health panel
The page SHALL reveal a data-health panel when `?debug=1` is present in its URL, listing invalid rows, unmatched region codes, total organizations, and counts per level. It SHALL be hidden otherwise.

#### Scenario: Debug flag present
- **WHEN** the page is opened with `?debug=1`
- **THEN** the panel lists each invalid row number with a reason and each unmatched code

#### Scenario: Debug flag absent
- **WHEN** the page is opened normally
- **THEN** no data-health panel is visible
