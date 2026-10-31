# NYC POP! — Official 2026 Party Enrollment by City Council District

**Status:** Validated source and QA development. Not yet published until desktop/mobile tests and approval gate pass.

## Official source

NYC Board of Elections [2026 Voter Enrollment Totals](https://www.vote.nyc/page/voter-enrollment-totals) → **City Council Enrollment Totals, February 2026** → [source PDF, 56 pages](https://www.vote.nyc/sites/default/files/pdf/vote/2026/CityCouncil_Enrollment_Feb2026.pdf).

**Reporting date: February 20, 2026.** This is a snapshot of voter **enrollment/registration**, not election results or candidate votes. BOE separately reports active, inactive and total registered voters. The published map defaults to the **active** electorate for percentage layers, with both active and inactive counts disclosed in the district profile.

The report separates six categories: Democrat, Republican, Conservative, Working Families, Other, and Blank (unaffiliated). Blank must **never** be labeled a political party. Party enrollment need not match election outcomes, officeholder party, or the political views of all residents.

## Geographic matching

The published BOE PDF has 56 pages covering 51 unique Council districts and 55 Council/county subtotal sections. Districts **8, 22, 34 and 50 span county portions** in the report. Council 24's totals begin at the bottom of PDF page 43 and continue onto page 44. The parser explicitly handles this continuation and **sums** cross-county sections; it does not count duplicate sections as separate districts.

- Reproducible extraction: `scripts/extract_boe_council_enrollment_2026.py`, `pypdf` layout-text extraction from 56-page official PDF (no OCR), strict row/column validation.
- Source-hashed JSON: `data/political/council_enrollment_2026.json`, with BOE PDF SHA-256, 51 Council district IDs, party totals, source date and report-page counts.
- Geographic shape: NYC Department of City Planning 2026 26b Council Districts, [872g-cjhh](https://data.cityofnewyork.us/d/872g-cjhh), with exactly 51 official Council polygons. This map is **not** based on neighborhood name, NTA code, ZIP code, or citywide borough percentages.
- The clicked street point is intersected with the Council district; the 2026 BOE totals are then looked up by **Council district number**. Visitors can separately select any Council district by accessible drop-down.

## Verified totals

| Status | Active | Inactive | Total |
| --- | ---: | ---: | ---: |
| Citywide voter enrollment | 4,960,232 | 399,113 | 5,359,345 |

The sum of six registration categories and the active+inactive reconciliation are tested **for every district**. Most districts have Democratic as the largest **registered active** party category; Council District 51's largest category is Republican. These are party **enrollment** comparisons, *not* predictions of election winners or borough “party affiliation.” It is possible for a candidate from a different party than the district's plurality registration to win an election.

No **NTA-level** party majority is fabricated. Council districts overlap multiple neighborhoods; one neighborhood may overlap more than one Council district. Where a selected point lies on an official district boundary, the map reports ambiguity and asks users to confirm the exact address.

## Display and interpretation

The layer selector includes Council party registration views for Democratic, Republican, Unaffiliated, Working Families percentage of active enrollment, and largest enrolled category. Unaffiliated is shown explicitly instead of being assigned to Democratic or Republican. The selected district side profile gives source date, verified member when available, active/inactive counts, and each party category's share; a collapsible card inside the map explains the same data.

Sources for current Council/Senate members and district GIS are separately documented in `LEGISLATIVE_DATA.md`; a district's registration plurality is **not** a substitute for elected representative identification.

## Election results and turnout (separate pending stage)

NYC BOE [Election Results Summary, November 4, 2025](https://www.vote.nyc/page/election-results-summary-2025) provides election-district-level (ED) CSV results by **specific contest** including mayor, comptroller, council, referenda. Before publication, original ED code, election date, absentee/early vote inclusion, candidate lines, redistricting edition and precinct-to-neighborhood allocation must be verified. An ED-level result must not be labeled as a Council turnout share or an NTA's “vote result” without matching official boundaries.

**October 31, 2026 is before the November 3, 2026 election**. No November 2026 results should appear in the dataset before that date.

## QA gates

- PDF source hash, 56 pages, 55 Council/county sections, 51 distinct district IDs, six party column sums, active/inactive/total reconciliation, and 5,359,345 citywide total.
- Each Council polygon assigned only after exact DCP 2026 point-in-polygon lookup, no NTA-to-Council guess.
- Desktop/mobile browser tests of party filter, Council 51, independent popup with school/community board, legend, change back to NTA and no content overflow.

**The original Roo100/nyc-shootings-map is unchanged.**
