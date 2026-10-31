# NYC Neighborhood Atlas — Geographic Milestone 1

**Status:** Geographic milestone visually verified. Official 2020 NTA GeoJSON pinned and validated; borough/search integration tests added. ACS income values are not yet published.

**Public project:** https://github.com/Roo100/nyc-neighborhood-demographics-map

**GitHub Pages URL:** https://roo100.github.io/nyc-neighborhood-demographics-map/

This is an independent NYC neighborhood map. The existing Roo100/nyc-shootings-map is not modified.

## Implemented
- Leaflet basemap with zoom and pan
- NYC 2020 Neighborhood Tabulation Areas (NTAs) across five boroughs
- Borough selector and name / NTA-code search
- Clickable neighborhood polygons, selection details and reset
- Special-purpose-area styling, mobile layout, loading and error feedback

## Geographic sources, validation, and limits
- Boundaries: official NYC DCP 2020 NTAs, [dataset 9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd). The checked-in snapshot is `data/nta2020.geojson`, with `data/nta2020-validation.json` recording the 262-feature count, five boroughs, coordinate validation, special-purpose classification, and SHA-256.
- Tract-to-NTA equivalency: official NYC DCP [dataset hm78-6dwm](https://data.cityofnewyork.us/d/hm78-6dwm); its raw geographic join property is `ntacode`, standardized to `nta2020` in our output file.
- The browser loads the pinned geometry first. The live official GeoJSON endpoint is retained **only as a development fallback**, not the canonical data dependency.
- The screenshot supplied October 31, 2026 visually confirmed visible boundaries and selection of Longwood (BX0202). This does not substitute for complete multi-borough automated and mobile browser acceptance testing.
- Exceptional geography includes BX0802 (Kingsbridge–Marble Hill) and QN0151 (Rikers Island, assigned Bronx in DCP).
- The new map is not yet populated with income, race, registration, election, or turnout observations.

## Deploy
To enable GitHub Pages: open repository **Settings → Pages**, choose **Deploy from a branch**, then choose **main** and **/(root)** and save. Once the site is published, confirm the map loads 262 polygons, search works, each borough displays, polygons are clickable, and a mobile layout is usable.

## Local development
Run `python3 -m http.server 8000` in the project directory and open `http://localhost:8000`. Opening `index.html` with `file://` may block geographic fetches.

Run `node --test tests/*.test.mjs` for unit tests.

Run `python3 scripts/validate_geography.py` to revalidate the pinned geography and its checksum. Run `python3 scripts/fetch_crosswalk.py` to update the official tract-to-NTA equivalency. Refresh both through `Actions → Pin official 2020 NTA geography`.

## Roadmap
After geographic acceptance, incorporate versioned ACS median income, poverty and mutually exclusive race/ethnicity data. Only then build the separate voter registration and election results layers with a documented NTA geographic crosswalk. Registration, election results and turnout must never be confused with one another.

## Data caution
NTAs are statistical areas rather than exact vernacular neighborhood boundaries. Do not derive borough from NTA prefix alone: use the official borough field and document administrative exceptions.

## Leaflet styling reliability (October 31, 2026)
The official Leaflet 1.9.4 CSS is copied into `assets/css/leaflet.css` from [Leaflet/Leaflet v1.9.4](https://github.com/Leaflet/Leaflet/blob/v1.9.4/dist/leaflet.css), under Leaflet's BSD-2-Clause license. This avoids broken or blocked third-party CSS requests that can otherwise leave map tiles displaced, remove clipping, and hide map controls and SVG boundaries. The Leaflet JavaScript library remains pinned to v1.9.4.

After a deployment, verify the browser successfully loads `assets/css/leaflet.css` and that the polygons overlay the map at their correct coordinates.
