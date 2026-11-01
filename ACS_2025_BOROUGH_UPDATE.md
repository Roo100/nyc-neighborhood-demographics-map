# 2025 borough household income upgrade — October 31, 2026

## Source and current publication gate

The U.S. Census Bureau released **2025 ACS 1-year estimates on October 29, 2026**.
The authoritative borough income measure is **B19013_001E** (median household income)
with **B19013_001M** (90% margin of error), in **2025 inflation-adjusted dollars**,
for New York county FIPS 36005, 36047, 36061, 36081, and 36085.

- Official release: https://www.census.gov/programs-surveys/acs/news/data-releases/2025/release-schedule.html
- Table: https://data.census.gov/table/ACSDT1Y2025.B19013
- API: https://api.census.gov/data/2025/acs/acs1

**Current state:** the Census publication was confirmed, but its five exact county
values were not independently retrieved and verified in this session. No dollar
figures were invented or published. The site displays the 2025 county source
with a clear verification status until the verified JSON is generated.

## Reproducible upload

1. Obtain a Census API key through the Census Bureau developer program.
2. From the repository root, run:
   `CENSUS_API_KEY=your_key python3 scripts/fetch_acs_2025_borough_income.py`
3. Inspect `data/acs/borough_income_2025_verified.json` against the Census
   B19013 table. Check five FIPS, 2025 median, and 90% MOE.
4. Check in the verified JSON only after data review and responsive UI tests.
   The browser will then display figures in the borough profile automatically.
5. Do not use these single-year county medians as neighborhood (NTA) estimates.

## Keep existing neighborhood data

The 2020–2024 ACS **five-year** tract-aggregated NTA data remain in
`data/acs/nta_display_2024.json`; these values are grouped-income
approximations, not direct Census B19013 NTA observations. Their source period
and 2024 inflation-adjusted dollar units must remain visible. No direct
2025-versus-2020–2024 trend is inferred from these geographically and
methodologically different estimates.

The official Census release schedule lists the 2021–2025 ACS five-year release
date as **TBD** as of October 31, 2026. Rebuild NTA tract aggregates only after
that product arrives and quality controls, geography crosswalk, MOEs, and
missingness have been reviewed.
