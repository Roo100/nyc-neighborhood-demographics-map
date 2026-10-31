#!/usr/bin/env python3
"""Pin NYC DCP's May 2026 (26b) community-district polygons, fail closed on surprises.

Source: https://data.cityofnewyork.us/d/5crt-au7u
59 actual community districts plus 12 Joint Interest Areas. No elected officials
are inferred from these polygons and no NTA->board one-to-one lookup is made.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "civic"
SRC = "https://data.cityofnewyork.us/resource/5crt-au7u.geojson?$limit=1000"
BORO_COUNTS = {1: 12, 2: 12, 3: 18, 4: 14, 5: 3}

def normalize(raw):
    if raw.get("type") != "FeatureCollection":
        raise ValueError("Expected official GeoJSON FeatureCollection")
    features = raw.get("features")
    if not isinstance(features, list) or len(features) != 71:
        raise ValueError(f"Expected 71 DCP community district/JIA features, received {len(features) if isinstance(features, list) else 'not a list'}")
    seen, parsed, counts = set(), [], Counter()
    special = 0
    for f in features:
        raw_code = f.get("properties", {}).get("boro_cd", f.get("properties", {}).get("borocd"))
        try:
            code = int(raw_code)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid BoroCD: {raw_code!r}") from exc
        borough, district = divmod(code, 100)
        if code in seen or borough not in BORO_COUNTS:
            raise ValueError(f"Duplicate or invalid BoroCD: {code}")
        seen.add(code)
        if 1 <= district <= BORO_COUNTS[borough]:
            counts[borough] += 1
        elif district >= 90:
            special += 1
        else:
            raise ValueError(f"Unexpected community board/JIA district code: {code}")
        g = f.get("geometry")
        if not isinstance(g, dict) or g.get("type") not in ("Polygon", "MultiPolygon") or not g.get("coordinates"):
            raise ValueError(f"BoroCD {code} lacks valid polygon geometry")
        for polygon in ([g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]):
            for ring in polygon:
                if len(ring) < 4:
                    raise ValueError(f"BoroCD {code} invalid ring")
                for point in ring:
                    lon, lat = point[:2]
                    if not (-74.65 < lon < -73.35 and 40.25 < lat < 41.15):
                        raise ValueError(f"Unexpected non-NYC coordinate in {code}: {lon}, {lat}")
        parsed.append({"type": "Feature", "properties": {"boro_cd": code}, "geometry": g})
    if counts != Counter(BORO_COUNTS) or special != 12:
        raise ValueError(f"Expected 59 borough boards and 12 JIAs; got counts={dict(counts)}, JIAs={special}")
    return {"type": "FeatureCollection", "features": sorted(parsed, key=lambda f: f["properties"]["boro_cd"])}

def main():
    req = Request(SRC, headers={"User-Agent": "NYC-POP-civic-data-audit/1.0 (Roo100 public GIS map)", "Accept": "application/geo+json, application/json"})
    with urlopen(req, timeout=75) as resp:
        payload = resp.read()
        if len(payload) > 32_000_000:
            raise ValueError("Unexpectedly large source response")
    try:
        raw = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ValueError("Official Socrata endpoint did not return parseable JSON") from exc
    clean = normalize(raw)
    DEST.mkdir(parents=True, exist_ok=True)
    compact = (json.dumps(clean, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    (DEST / "community-districts-2026.geojson").write_bytes(compact)
    report = {
        "dataset": "NYC DCP 2026 26b Community Districts",
        "source": SRC,
        "source_page": "https://data.cityofnewyork.us/d/5crt-au7u",
        "downloaded_at_utc": datetime.now(timezone.utc).isoformat(),
        "source_sha256": hashlib.sha256(payload).hexdigest(),
        "pinned_sha256": hashlib.sha256(compact).hexdigest(),
        "community_board_count": 59,
        "joint_interest_area_count": 12,
        "borough_board_counts": BORO_COUNTS,
        "rules": "Board IDs by BoroCD and validated 59+12 source counts. No inferred geographic crosswalk to 2020 NTAs."
    }
    (DEST / "community-districts-2026-validation.json").write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in report.items() if k != "rules"}, indent=2))
if __name__ == "__main__":
    main()
