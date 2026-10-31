#!/usr/bin/env python3
"""Audit the staged 2024 ACS 5-year tract-to-2020-NTA income/poverty build.

Produces a *summary only* for researcher review. No output authorizes publication
of estimated neighborhood income or poverty values.
"""
from collections import Counter
from datetime import datetime, timezone
import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACS = ROOT / "data" / "acs"
BUILD = ACS / "nta_income_2024.json"
RAW = ACS / "tract_income_2024.csv"
OUT = ACS / "qa_summary_2024.json"

def audit():
    data = json.loads(BUILD.read_text(encoding="utf-8"))
    rows = data.get("records", [])
    codes = [r.get("nta2020") for r in rows]
    if len(rows) != 262 or len(set(codes)) != 262:
        raise ValueError("NTA aggregation did not produce 262 unique records")
    geography = json.loads((ROOT / "data/nta2020.geojson").read_text(encoding="utf-8"))
    known = {x["properties"]["nta2020"] for x in geography["features"]}
    if set(codes) != known:
        raise ValueError("NTA aggregation codes differ from official 2020 geography")
    with RAW.open(newline="", encoding="utf-8") as f:
        source_rows = list(csv.DictReader(f))
    if len({r["tract_geoid"] for r in source_rows}) != len(source_rows):
        raise ValueError("Duplicate ACS tract GEOIDs")
    reason_counts = Counter()
    incomplete = []
    for r in rows:
        if r["status"] == "not_available":
            incomplete.append(r["nta2020"])
            for reason in r.get("reasons", []):
                reason_counts[reason.split(" in tract")[0].split(" ACS tract")[0]] += 1
        elif r["status"] != "derived_from_tract_acs":
            raise ValueError("Unexpected or untrusted status")
    accepted = [r for r in rows if r["status"] == "derived_from_tract_acs"]
    if sum(bool(r.get("households", 0) < 0) for r in accepted):
        raise ValueError("Negative household count")
    if any(r["poverty_rate_pct"] is not None and not (0 <= r["poverty_rate_pct"] <= 100) for r in accepted):
        raise ValueError("Impossible poverty rate")
    no_median = [r["nta2020"] for r in accepted if r["median_household_income_grouped_approx_usd"] is None]
    no_poverty = [r["nta2020"] for r in accepted if r["poverty_rate_pct"] is None]
    geo_special = {x["properties"]["nta2020"] for x in geography["features"] if str(x["properties"].get("ntatype")) != "0"}
    published_actual_medians = 0  # None were obtained or verified in this pipeline.
    findings = {
        "checked_at_utc": datetime.now(timezone.utc).isoformat(),
        "status": "RESEARCH_QA_ONLY_NOT_APPROVED_FOR_WEBSITE",
        "source_period": "2020-2024 ACS five-year, 2024 inflation-adjusted dollars",
        "nta_geography": "Official NYC DCP 2020 NTAs (9nt8-h7nd)",
        "tract_equivalency": "Official NYC DCP 2020 tract-to-2020 NTA (hm78-6dwm)",
        "acs_source_tract_rows": len(source_rows),
        "nta_total": len(rows),
        "nta_complete_all_required_fields": len(accepted),
        "nta_unavailable": len(incomplete),
        "nta_unavailable_codes": incomplete,
        "unavailability_reason_counts": dict(reason_counts),
        "acs_tracts_not_in_crosswalk": data.get("acs_tracts_not_in_official_equivalency", []),
        "nta_with_grouped_median_approx": len(accepted)-len(no_median),
        "nta_grouped_median_unavailable": no_median,
        "nta_poverty_rate_unavailable": no_poverty,
        "special_purpose_nta_count": len(geo_special),
        "special_purpose_nta_with_complete_tracts": len(geo_special & {r["nta2020"] for r in accepted}),
        "published_acs_dcp_nta_medians_verified": published_actual_medians,
        "sampling_error": "MOEs not propagated through aggregation; not yet suitable as precise local point estimates",
        "caveat": "Grouped-data medians are derived approximations, not ACS B19013 published medians",
        "publish_gate": "HOLD: verify tract completeness, suppressed data, MOEs, borough-level reconciliation and special-purpose handling before enabling visual layers",
    }
    OUT.write_text(json.dumps(findings, indent=2)+"\n", encoding="utf-8")
    print(json.dumps({k:v for k,v in findings.items() if k not in ("nta_unavailable_codes","nta_grouped_median_unavailable","nta_poverty_rate_unavailable","acs_tracts_not_in_crosswalk")}, indent=2))
    print("HOLD — dataset is staged for QA only; site remains unchanged.")
    return findings

if __name__ == "__main__":
    audit()
