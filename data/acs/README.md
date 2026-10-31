# ACS income, poverty and racial/ethnic indicators — 2020–2024 five-year sources

**Status:** Official 2024 ACS tract source and research aggregations verified. Screened 2020 NTA estimates are available to the website through `data/acs/nta_display_2024.json` once the feature PR is merged.

## Target vintage and geography

- **Vintage:** American Community Survey 2020–2024 **5-year** estimates (the most recent 5-year release as of October 31, 2026).
- **Publisher:** U.S. Census Bureau, 2024 ACS 5-year Detailed Tables.
- **Geography:** 2020 Census Tracts in NYC's five counties, aggregated to **2020 NTAs** using NYC Department of City Planning's official tract/NTA equivalency file, dataset **hm78-6dwm**.
- **Boundary source:** NYC DCP **9nt8-h7nd**, pinned as \`data/nta2020.geojson\` and checked by \`data/nta2020-validation.json\`.
- **Crosswalk:** \`data/tract_to_nta2020.csv\` with \`tract_geoid\` (11-digit string) and \`nta2020\` (6-character string). The companion report explicitly lists source tracts without an NTA assignment.
- **Currency:** household income measured in **2024 inflation-adjusted USD**.

Sources:
- https://www.census.gov/data/developers/data-sets/acs-5year/2024.html
- https://api.census.gov/data/2024/acs/acs5/groups/B19001.html
- https://api.census.gov/data/2024/acs/acs5/groups/B17001.html
- https://data.cityofnewyork.us/d/hm78-6dwm
- https://data.cityofnewyork.us/d/9nt8-h7nd

## Required income variables and denominators

| Planned NTA value | Source variable | Calculation | Type |
| --- | --- | --- | --- |
| Household count | \`B19001_001E\` | Sum of compatible tract household totals | ACS-derived aggregate |
| Income distribution | \`B19001_002E\` through \`B19001_017E\` | Sum household counts for each disjoint bracket across tracts | ACS-derived aggregate |
| Median household income | **Prefer independently published ACS/DCP NTA median, if verified** | **Never average or household-weight tract median values** | Published estimate if available |
| Otherwise, approximate NTA household median | \`B19001_002E\` through \`B19001_017E\` | Aggregate bracket counts, then linear interpolation within the bracket containing the 50th percentile | **Derived approximation, not a published ACS median** |
| Poverty universe | \`B17001_001E\` | Sum eligible people for whom poverty status was determined | ACS-derived aggregate |
| Below poverty threshold | \`B17001_002E\` | Sum eligible people below threshold | ACS-derived aggregate |
| Poverty rate | \`B17001_002E / B17001_001E\` | Percent of population for whom poverty status is determined (not percent of households nor necessarily total population) | Derived estimate |

**Median warning:** For household incomes in an open-ended $200,000-or-more bracket, a median above the preceding threshold cannot be estimated without an additional assumption. Return null rather than fabricate a dollar amount. Even when calculable, grouped-data interpolation is only an approximation and must be labeled accordingly.

## Validation gates before any layer is enabled

1. Match every usable ACS 2024 tract GEOID against the pinned 2020-tract-to-NTA crosswalk.
2. Report missing tract records, duplicate GEOIDs, unmatched/NTA-unassigned tracts, and geography-version discrepancies. Never substitute borough-level values.
3. For each NTA, do not publish an income or poverty figure if any contributing tract lacks the required source fields. Missing, suppressed and ACS special values are **not zero**.
4. Confirm income-bracket household totals against the corresponding \`B19001_001E\` total; explain any discrepancy.
5. Preserve a provenance record with download time, complete source URL, dataset vintage, formula, processing version and source hash.
6. Report ACS margins of error or explicit uncertainty limitations rather than suggesting exact measurement.
7. Mark special-purpose/nonresidential NTAs as **not applicable** when residential estimates cannot be meaningfully reported.
8. Keep political registration and election values in separate future datasets, each with its own spatial allocation rules.

## Later race/ethnicity phase

Use ACS 2024 5-year \`B03002\` with mutually exclusive groups: Hispanic/Latino of any race (\`B03002_012E\`), non-Hispanic White alone (\`B03002_003E\`), non-Hispanic Black alone (\`B03002_004E\`), non-Hispanic Asian alone (\`B03002_006E\`), and remaining non-Hispanic categories (difference from \`B03002_002E\`). Validate that all five categories sum to the same total \`B03002_001E\`, subject to ACS data quality checks. Do not include Hispanic residents in more than one category.

Source: https://api.census.gov/data/2024/acs/acs5/groups/B03002.html

## Publication state

**Official 2020–2024 ACS income, poverty, and race/ethnicity source data have now been ingested and quality-screened.** The website can render the derived NTA-level estimates from `nta_display_2024.json`. **No political party registration, election vote totals, turnout, or official published B19013 NTA medians have been added.** Read [ACS_DATA.md](../../ACS_DATA.md) for the precise method and exclusions.

## Executable income preparation pipeline (added October 31, 2026)

From the repository root, the scripts are:

```bash
# Download official 2020–2024 ACS five-year tract detailed tables.
# If Census requires an API key, set CENSUS_API_KEY in your environment.
python3 scripts/fetch_acs_income.py

# Join by official 2020 tract GEOID, aggregate household and poverty counts,
# and compute only clearly labeled derived income-bin median approximations.
python3 scripts/build_income_nta.py

# Run tests without downloading any real ACS records.
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

Official Census 2024 five-year **table-based Summary Files** are streamed using `scripts/extract_acs_2024_summary.py`, avoiding the Census API's current `Missing Key` HTML response. Research input and QC files remain in this folder. `scripts/build_acs_nta_2024.py` preserves uncertainty and data quality, and `scripts/export_acs_2024_display.py` creates the **publicly displayable** screened subset: 195 income, 197 poverty and 197 race-category NTA estimates out of 262 polygons. All other values are visibly unavailable, never zeros. No grouped-data NTA income median may be labeled as an official B19013 Census median.
