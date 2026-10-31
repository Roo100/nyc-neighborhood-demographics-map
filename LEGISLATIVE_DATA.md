# NYC POP! — Legislative district lookup (October 31, 2026)

**Research branch only. Not published.**

## Data sources and geometry

The following official NYC Department of City Planning 26b (May 2026) district datasets are pinned separately from the NYC 2020 NTAs and 2026 community boards. A selected street-map point is intersected against each polygon independently; there is **no** one-to-one NTA, community-board, ZIP or borough lookup for elected officials.

| Map district | DCP dataset | Unique NYC-intersecting district numbers |
| --- | --- | --- |
| City Council | [872g-cjhh](https://data.cityofnewyork.us/d/872g-cjhh) | 51 |
| New York State Senate | [afns-vxeu](https://data.cityofnewyork.us/d/afns-vxeu) | 28 |
| New York State Assembly | [5yfv-9hkp](https://data.cityofnewyork.us/d/5yfv-9hkp) | 65 |
| US Congress | [j3u5-usz2](https://data.cityofnewyork.us/d/j3u5-usz2) | 13 |

The city-limited district counts are not statewide legislative seat counts. The NY State Senate has 63 districts statewide, and Assembly has 150. The presence of congressional districts 3 and 16 reflects small NYC-intersecting portions; do not exclude those geometries solely because the representative is commonly described as serving Long Island or Westchester.

Source and shape validation script: `scripts/fetch_legislative_districts.py`. Official polygons, raw feature counts, source SHA-256 and pinned-file SHA-256 are in `data/legislative/validation-2026.json`. The source is version 26b; no unreleased election results are used.

## Official members

Snapshot of 51 City Council members: [NYC Council's current directory](https://council.nyc.gov/districts/print/), checked October 31, 2026. NY Senate current directory: [NYS Senate](https://www.nysenate.gov/senators-committees), same check date. The members are stored in `data/legislative/officials-verified-2026-10-31.json` and must be refreshed after turnover.

**Senate District 12:** Do not mislabel former senator Michael Gianaris as the current senator; the official senate page states his service ended August 10, 2026, and the current senators directory does not show an incumbent for the district. Show the district number and official finder instead.

NY State Assembly and House names require separate current official-directory verification; until verified, show correct district number and an official directory link, not an assumed person. For all positions use the official directory before emailing/contacting.

## Practical UX

The existing neighborhood popup remains the interaction's focus. It reports the click-point's community board, school district, four distinct elected district numbers, verified officeholder names where available, and linkouts, **without showing an NTA code**. On boundaries or out-of-coverage points, the popup explicitly requests address verification and does not guess membership.

The four district datasets are loaded asynchronously after the 262 official NTAs; the map remains navigable while layers load, and an active popup is updated once validated geometry arrives. If validation or downloading fails, the site displays unavailability rather than inventing a number.

## Further research milestones still pending

- ACS 2020–2024 5-year income, poverty, race/ethnicity values with valid tract→NTA aggregation, margins of error, missingness and cross-checks.
- Voter registration by party with precise Board of Elections geography/year and current district matching; distinguish *party registration* from *votes cast* and *officeholder party*.
- Election vote totals and turnout by election district, selected contests and election dates, no implied neighborhood result unless a documented boundary assignment or allocation exists.
- NYCPS Fall 2026 grade span and operational school status reconciliation; school attendance zones remain distinct from geographic school districts.
