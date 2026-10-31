#!/usr/bin/env python3
"""Fetch 2020–2024 ACS 5-year tract income/poverty detailed-table data.

Uses official api.census.gov. Reads optional CENSUS_API_KEY from environment.
Does not fetch any ACS data from a browser or publish data to the web page.
"""
from collections import Counter
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
import os
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data/acs/tract_income_2024.csv"
MANIFEST = ROOT / "data/acs/tract_income_2024-provenance.json"
API = "https://api.census.gov/data/2024/acs/acs5"
COUNTIES = {"005": "Bronx", "047": "Brooklyn", "061": "Manhattan",
            "081": "Queens", "085": "Staten Island"}
FIELDS = ["B19001_001E"] + [f"B19001_{i:03d}E" for i in range(2, 18)] + ["B17001_001E", "B17001_002E"]


def request_county(county, key):
    params = {"get": ",".join(FIELDS), "for": "tract:*", "in": f"state:36 county:{county}"}
    if key:
        params["key"] = key
    url = f"{API}?{urlencode(params)}"
    try:
        with urlopen(Request(url, headers={"User-Agent": "NYC-Neighborhood-Atlas/0.1"}), timeout=90) as response:
            data = json.load(response)
    except HTTPError as exc:
        extra = (" Set CENSUS_API_KEY to a valid Census API key."
                 if not key and exc.code in (400, 401, 403) else "")
        raise RuntimeError(f"ACS API HTTP {exc.code} for county {county}.{extra}") from exc
    except URLError as exc:
        raise RuntimeError(f"ACS API unavailable for county {county}: {exc}") from exc
    if not isinstance(data, list) or len(data) < 2 or not isinstance(data[0], list):
        raise ValueError(f"Invalid ACS API response for county {county}")
    columns = data[0]
    if any(v not in columns for v in [*FIELDS, "state", "county", "tract"]):
        raise ValueError(f"Missing Census API fields for {county}")
    if len(data) < 50:
        raise ValueError(f"Unexpectedly small ACS response for {county}")
    result = []
    for entry in data[1:]:
        row = dict(zip(columns, entry))
        if row["state"] != "36" or row["county"] != county or len(row["tract"]) != 6:
            raise ValueError(f"Unexpected state/county/tract field in {county}")
        record = {"tract_geoid": row["state"] + row["county"] + row["tract"]}
        record.update({field: row[field] for field in FIELDS})
        result.append(record)
    return result


def main():
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    rows = []
    counts = {}
    for county, name in COUNTIES.items():
        subset = request_county(county, key)
        rows.extend(subset)
        counts[name] = len(subset)
    seen = [r["tract_geoid"] for r in rows]
    if len(seen) != len(set(seen)) or len(rows) < 2000:
        raise ValueError("ACS 2024 tract response had duplicates or incomplete borough coverage")
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=["tract_geoid", *FIELDS], lineterminator="\n")
    writer.writeheader()
    writer.writerows(sorted(rows, key=lambda row: row["tract_geoid"]))
    csv_text = buffer.getvalue()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(csv_text, encoding="utf-8", newline="")
    manifest = {
        "source": API,
        "release": "ACS 2020–2024 5-year Detailed Tables",
        "requested_at_utc": datetime.now(timezone.utc).isoformat(),
        "acs_counties": COUNTIES,
        "tracts_by_borough": counts,
        "tract_rows": len(rows),
        "variables": FIELDS,
        "census_api_key_used": bool(key),
        "csv_sha256": hashlib.sha256(csv_text.encode("utf-8")).hexdigest(),
        "note": "No NTA observations are derived at download time; see build_income_nta.py."
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
