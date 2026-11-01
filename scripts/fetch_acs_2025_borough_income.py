#!/usr/bin/env python3
"""Fetch and validate official 2025 ACS 1-year B19013 NYC county medians.

Requires CENSUS_API_KEY because the 2025 Census API requires a key.
Run: CENSUS_API_KEY=... python3 scripts/fetch_acs_2025_borough_income.py

Only writes the display JSON after validating all five county estimates/MOEs.
This does NOT change the tract-based 2020–2024 NTA figures.
"""
import json
import os
from datetime import date
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen

COUNTIES = {"36005": "Bronx", "36047": "Brooklyn", "36061": "Manhattan",
            "36081": "Queens", "36085": "Staten Island"}
ENDPOINT = "https://api.census.gov/data/2025/acs/acs1"
TARGET = Path("data/acs/borough_income_2025_verified.json")


def extract(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError("Census response must contain header and county rows")
    headers = rows[0]
    required = {"NAME", "B19013_001E", "B19013_001M", "state", "county"}
    if not required.issubset(headers):
        raise ValueError("Missing required Census data columns")
    data = []
    seen = set()
    for raw in rows[1:]:
        record = dict(zip(headers, raw))
        code = record["state"] + record["county"]
        if code not in COUNTIES or code in seen:
            continue
        seen.add(code)
        estimate, moe = int(record["B19013_001E"]), int(record["B19013_001M"])
        if not 1 <= estimate <= 1_000_000 or not 0 <= moe <= 200_000:
            raise ValueError(f"Invalid/suppressed ACS median or MOE for {code}")
        data.append({"borough": COUNTIES[code], "county_fips": code,
                     "median_household_income_usd": estimate, "moe_90_usd": moe})
    if seen != set(COUNTIES):
        raise ValueError(f"Missing county FIPS: {set(COUNTIES) - seen}")
    return sorted(data, key=lambda x: x["county_fips"])


def main():
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise SystemExit("CENSUS_API_KEY required. No display file was changed.")
    query = urlencode({"get": "NAME,B19013_001E,B19013_001M",
                       "for": "county:*", "in": "state:36", "key": key})
    with urlopen(ENDPOINT + "?" + query, timeout=45) as response:
        rows = json.load(response)
    data = extract(rows)
    payload = {
        "status": "VERIFIED_ACS_2025_1_YEAR_B19013_NYC_COUNTIES",
        "period": "2025", "dollars": "2025 inflation-adjusted USD",
        "source": "U.S. Census Bureau ACS 2025 1-year Detailed Table B19013",
        "source_url": "https://data.census.gov/table/ACSDT1Y2025.B19013",
        "retrieved_on": date.today().isoformat(), "records": data
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, indent=2) + "\n")
    print("Validated all five NYC counties; wrote", TARGET)


if __name__ == "__main__":
    main()
