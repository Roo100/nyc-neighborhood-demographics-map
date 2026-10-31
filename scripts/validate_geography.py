#!/usr/bin/env python3
"""Fail-closed structural and coordinate validation of the NYC DCP 2020 NTA GeoJSON.

Source: NYC Open Data 9nt8-h7nd (2020 NTA, DCP version as of download).
Requires no third-party Python packages.
"""
import collections
import hashlib
import json
import math
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PATH = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data" / "nta2020.geojson"
BOROUGHS = {"Bronx", "Brooklyn", "Manhattan", "Queens", "Staten Island"}
CODE_PATTERN = re.compile(r"^[A-Z]{2}\d{4}$")
# Intentionally wider than city extents; catches coordinate projection and ordering errors.
LON_RANGE = (-74.60, -73.40)
LAT_RANGE = (40.30, 41.10)


def fail(message):
    raise SystemExit("INVALID: " + message)


def check_ring(ring, code):
    if not isinstance(ring, list) or len(ring) < 4:
        fail(f"{code}: polygon ring has fewer than four positions")
    if ring[0][:2] != ring[-1][:2]:
        fail(f"{code}: unclosed polygon ring")
    for position in ring:
        if not isinstance(position, list) or len(position) < 2:
            fail(f"{code}: malformed coordinate position")
        lon, lat = position[:2]
        if not all(isinstance(x, (int, float)) and not isinstance(x, bool)
                   and math.isfinite(x) for x in (lon, lat)):
            fail(f"{code}: nonnumeric coordinate")
        if not (LON_RANGE[0] <= lon <= LON_RANGE[1]
                and LAT_RANGE[0] <= lat <= LAT_RANGE[1]):
            fail(f"{code}: coordinate ({lon}, {lat}) outside NYC WGS84 bounds")


def check_geometry(geometry, code):
    if not isinstance(geometry, dict):
        fail(f"{code}: missing geometry")
    kind = geometry.get("type")
    coords = geometry.get("coordinates")
    if kind not in ("Polygon", "MultiPolygon") or not isinstance(coords, list) or not coords:
        fail(f"{code}: not a nonempty Polygon/MultiPolygon")
    polygons = [coords] if kind == "Polygon" else coords
    for polygon in polygons:
        if not isinstance(polygon, list) or not polygon:
            fail(f"{code}: polygon missing rings")
        for ring in polygon:
            check_ring(ring, code)


def validate(path=PATH):
    if not path.exists():
        fail(f"{path} not found. Download official dataset 9nt8-h7nd first.")
    raw = path.read_bytes()
    try:
        data = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        fail(f"invalid JSON: {exc}")
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        fail("expected GeoJSON FeatureCollection")
    features = data["features"]
    if len(features) != 262:
        fail(f"expected 262 NTAs, found {len(features)}")
    counts = collections.Counter()
    special = collections.Counter()
    codes = set()
    for index, feature in enumerate(features, 1):
        if feature.get("type") != "Feature":
            fail(f"row {index}: missing GeoJSON Feature type")
        p = feature.get("properties") or {}
        code = str(p.get("nta2020") or "").strip()
        name = str(p.get("ntaname") or "").strip()
        borough = str(p.get("boroname") or "").strip()
        area_type = str(p.get("ntatype") if p.get("ntatype") is not None else "").strip()
        if not CODE_PATTERN.fullmatch(code) or not name or borough not in BOROUGHS:
            fail(f"row {index}: missing/invalid nta2020, ntaname, or boroname")
        if code in codes:
            fail(f"duplicate NTA code: {code}")
        if not re.fullmatch(r"\d", area_type):
            fail(f"{code}: missing/invalid NTAType")
        codes.add(code)
        check_geometry(feature.get("geometry"), code)
        counts[borough] += 1
        if area_type != "0":
            special[borough] += 1
    if set(counts) != BOROUGHS:
        fail("not all five boroughs are covered")
    return {
        "status": "VALID",
        "source_dataset_id": "9nt8-h7nd",
        "geography": "2020 NTAs",
        "features": len(features),
        "by_borough": dict(sorted(counts.items())),
        "special_purpose_by_borough": dict(sorted(special.items())),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "bytes": len(raw),
        "geographic_exceptions": {
            code: next(
                (str(f["properties"].get("boroname"))
                 for f in features if f["properties"].get("nta2020") == code),
                "not present"
            ) for code in ("BX0802", "QN0151")
        },
    }


if __name__ == "__main__":
    print(json.dumps(validate(), indent=2))
