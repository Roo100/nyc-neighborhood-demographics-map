#!/usr/bin/env python3
"""Pin official NYC DCP 2020 Census Tract → 2020 NTA equivalency.

Official source: NYC Open Data hm78-6dwm (field ntacode). Never infer tract assignment from
centroids, postal ZIPs, precincts or NTA-code prefixes.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
NTA_PATH = ROOT / "data" / "nta2020.geojson"
TARGET = ROOT / "data" / "tract_to_nta2020.csv"
REPORT = ROOT / "data" / "tract_to_nta2020-validation.json"
SOURCE = "https://data.cityofnewyork.us/resource/hm78-6dwm.json?$limit=5000"


def required(row, field):
    value = next((v for k, v in row.items() if k.lower() == field.lower()), None)
    return str(value).strip() if value is not None else ""


def build(rows, nta_codes):
    if not isinstance(rows, list) or not (2000 <= len(rows) <= 3000):
        raise ValueError(f"Unexpected crosswalk record count: {len(rows) if isinstance(rows, list) else 'not a list'}")
    pairs = {}
    unassigned = []
    seen = set()
    for row in rows:
        geoid = required(row, "geoid")
        nta = required(row, "ntacode")
        if len(geoid) != 11 or not geoid.isdigit() or not geoid.startswith("36"):
            raise ValueError(f"Unexpected Census tract GEOID: {geoid!r}")
        if geoid in seen:
            raise ValueError(f"Census tract GEOID {geoid} appears more than once")
        seen.add(geoid)
        if not nta:
            # Official source includes some tracts without an NTA. Never invent a code.
            unassigned.append(geoid)
            continue
        if nta not in nta_codes:
            raise ValueError(f"Tract {geoid}: NTA {nta!r} does not match pinned geography")
        pairs[geoid] = nta
    if len(pairs) < 1800:
        raise ValueError("Too few mapped tracts; source may be incomplete")
    if len({value for value in pairs.values()}) < 180:
        raise ValueError("Insufficient NTA coverage; source could be truncated or incompatible")
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["tract_geoid", "nta2020"])
    writer.writerows(sorted(pairs.items()))
    return output.getvalue(), pairs, sorted(unassigned)


def main():
    if not NTA_PATH.exists():
        raise SystemExit("Pinned NTA boundary file required before tract crosswalk")
    nta_geo = json.loads(NTA_PATH.read_text())
    nta_codes = {f["properties"]["nta2020"] for f in nta_geo["features"]}
    if len(nta_codes) != 262:
        raise SystemExit("Pinned 262-feature NTA geography failed validation")
    request = Request(SOURCE, headers={"User-Agent": "NYC-Neighborhood-Atlas/0.1"})
    with urlopen(request, timeout=90) as response:
        raw = response.read()
    rows = json.loads(raw)
    csv_text, pairs, unassigned = build(rows, nta_codes)
    TARGET.write_text(csv_text, encoding="utf-8", newline="")
    report = {
        "status": "VALID",
        "source_dataset_id": "hm78-6dwm",
        "source_url": SOURCE,
        "source_geography": "2020 Census tracts and 2020 NTAs",
        "tracts_in_source": len(rows),
        "mapped_tracts": len(pairs),
        "unassigned_tracts_count": len(unassigned),
        "unassigned_tract_geoids": unassigned,
        "nta_codes_with_at_least_one_tract": len(set(pairs.values())),
        "unmatched_nta_codes": sorted(nta_codes - set(pairs.values())),
        "csv_sha256": hashlib.sha256(csv_text.encode("utf-8")).hexdigest(),
        "raw_source_sha256": hashlib.sha256(raw).hexdigest(),
        "notes": "Tracts in water areas are omitted by source; not a guarantee of 100% coverage of ACS 2024 tract IDs."
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
