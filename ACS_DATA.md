# NYC POP! — Verified 2020–2024 ACS Five-Year Demographic Layers

**Status:** Development/QA review. Do not publish unless source and desktop/mobile checks pass.

## Official sources and geography

The official Census 2024 ACS five-year API endpoint returned HTTP 200 with an HTML page titled **Missing Key**, not JSON, when called without a key. The build therefore uses the Census Bureau's **official national table-based 2024 five-year Summary Files**, streamed to retain NYC tract rows only. These contain estimates **and 90% margins of error**.

- [Census ACS 2024 table-based Summary File](https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html)
- Official source files: `acsdt5y2024-b19001.dat` (income brackets), `acsdt5y2024-b17001.dat` (poverty), and `acsdt5y2024-b03002.dat` (Hispanic origin by race).
- **2,327 unique NYC 2020 Census tract GEOIDs**: Bronx 361, Brooklyn/Kings 805, Manhattan/New York 310, Queens 725, Staten Island/Richmond 126.
- Tract→2020 NTA: NYC DCP [2020 tract equivalencies, hm78-6dwm](https://data.cityofnewyork.us/d/hm78-6dwm). Exactly 262 official 2020 NTAs, with 0 unmatched source tracts in the pinned crosswalk check.
- 2020 NTA boundary: NYC DCP [9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd), not community board or voting districts.

## Derivation, qualification, uncertainty

Each NTA derives counts by summing tract counts, not by averaging tract percentages. If any required tract source value is missing, suppressed or inconsistent, the corresponding NTA metric is unavailable. A zero or missing population denominator is **not** reported as 0%.

**Income.** B19001 (household income distribution) is summed across tracts and the median is approximated by interpolating within the bracket containing the 50th-percentile household. It is **NOT** an official published Census B19013 NTA median. Since no defensible grouped-median MOE is available, the display uses **≈** and a prominent methodological note. Income values refer to **2024 inflation-adjusted dollars**.

**Poverty.** B17001 below poverty / poverty-universe counts. Rate MOE at approximately 90% confidence is computed conservatively using tract count MOEs and root-sum-of-squares. It is *not* an exact published Census ratio MOE.

**Race/ethnicity.** Mutually exclusive ACS B03002 categories: Hispanic/Latino of any race; non-Hispanic White alone, Black alone, Asian alone, and remaining non-Hispanic groups. These sum to the ACS total before rounded percentages. Each share has a separately screened approximate 90% MOE. No double-counting Hispanic people.

**Unavailable geography.** Special-purpose NTAs (airports, parks, etc.), low denominators, missing tract fields, excessive uncertainty and income distributions with the unbounded top median bracket are intentionally gray. No neighboring values are fabricated.

## Screen thresholds and coverage

The display export `scripts/export_acs_2024_display.py` enforces:

- Income: at least 50 households and household-count MOE <=50% of estimated households.
- Poverty: at least 100 poverty-universe people and approximately 90% rate MOE <=20 percentage points.
- Each race group: at least 100 people and approximately 90% group share MOE <=20 percentage points.
- Special-purpose NTAs excluded.

| Display | Eligible 2020 NTAs | Unavailable |
| --- | ---: | ---: |
| Grouped approximate household median income | 195 | 67 |
| Poverty rate | 197 | 65 |
| Each mutually exclusive race/ethnicity share | 197 | 65 |

**These thresholds are project-specific safeguards, not Census Bureau statistical significance thresholds.** Results are not appropriate as precise comparisons of NTAs without considering MOEs. Data reference period 2020–2024, not all 2024 alone; geographic boundaries are 2020 NYC NTAs.

## Reproducible workflow

1. `scripts/extract_acs_2024_summary.py`: official national table downloads, stream filter to five NYC counties, preserve estimate and MOE variables. Source SHA-256 and fetch date in `data/acs/summary-file-provenance-2024.json`.
2. `scripts/build_income_nta.py` and `scripts/build_acs_nta_2024.py`: preliminary 262 NTA derivation and suppressed/missing QA; no publication authorization at this stage.
3. `scripts/export_acs_2024_display.py`: quality gate; outputs `data/acs/nta_display_2024.json` for the map only after checks.
4. `tests/test_build_income_nta.py`, `tests/test_acs_nta_quality.py`, `tests/acs.test.mjs`, and desktop/mobile browser acceptance tests verify geography, accuracy, color scales, missingness and popup source labeling.

The published map will retain all 262 official geographic NTAs and show available estimates only. The underlying source files and code preserve provenance for an audit.

**Separate unfinished layers:** Voter party enrollment/registration, official election results, turnout, and verified Fall 2026 school grade spans. None of those data are inferred or represented by ACS source values.
