#!/usr/bin/env python3
"""Fetch and validate 2025 ACS one-year NYC county income and race/ethnicity.

Requires CENSUS_API_KEY because the 2025 Census API requires a key.
Run: CENSUS_API_KEY=... python3 scripts/fetch_acs_2025_borough_income.py

Only writes display JSON after validating five counties and all source variables.
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
RACE_TARGET = Path("data/acs/borough_race_2025_verified.json")
RACE_COLUMNS = ["B03002_001E", "B03002_003E", "B03002_004E", "B03002_006E", "B03002_012E"]


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


def extract_race(rows):
    """Use mutually exclusive B03002 groups; Hispanic is any race."""
    headers = rows[0]
    if not set(RACE_COLUMNS + ["state", "county"]).issubset(headers):
        raise ValueError("Missing Census B03002 race/ethnicity columns")
    results, seen = [], set()
    for raw in rows[1:]:
        row = dict(zip(headers, raw))
        code = row["state"] + row["county"]
        if code not in COUNTIES or code in seen:
            continue
        seen.add(code)
        vals = [int(row[k]) for k in RACE_COLUMNS]
        total, white, black, asian, hispanic = vals
        other = total - white - black - asian - hispanic
        if total < 1 or any(v < 0 for v in [white, black, asian, hispanic, other]):
            raise ValueError(f"Invalid/suppressed B03002 totals for {code}")
        categories = {
            "White non-Hispanic": white, "Black non-Hispanic": black,
            "Asian non-Hispanic": asian, "Hispanic / Latino (any race)": hispanic,
            "Other non-Hispanic": other
        }
        if sum(categories.values()) != total:
            raise ValueError(f"Race categories do not reconcile for {code}")
        results.append({
            "borough": COUNTIES[code], "county_fips": code, "population": total,
            "counts": categories,
            "shares_pct": {k: round(100 * v / total, 2) for k, v in categories.items()}
        })
    if seen != set(COUNTIES):
        raise ValueError(f"Missing race county FIPS: {set(COUNTIES) - seen}")
    return sorted(results, key=lambda x: x["county_fips"])


def main():
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise SystemExit("CENSUS_API_KEY required. No display file was changed.")
    query = urlencode({"get": "NAME,B19013_001E,B19013_001M," + ",".join(RACE_COLUMNS),
                       "for": "county:*", "in": "state:36", "key": key})
    with urlopen(ENDPOINT + "?" + query, timeout=45) as response:
        rows = json.load(response)
    data = extract(rows)
    race = extract_race(rows)
    payload = {
        "status": "VERIFIED_ACS_2025_1_YEAR_B19013_NYC_COUNTIES",
        "period": "2025", "dollars": "2025 inflation-adjusted USD",
        "source": "U.S. Census Bureau ACS 2025 1-year Detailed Table B19013",
        "source_url": "https://data.census.gov/table/ACSDT1Y2025.B19013",
        "retrieved_on": date.today().isoformat(), "records": data
    }
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, indent=2) + "\n")
    race_payload = {
        "status": "VERIFIED_ACS_2025_1_YEAR_B03002_NYC_COUNTIES",
        "period": "2025",
        "source": "U.S. Census Bureau ACS 2025 1-year Detailed Table B03002",
        "source_url": "https://data.census.gov/table/ACSDT1Y2025.B03002",
        "retrieved_on": date.today().isoformat(), "records": race
    }
    RACE_TARGET.write_text(json.dumps(race_payload, indent=2) + "\\n")
    print("Validated all five NYC counties; wrote", TARGET, "and", RACE_TARGET)


if __name__ == "__main__":
    main()
