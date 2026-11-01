# NYC POP! — Five-Borough Neighborhood, Civic and ACS Demographic Atlas

**Status:** Verified 2020 NTA geometry; interactive streets and civic/K–12 geographic layers. The 2020–2024 ACS income, poverty, and race/ethnicity layers use official tract sources and explicit quality controls. February 2026 Council party enrollment is sourced from NYC BOE. Candidate election results and turnout remain separately unpublished.

**Public project:** https://github.com/Roo100/nyc-neighborhood-demographics-map

**GitHub Pages URL:** https://roo100.github.io/nyc-neighborhood-demographics-map/

This is an independent NYC neighborhood map. The existing Roo100/nyc-shootings-map is not modified.

## Implemented
- OpenStreetMap street-grid basemap with preserved zoom controls, metric distance scale, neon-only view and official attribution
- NYC 2020 Neighborhood Tabulation Areas (NTAs) across five boroughs
- Borough selector and neighborhood name search; NTA codes remain internal rather than appearing in public popup cards
- Clickable map-point **civic pop-up** showing the 2026 community board, borough president, point-intersected City Council / NY Senate / Assembly / U.S. House districts (verified representative names where available), and the 2026 geographic school district. It links to NYCPS's address-and-grade school zone finder; a geographic school district is **not** an attendance zone. Income, poverty and racial demographics remain separate in map filters and the side profile.
- Interactive 59 community boards, 32 NYC geographic school districts, and 2,944 NYSED source-listed K–12 school sites with search and category filters
- ACS neighborhood color layers for **approximate** median household income, poverty rates, and five mutually exclusive racial/ethnic shares; special-purpose/unreliable areas are gray
- Special-purpose-area handling, mobile layout, loading and error feedback

## Civic boundary category explorer (October 31, 2026)

The **Your NYC civic guide → Explore NYC boundaries** section follows the
organizational model of [BetaNYC Boundaries](https://boundaries.beta.nyc/?map=sd)
but is independently implemented in NYC POP!'s existing Leaflet dashboard.

- 23 categories in five groups: representation/community; schools/education;
  safety/city services; neighborhoods/planning; and voting/courts.
- Twelve map-enabled choices: eight existing validated local geographies
  (community districts, Council, Assembly, Senate, congressional, school districts,
  K–12 sites and 2020 NTAs), plus four **on-demand official NYC Open Data** layers:
  NYPD police precincts (78), DSNY sanitation districts (59), FDNY fire
  battalions (49), and Census ZIP Code Tabulation Areas (221). The latter
  four are loaded only on selection and must pass strict count, unique-ID,
  polygon and coordinate checks before appearing on the map.
- The other 11 reference categories remain selectable, but they **do not
  generate invented local boundaries**. They show an explicit unmapped notice
  and a BetaNYC reference link. No external redirect occurs when selecting
  any of the 12 mapped categories; an official source link is available separately.
- Click a boundary to identify the verified district at that **point**; district
  boundaries do not align one-to-one with an NTA. The separate civic map card
  still shows community board, representatives and school-district context.
- "School district" is a geographic administrative boundary, **not** an
  address-specific K–12 attendance zone. NYCPS School Search provides that
  independent lookup.
- The Clear boundary overlay button removes the temporary category layer.
  Reset Map also clears it; no shooting-dashboard files are touched.

Official source references for the newly mapped categories:

- [NYPD Police Precincts, DCP 26b](https://data.cityofnewyork.us/d/y76i-bdw7)
- [DSNY Districts, September 2026](https://data.cityofnewyork.us/d/i6mn-amj2)
- [FDNY Fire Battalions, DCP 26b](https://data.cityofnewyork.us/d/xzng-ft6f)
- [Census ZIP Code Tabulation Areas, April 2026](https://data.cityofnewyork.us/d/35j5-n34v)

Census ZCTAs are statistical approximate ZIP regions and **must not** be
presented as USPS delivery address ZIP codes. DSNY districts are separately
sourced even though their 59 service boundaries align with community boards.
If the live official geometry service is unavailable, the UI fails closed and
provides the official source link. These four datasets are not silently
substituted with neighborhood or community-board polygons.

Data source labels are kept separate from political party enrollment and ACS
neighborhood data. Locally unmapped categories require official source
validation and geographic QA before adding further GIS polygons.

## Geographic sources, validation, and limits
- Boundaries: official NYC DCP 2020 NTAs, [dataset 9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd). The checked-in snapshot is `data/nta2020.geojson`, with `data/nta2020-validation.json` recording the 262-feature count, five boroughs, coordinate validation, special-purpose classification, and SHA-256.
- Tract-to-NTA equivalency: official NYC DCP [dataset hm78-6dwm](https://data.cityofnewyork.us/d/hm78-6dwm); its raw geographic join property is `ntacode`, standardized to `nta2020` in our output file.
- The browser loads the pinned geometry first. The live official GeoJSON endpoint is retained **only as a development fallback**, not the canonical data dependency.
- Automated browser acceptance now checks desktop and mobile map layers, neighborhood popup, schools, street grid, zoom/scale and demographic selection. Test screenshots are generated by GitHub Actions using mocked OSM tiles (no automated requests to OSM).
- Exceptional geography includes BX0802 (Kingsbridge–Marble Hill) and QN0151 (Rikers Island, assigned Bronx in DCP).
- **Income, poverty and race/ethnicity:** Official Census Bureau 2020–2024 ACS 5-year Detailed Tables, aggregated through the official DCP tract–NTA equivalency. Quality-screened source and methodology are described in [ACS_DATA.md](ACS_DATA.md). Only derived/qualified ACS estimates are displayed. Party enrollment is available **only for City Council districts** using official BOE February 2026 reporting, not for neighborhoods; election outcomes are not yet populated.

## Deploy
To enable GitHub Pages: open repository **Settings → Pages**, choose **Deploy from a branch**, then choose **main** and **/(root)** and save. Once the site is published, confirm the map loads 262 polygons, search works, each borough displays, polygons are clickable, and a mobile layout is usable.

## Local development
Run `python3 -m http.server 8000` in the project directory and open `http://localhost:8000`. Opening `index.html` with `file://` may block geographic fetches.

Run `node --test tests/*.test.mjs` for unit tests.

Run `python3 scripts/validate_geography.py` to revalidate the pinned geography and its checksum. Run `python3 scripts/fetch_crosswalk.py` to update the official tract-to-NTA equivalency. Refresh both through `Actions → Pin official 2020 NTA geography`.

## Roadmap
Next: match the NYC Board of Elections November 2025 contest-specific ED-level election results to an official contemporaneous election district geography; do not infer NTA vote shares. The February 2026 Council district enrollment source is already validated, and remains a distinct registration measure. Verify Fall 2026 NYCPS operational school status and grade spans. Keep **party enrollment**, **election results**, and **turnout** as distinct measures.

## Political enrollment and representation
- Verified 2026 DCP Council, NY Senate, Assembly and congressional district boundaries and official Council/Senate officeholder directories: [LEGISLATIVE_DATA.md](LEGISLATIVE_DATA.md).
- BOE February 20, 2026 Council party-registration report: 51 Council districts, separate active/inactive totals, source PDF audit and cross-borough aggregation: [POLITICAL_DATA.md](POLITICAL_DATA.md).
- **Party enrollment is not a neighborhood election result or a candidate's vote share.**

## Data caution
NTAs are statistical areas rather than exact vernacular neighborhood boundaries. Do not derive borough from NTA prefix alone: use the official borough field and document administrative exceptions.

## Leaflet styling reliability (October 31, 2026)
The official Leaflet 1.9.4 CSS is copied into `assets/css/leaflet.css` from [Leaflet/Leaflet v1.9.4](https://github.com/Leaflet/Leaflet/blob/v1.9.4/dist/leaflet.css), under Leaflet's BSD-2-Clause license. This avoids broken or blocked third-party CSS requests that can otherwise leave map tiles displaced, remove clipping, and hide map controls and SVG boundaries. The Leaflet JavaScript library remains pinned to v1.9.4.

After a deployment, verify the browser successfully loads `assets/css/leaflet.css` and that the polygons overlay the map at their correct coordinates.
