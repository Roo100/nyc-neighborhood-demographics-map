# NYC POP! Civic Information — Source and Geographic Methodology

**Status: Draft; review/approval required before deployment.**
**As-of: October 31, 2026.**

## Published-baseline preservation

This addition does not alter the original `Roo100/nyc-shootings-map`. The approved NYC POP! neon streets + grid theme, NTA search, landmark symbols, and official 2020 NTA data remain. The new government-information feature is a separate `Community boards · 2026` selector. No demographic values or political election results have been published.

## Community Boards: primary data

- Publisher: NYC Department of City Planning, version **26b**, updated **May 26, 2026**.
- Source: [Community Districts, dataset 5crt-au7u](https://data.cityofnewyork.us/d/5crt-au7u).
- Pinned local file: `data/civic/community-districts-2026.geojson`.
- Download/verification: `scripts/fetch_civic_districts.py`, plus `data/civic/community-districts-2026-validation.json`.
- 71 total polygons comprise **59 community boards** and **12 Joint Interest Areas**. JIAs include parks and airports that lack ordinary community board representation; they must **not** be presented as boards.
- Board counts: Manhattan 12, Bronx 12, Brooklyn 18, Queens 14, Staten Island 3.
- Primary join key: **BoroCD** (borough digit followed by two-digit board or special-area code), *not* NTA code, Census tract GEOID, NYC Council district, or ZIP code.
- Geometry: official 2026 NYC DCP borough community-district polygons. The 2020 NTA layer remains the authority only for NTAs.
- Board profiles show the official community district number and link to the [City's Community Boards directory](https://www.nyc.gov/site/communityboards/index.page), which hosts contact and meeting information.

## Current elected offices and geographic caution

- The five borough presidents are listed by borough, as checked against the [NYC government directory](https://www.nyc.gov/main/your-government) on October 31, 2026. These are *borough-wide* offices, so showing them for any NTA/board in that borough is supported.
- **Never infer a City Council member, State Senator, State Assembly member, or congressional representative from an NTA or community board alone.** These administrative/statistical areas can overlap multiple electoral districts.
- In the interim use official address-search directories:
  - [NYC Council members and district lookup](https://council.nyc.gov/districts/) — 51 elected Council districts.
  - [NY State Board of Elections elected-officials finder](https://elections.ny.gov/new-york-state-elected-officials) — state senator, assembly member and congressional representative resources.
  - [NYC government and borough presidents](https://www.nyc.gov/main/your-government).
  - [NYC 311 online](https://portal.311.nyc.gov/).

## Additional civic layers: follow-up roadmap

1. **City Council GIS districts:** NYC DCP official [City Council Districts, 872g-cjhh](https://data.cityofnewyork.us/d/872g-cjhh), 51 polygons (version 26b); then verified current district-to-member list with source and last-checked date.
2. **State Legislature:** DCP [State Senate Districts, afns-vxeu](https://data.cityofnewyork.us/d/afns-vxeu) and the official State Assembly district dataset. Display boundaries distinctly and use authoritative State Senate/Assembly directories to link current officeholders.
3. **US Congress:** NYC DCP congressional district polygons and verified House of Representatives directory; no inferred one-to-one NTA association.
4. **Public services:** 311, libraries, parks, community district needs, NYC Planning community profiles, school and transit access, with separate provenance.
5. **Demographics/elections:** the pending 2020–2024 ACS 5-year income/poverty and race/ethnicity audits; separately valid Board of Elections district geometries, registration counts, turnout and candidate totals with clearly documented geographic allocation rules.

## Data reliability

Each layer should track source organization, geographic edition/effective period, fetch date and source hash, polygon count, unmatched areas, current-officeholder check date, and whether it is live or versioned. Missing/suppressed statistics are **not zero**. Geographic crosswalks must use official published equivalencies or documented weighted allocation, not visual assumptions.

**Publication gate:** QA and browser acceptance of official 59-board overlay, keyboard board picker, 2020 NTA return, five borough filters, street layer, mobile layout, and absence of unsourced official assignments.


## K–12 Schools and Education Districts — new review layer

Official NYC Planning school-district geography: [May 2026 DCP School Districts, 8ugf-3d8u](https://data.cityofnewyork.us/d/8ugf-3d8u). The official Socrata service returned **33 polygon features covering 32 unique geographic districts (1–32)**; district 10 is split across two source features. Our `fetch_schools_k12.py` joins multipart features by the *published school district code*, not by a guessed borough or NTA crosswalk. School administrative districts **are not elementary/middle attendance zones**, and K–12 citywide programs may not follow the geographic district pattern.

Official school point geography: [New York State Geohub — NYSED Schools K–12, feature layer 0](https://nysgeohub.ny.gov/arcgis/rest/services/Education/NYS_Schools/FeatureServer/0). Initial GIS extraction, dated October 31, 2026, returned **2,944 NYC school point records** tagged to the five NYC counties (Bronx, Kings, New York, Queens, Richmond): 1,590 Public, 425 Charter, 830 Nonpublic, 99 Unclassified based on the source's institution/subtype fields. **These are extracted GIS records, not verified counts of currently operational NYCPS schools, nor admission or performance recommendations.** The underlying NYSED GIS source does not expose reliable K–12 grade span, and the categories may not align with NYCPS's reported charter/public counts.

Source archive and validation are versioned as `data/schools/school-districts-2026.geojson`, `data/schools/k12-schools-nysed.geojson`, and `data/schools/validation-2026.json`. The extraction script rejects missing or duplicate institution identifiers, invalid points, non-NYC county names, unexpected district counts, and impossible GPS coordinates; the manifest stores source URLs, observation date, counts and SHA-256 digests.

School pins are zoom-sensitive to avoid saturating the full-city map. Users can filter by borough and published school category or search a name or NYSED institution code. The search displays location and validated category, **not an inferred school assignment**. Clicking a district highlights actual DCP 2026 polygons, but no institution is automatically matched to a school district from its NYSED code (administrative district and physical district may differ).

Official operational, admissions, zoning and grade-level checks:
- [NYCPS Fall 2026 elementary, middle, high directories](https://infohub.nyced.org/reports/admissions-and-enrollment/directory-data)
- [MySchools school search and admissions](https://www.myschools.nyc/en/)
- [NYCPS school system data, including public and charter totals](https://www.schools.nyc.gov/about-us/reports/nycps-data-at-a-glance)

**Pending before calling individual schools 'current':** exact-source code or address crosswalk to verified NYCPS Fall 2026 records; remove closed facilities; verify school grades/grade spans and public/charter/nonpublic categorization; add official elementary/middle attendance zones separately. Do not derive school zoning or a student's admissions eligibility from a district polygon, school marker, NTA, or proximity alone. No student-level data is collected.
