# Geographic data provenance — 2020 NTAs

## Pinned polygon snapshot

- Official NYC Department of City Planning dataset: [2020 NTAs, 9nt8-h7nd](https://data.cityofnewyork.us/d/9nt8-h7nd).
- Canonical local file: `data/nta2020.geojson`. The first verified snapshot was checked into the new repository on October 31, 2026.
- Checksum, borough count (50 Bronx, 69 Brooklyn, 38 Manhattan, 82 Queens, 23 Staten Island), and 65 special-purpose areas are recorded in `data/nta2020-validation.json`.
- Source field names: `nta2020`, `ntaname`, `boroname`, `ntatype`. WGS84 longitude-latitude polygon geometry is validated before pinning.

## Census tract equivalency

- Official DCP equivalency dataset [hm78-6dwm](https://data.cityofnewyork.us/d/hm78-6dwm) maps 2020 tract `geoid` to **`ntacode`**.
- The processed CSV standardizes to `tract_geoid,nta2020` for joining by a string 11-digit Census GEOID. Do **not** use borough names, tract centroids, postal ZIPs, or NTA prefixes for this assignment.
- `data/tract_to_nta2020-validation.json` documents covered tract counts and any genuinely unassigned tracts. No missing geographic join may be silently replaced with a borough average.
- The equivalency source and the 2020 NTA geometry may have different update dates. The workflow checks codes and rejects unknown NTA identifiers.

## Regeneration and safeguards

`python scripts/fetch_geography.py` retrieves official geometry, checks structure, all 262 codes, borough coverage, ring closure, and NYC WGS84 coordinate ranges, then publishes its result only on success. `python scripts/fetch_crosswalk.py` retrieves the official equivalency and rejects duplicates and unknown codes. The GitHub Actions workflow runs these checks and commits versioned data together.

## Limitations

The 2020 NTAs approximate, rather than completely define, vernacular neighborhoods. Special-purpose areas should not receive fabricated residential estimates. DCP geography exceptions BX0802 and QN0151 require explicit disclosure. See `data/acs/README.md` for income methodology and the 2020–2024 ACS target period.
