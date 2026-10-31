#!/usr/bin/env python3
"""Derive audit-ready 2020-NTA income/poverty/race from 2024 ACS 5-year tracts.

All 262 NTAs retained even when a metric is missing; no implicit zeros.
Derived NTA percentages are ratios of count sums, not tract percent averages.
MOEs are 90% approximate; output is research-only, never web-published.
"""
from collections import Counter,defaultdict
from datetime import datetime,timezone
from math import sqrt
from pathlib import Path
import csv,json

from build_income_nta import as_count,grouped_median,parse_crosswalk,BRACKET_COLS

ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/"data/acs/tract_acs_2024_full.csv"
XWALK=ROOT/"data/tract_to_nta2020.csv"
GEOMETRY=ROOT/"data/nta2020.geojson"
OUT=ROOT/"data/acs/nta_demographics_2024_review.json"
RACE_COLS={
  "White non-Hispanic":"B03002_003E",
  "Black non-Hispanic":"B03002_004E",
  "Asian non-Hispanic":"B03002_006E",
  "Hispanic (any race)":"B03002_012E"
}
TOTAL_NH="B03002_002E"
RACE_TOTAL="B03002_001E"
POV_TOTAL="B17001_001E"
POV_BELOW="B17001_002E"

def moe_key(estimate_key):
    if not estimate_key.endswith("E"):raise ValueError("Expected estimate column key")
    return estimate_key[:-1]+"M"
def count_sum(rows,key):
    vals=[as_count(r.get(key)) for r in rows]
    return sum(vals) if all(v is not None for v in vals) else None
def summed_moe(rows,key):
    vals=[as_count(r.get(moe_key(key))) for r in rows]
    return round(sqrt(sum(v*v for v in vals))) if all(v is not None for v in vals) else None
def rate(n,d):
    return round(n/d*100,2) if d and n is not None else None
def conservative_percentage_moe(n,d,moe_n,moe_d):
    """Upper-side approximation, not Census-published NTA margin of error."""
    if not d or None in (n,moe_n,moe_d):return None
    r=n/d
    return round(100*sqrt(moe_n*moe_n+r*r*moe_d*moe_d)/d,2)

def summarise(rows):
    # Metric level fail-closed: a missing field or suppressed tract disallows
    # publication of that metric for the entire NTA.
    households=count_sum(rows,"B19001_001E")
    brackets=[count_sum(rows,key) for key in BRACKET_COLS]
    income_valid=households is not None and all(v is not None for v in brackets)
    if income_valid and sum(brackets)!=households:income_valid=False
    approx_median=grouped_median(brackets,households) if income_valid else None
    poverty_universe=count_sum(rows,POV_TOTAL)
    below_poverty=count_sum(rows,POV_BELOW)
    poverty_valid=(poverty_universe is not None and below_poverty is not None and
       poverty_universe>=below_poverty and poverty_universe>0)
    poverty_moe=conservative_percentage_moe(
       below_poverty,poverty_universe,
       summed_moe(rows,POV_BELOW),summed_moe(rows,POV_TOTAL)) if poverty_valid else None
    total=count_sum(rows,RACE_TOTAL)
    nonhisp=count_sum(rows,TOTAL_NH)
    race_counts={name:count_sum(rows,key) for name,key in RACE_COLS.items()}
    race_valid=total is not None and total>0 and nonhisp is not None and all(v is not None for v in race_counts.values())
    race_moes={name:summed_moe(rows,key) for name,key in RACE_COLS.items()}
    if race_valid:
        other=nonhisp-race_counts["White non-Hispanic"]-race_counts["Black non-Hispanic"]-race_counts["Asian non-Hispanic"]
        if other<0 or sum(race_counts.values())+other!=total:race_valid=False
        else:
            race_counts["Other non-Hispanic"]=other
            other_components=[summed_moe(rows,k) for k in [TOTAL_NH,RACE_COLS["White non-Hispanic"],
             RACE_COLS["Black non-Hispanic"],RACE_COLS["Asian non-Hispanic"]]]
            race_moes["Other non-Hispanic"]=round(sqrt(sum(v*v for v in other_components))) if all(v is not None for v in other_components) else None
    race_shares={name:rate(v,total) for name,v in race_counts.items()} if race_valid else None
    race_shares_moe={name:conservative_percentage_moe(v,total,race_moes.get(name),summed_moe(rows,RACE_TOTAL))
        for name,v in race_counts.items()} if race_valid else None
    return {
      "households":households if income_valid else None,
      "income_status":"derived_approximation" if approx_median is not None else "not_available",
      "median_household_income_grouped_approx_usd":approx_median,
      "household_count_moe_90_approx":summed_moe(rows,"B19001_001E") if income_valid else None,
      "poverty_universe_people":poverty_universe if poverty_valid else None,
      "poverty_below_count":below_poverty if poverty_valid else None,
      "poverty_rate_pct":rate(below_poverty,poverty_universe) if poverty_valid else None,
      "poverty_rate_moe_90_pp_conservative":poverty_moe,
      "race_total_population":total if race_valid else None,
      "race_ethnicity_counts":race_counts if race_valid else None,
      "race_ethnicity_percent":race_shares,
      "race_ethnicity_moe_90_pp_conservative":race_shares_moe,
      "race_status":"complete" if race_valid else "not_available",
      "poverty_status":"complete" if poverty_valid else "not_available"
    }

def main():
    geo=json.loads(GEOMETRY.read_text(encoding="utf-8"))
    nta={f["properties"]["nta2020"] for f in geo["features"]}
    if len(nta)!=262:raise ValueError("Pinned official DCP geometry must contain 262 NTAs")
    equiv=parse_crosswalk(XWALK)
    index={}
    with SOURCE.open(newline="",encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            geoid=row["tract_geoid"]
            if len(geoid)!=11 or geoid in index:raise ValueError("Invalid/duplicate ACS tract "+geoid)
            index[geoid]=row
    by_nta=defaultdict(list)
    for geoid,code in equiv.items():
        if code not in nta:raise ValueError("Unknown NTA code "+code)
        by_nta[code].append(geoid)
    results=[]
    reasons=Counter()
    for code in sorted(nta):
        member_ids=by_nta.get(code,[])
        matched=[index.get(g) for g in member_ids]
        if not member_ids or any(r is None for r in matched):
            reasons["missing_acs_tract_or_equivalency"]+=1
            record={"nta2020":code,"status":"unavailable","tracts_expected":len(member_ids),
                "reason":"Missing official 2020 tract or NTA equivalency"}
        else:
            metrics=summarise(matched)
            record={"nta2020":code,"status":"research_only","tracts_expected":len(matched),**metrics}
            for field in ("income_status","race_status","poverty_status"):
                if record[field] in ("not_available",):reasons[field+"_unavailable"]+=1
        results.append(record)
    if len(results)!=262:raise ValueError("Missing NTA record")
    source_manifest=json.loads((ROOT/"data/acs/summary-file-provenance-2024.json").read_text())
    output={
      "status":"RESEARCH_QA_ONLY_NOT_AUTHORIZED_FOR_WEBSITE",
      "source":"2020–2024 ACS 5-year table-based Summary Files",
      "source_manifest_sha256":source_manifest["full_csv_sha256"],
      "reference_geography":"Official NYC 2020 NTAs (9nt8-h7nd); tract equivalency hm78-6dwm",
      "created_at_utc":datetime.now(timezone.utc).isoformat(),
      "nta_count":len(results),
      "unmatched_acs_tracts":sorted(set(index)-set(equiv)),
      "suppression_reasons":dict(reasons),
      "income_median_method":"Derived bracket interpolation; not ACS published B19013 median; no defensible exact MOE",
      "race_groups":"Mutually exclusive Hispanic any race, non-Hispanic White alone, Black alone, Asian alone and other non-Hispanic",
      "moe_method":"90% NTA count MOEs by RSS of tract MOEs, rate MOEs conservative ratio approximation, not Census-published values",
      "publish_gate":"HOLD pending borough reconciliation, source suppression review, special-purpose NTA handling, user approval",
      "records":results
    }
    OUT.write_text(json.dumps(output,separators=(",",":"))+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in output.items() if k not in ("records","unmatched_acs_tracts")},indent=2))

if __name__=="__main__":main()
