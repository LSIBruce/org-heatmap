## ADDED Requirements

### Requirement: GitHub Pages hosting
The page SHALL be served by GitHub Pages from the root of the `main` branch of a public repository over HTTPS, with a `.nojekyll` file present so no files are preprocessed or hidden.

#### Scenario: Page URL loads
- **WHEN** the Pages URL is opened in a browser
- **THEN** `index.html` loads, fetches `data/world.json`, `data/countries.json`, and the sheet CSV, and renders the world level

#### Scenario: Deep asset paths served
- **WHEN** `data/regions/KE.json` is requested from the Pages origin
- **THEN** it is returned with a 200 status

### Requirement: Embed snippet needs no script
The repository README SHALL provide a copy-paste `<iframe>` snippet for a Tithely embed block that sets `width="100%"`, an inline `height` using `clamp(360px, 70vh, 720px)`, `border: 0`, `loading="lazy"`, and a descriptive `title`, and the map SHALL be fully usable with only that snippet.

#### Scenario: Snippet pasted into Tithely
- **WHEN** the snippet is placed in an embed block and the page is viewed
- **THEN** the map renders inside the frame with no additional script or style in the block

#### Scenario: Phone height
- **WHEN** the Tithely page is viewed on a 360 px wide phone
- **THEN** the frame is at least 360 px tall and the map, legend, and panel fit within it

#### Scenario: Desktop height
- **WHEN** the Tithely page is viewed on a large desktop display
- **THEN** the frame height does not exceed 720 px

### Requirement: Frame-friendly delivery
The page SHALL load inside a cross-origin iframe on an HTTPS parent without frame-blocking headers, mixed-content errors, or cross-origin fetch failures.

#### Scenario: Loaded inside Tithely
- **WHEN** the Tithely page containing the frame is opened
- **THEN** the browser console shows no frame-blocking, mixed-content, or CORS errors, and the sheet CSV loads

### Requirement: Optional height messaging
The page SHALL post a message of the form `{ type: "org-heatmap:height", height: <px> }` to its parent whenever its content height changes, so a parent that is allowed to run script can size the frame exactly. The absence of a listener SHALL have no effect on the page.

#### Scenario: Parent listens
- **WHEN** the embed block includes the documented listener and the page's content height changes
- **THEN** the iframe's height is updated to match

#### Scenario: Parent does not listen
- **WHEN** the embed block contains only the iframe
- **THEN** the page functions normally at the clamp height

### Requirement: Configuration without code changes
The sheet CSV URL, color breaks, tooltip name cap, and page title SHALL live in `config.js`, and changing any of them SHALL require no edit to `app.js` or `index.html`.

#### Scenario: Re-published sheet
- **WHEN** the sheet is re-published and its CSV URL changes
- **THEN** updating the URL in `config.js` and committing is sufficient for the live map to use the new data

### Requirement: Embed smoke procedure
The README SHALL document a smoke procedure to run inside Tithely on desktop and mobile that confirms rendering, hover or tap, drill-down, back navigation, and the data-unavailable state, and the procedure SHALL be executed before the embed is placed on a live page.

#### Scenario: Smoke on a staging page
- **WHEN** the snippet is placed on an unpublished Tithely page and the procedure is followed on desktop and on a phone
- **THEN** every step passes and the results are recorded in the change's tasks before the block is moved to the live page
