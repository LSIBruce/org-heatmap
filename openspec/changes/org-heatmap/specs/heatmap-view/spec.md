## ADDED Requirements

### Requirement: World level rendering
The page SHALL render every country from `data/world.json` using an Equal Earth projection, filling each interactive country by its organization count through a shared threshold color scale, with zero rendered as a neutral light gray.

#### Scenario: Country with organizations
- **WHEN** Kenya has 7 organizations and the breaks are [1, 2, 4, 8, 16]
- **THEN** Kenya is filled with the color for the 4 to 7 band

#### Scenario: Country with none
- **WHEN** a country has zero organizations
- **THEN** it is filled neutral gray

#### Scenario: Non-interactive shape
- **WHEN** a feature has no code
- **THEN** it is drawn in neutral gray and produces no tooltip, focus, or click behavior

### Requirement: Shared color scale and legend
One threshold scale with breaks from `config.js` SHALL be used at both the world and country levels, and a legend below the map SHALL show each band's range and color.

#### Scenario: Same count, same color at both levels
- **WHEN** a country with 5 organizations is compared to a subdivision with 5 organizations
- **THEN** both are filled with the same color

#### Scenario: Legend matches breaks
- **WHEN** breaks are [1, 2, 4, 8, 16]
- **THEN** the legend shows bands labeled 0, 1, 2 to 3, 4 to 7, 8 to 15, and 16+

### Requirement: Hover tooltip on pointer devices
On devices that support hover, moving the pointer over an interactive region SHALL show a tooltip near the pointer with the region name, the organization count, and up to ten organization names sorted alphabetically, followed by "and N more" when more exist. Leaving the region SHALL hide the tooltip.

#### Scenario: Region with few organizations
- **WHEN** the pointer enters Texas with 4 organizations
- **THEN** the tooltip shows "Texas", "4 organizations", and the four names

#### Scenario: Region with many organizations
- **WHEN** the pointer enters a region with 14 organizations
- **THEN** the tooltip lists ten names and "and 4 more"

#### Scenario: Empty region
- **WHEN** the pointer enters a country with zero organizations
- **THEN** the tooltip shows the name and "No organizations"

### Requirement: Tap panel on touch and narrow screens
When the device does not support hover or the viewport is narrower than 700 px, tapping an interactive region SHALL select it and fill a panel below the map with the region name, count, and the full scrollable list of organization names. The panel SHALL stay visible until another region is tapped or empty map space is tapped.

#### Scenario: Tap a country
- **WHEN** a user taps Brazil on a phone
- **THEN** the panel shows "Brazil", the count, and all organization names, and the map remains at world level

#### Scenario: Tap empty space
- **WHEN** the user taps ocean or outside any region
- **THEN** the selection clears and the panel shows a prompt to tap a region

#### Scenario: Panel bounded height
- **WHEN** a selected region has more names than fit
- **THEN** the panel scrolls internally and the overall page height does not grow

### Requirement: Drill-down into a country
Selecting a country that has at least one organization and has subdivision data SHALL load `data/regions/<XX>.json` on demand, zoom the view to that country, and render its subdivisions filled by the shared scale. On pointer devices a click drills; on touch a "View regions" button in the panel drills. The URL hash SHALL reflect the current country.

#### Scenario: Click a country on desktop
- **WHEN** the user clicks Kenya, which has organizations and regions
- **THEN** the view animates to Kenya's bounds, its subdivisions render with their counts, and the URL hash becomes `#KE`

#### Scenario: Regions load only once
- **WHEN** the user drills into Kenya, returns to the world, and drills into Kenya again
- **THEN** the regions file is fetched only on the first drill

#### Scenario: Touch drill via button
- **WHEN** a phone user taps Kenya and then taps "View regions" in the panel
- **THEN** the view drills into Kenya

#### Scenario: Antimeridian country
- **WHEN** the user drills into Russia or Fiji
- **THEN** the country renders as one contiguous shape without wrapping artifacts

#### Scenario: Deep link
- **WHEN** the page is opened with `#BR` in its URL
- **THEN** it renders the Brazil country level directly after data loads

### Requirement: Country level content
At the country level, subdivisions SHALL behave like world-level regions for tooltip and tap, the world layer SHALL remain faintly visible for context, and organizations coded to the bare country SHALL be reported as "not assigned to a region" with their names.

#### Scenario: Hover a subdivision
- **WHEN** the pointer enters Nairobi at the Kenya level
- **THEN** the tooltip shows "Nairobi", its count, and names

#### Scenario: Unassigned organizations
- **WHEN** Kenya has two organizations with `Region Code` `KE`
- **THEN** the country-level header or panel shows "2 not assigned to a region" and lists them

#### Scenario: Subdivision with a synthetic code
- **WHEN** a subdivision's code is synthetic and an organization is coded to it via the sheet lookup
- **THEN** the subdivision is filled and its tooltip lists the organization

### Requirement: Back navigation
A visible back control SHALL return from the country level to the world level; the Escape key and the browser back button SHALL do the same.

#### Scenario: Back control
- **WHEN** the user activates the back control at the country level
- **THEN** the view animates back to the world, the hash clears, and the world tooltips work again

#### Scenario: Escape key
- **WHEN** the user presses Escape at the country level
- **THEN** the view returns to the world

### Requirement: Non-drillable countries
Countries with zero organizations, and countries whose manifest entry has `hasRegions` false, SHALL show tooltip or panel information but SHALL NOT drill.

#### Scenario: Empty country clicked
- **WHEN** the user clicks a country with zero organizations
- **THEN** nothing changes except the tooltip or panel content

#### Scenario: Country without subdivision data
- **WHEN** the user clicks a country with organizations but `hasRegions` false
- **THEN** the panel shows its organizations and no "View regions" control is offered

### Requirement: Responsive layout
The map SHALL scale to the width of its container using an SVG viewBox, SHALL never cause horizontal scrolling, and SHALL place the legend and, on narrow screens, the panel below the map within the frame height.

#### Scenario: Narrow viewport
- **WHEN** the page is rendered at 360 px wide
- **THEN** the map fills the width, the legend is below it, the panel is below the legend, and no horizontal scrollbar appears

#### Scenario: Wide viewport
- **WHEN** the page is rendered at 1200 px wide
- **THEN** the map is bounded to a readable maximum width and centered

### Requirement: Accessibility basics
Interactive regions SHALL be keyboard-focusable with an accessible name of the form "<region>, <count> organizations", Enter SHALL drill where a click would, the panel SHALL announce changes as a live region, transitions SHALL be suppressed when the user prefers reduced motion, and tooltip and panel text SHALL meet a 4.5:1 contrast ratio.

#### Scenario: Keyboard navigation
- **WHEN** a keyboard user tabs to Kenya and presses Enter
- **THEN** the view drills into Kenya and focus moves to the back control

#### Scenario: Reduced motion
- **WHEN** the operating system requests reduced motion
- **THEN** zoom changes are applied without animation

### Requirement: Initial load performance
The page SHALL become interactive at the world level after loading only the page assets, `data/world.json`, `data/countries.json`, and the sheet CSV, without waiting for any regions file.

#### Scenario: First render
- **WHEN** the page loads
- **THEN** no request for any `data/regions/*.json` is made until a country is drilled into
