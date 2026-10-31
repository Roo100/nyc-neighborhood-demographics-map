# Geographic data provenance

Official source: NYC Department of City Planning, 2020 Neighborhood Tabulation Areas (NTAs), NYC Open Data `9nt8-h7nd`.
https://data.cityofnewyork.us/d/9nt8-h7nd

Required production snapshot: `data/nta2020.geojson`.

This repository's first prototype has not bundled the official full GeoJSON because it could not be downloaded in the development environment. The application falls back to the official Socrata GeoJSON API at runtime, with a visible error if unavailable.

After downloading the official snapshot, validate 262 features and all five boroughs with `python3 scripts/validate_geography.py`, record source date and SHA-256, and test the site at desktop/mobile browser sizes. No synthetic polygons should be substituted.
