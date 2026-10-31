# NYC Neighborhood Atlas — Geographic Milestone 1

**Status:** First geographic milestone. Source code published; GitHub Pages must be activated separately.

**Public project:** https://github.com/Roo100/nyc-neighborhood-demographics-map

**Proposed site URL:** https://roo100.github.io/nyc-neighborhood-demographics-map/

This is an independent NYC neighborhood map. The existing Roo100/nyc-shootings-map is not modified.

## Implemented
- Leaflet basemap with zoom and pan
- NYC 2020 Neighborhood Tabulation Areas (NTAs) across five boroughs
- Borough selector and name / NTA-code search
- Clickable neighborhood polygons, selection details and reset
- Special-purpose-area styling, mobile layout, loading and error feedback

## Geographic source and limitation
Official NYC Department of City Planning 2020 NTA polygons: https://data.cityofnewyork.us/d/9nt8-h7nd (dataset ID 9nt8-h7nd).
The browser first requests `data/nta2020.geojson`. Until that **verified, versioned local GeoJSON file** is committed, it falls back to the official NYC Open Data endpoint:
`https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=5000`.

**This is a prototype dependent on the live official endpoint.** The 262 polygons have not yet been verified by a live-browser smoke test in this environment. The map will display an error if data is unavailable. Do not describe the map as a verified production dataset until the official snapshot is downloaded, structurally validated and tested in a browser. No demographic or election values are fabricated.

## Deploy
To enable GitHub Pages: open repository **Settings → Pages**, choose **Deploy from a branch**, then choose **main** and **/(root)** and save. Once the site is published, confirm the map loads 262 polygons, search works, each borough displays, polygons are clickable, and a mobile layout is usable.

## Local development
Run `python3 -m http.server 8000` in the project directory and open `http://localhost:8000`. Opening `index.html` with `file://` may block geographic fetches.

Run `node --test tests/*.test.mjs` for unit tests.

Once a verified local geographic snapshot has been obtained, run `python3 scripts/validate_geography.py` to check the expected NTA fields, 262 features and borough coverage, and record its reported SHA-256.

## Roadmap
After geographic acceptance, incorporate versioned ACS median income, poverty and mutually exclusive race/ethnicity data. Only then build the separate voter registration and election results layers with a documented NTA geographic crosswalk. Registration, election results and turnout must never be confused with one another.

## Data caution
NTAs are statistical areas rather than exact vernacular neighborhood boundaries. Do not derive borough from NTA prefix alone: use the official borough field and document administrative exceptions.

## Leaflet styling reliability (October 31, 2026)
The official Leaflet 1.9.4 CSS is copied into `assets/css/leaflet.css` from [Leaflet/Leaflet v1.9.4](https://github.com/Leaflet/Leaflet/blob/v1.9.4/dist/leaflet.css), under Leaflet's BSD-2-Clause license. This avoids broken or blocked third-party CSS requests that can otherwise leave map tiles displaced, remove clipping, and hide map controls and SVG boundaries. The Leaflet JavaScript library remains pinned to v1.9.4.

After a deployment, verify the browser successfully loads `assets/css/leaflet.css` and that the polygons overlay the map at their correct coordinates.
