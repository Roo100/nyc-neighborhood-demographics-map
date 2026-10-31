#!/usr/bin/env python3
"""Publishable subset of research-validated ACS NTA derived estimates.

Respects 2020 NTA types, minimum denominators and approximate 90% MOEs.
Never represents grouped-data medians as an ACS published B19013 median.
"""
from collections import Counter
from datetime import datetime,timezone
from pathlib import Path
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/"data/acs/nta_demographics_2024_review.json"
GEO=ROOT/"data/nta2020.geojson"
OUT=ROOT/"data/acs/nta_display_2024.json"

def accept_income(r):
    return (isinstance(r.get("median_household_income_grouped_approx_usd"),int)
      and r.get("households",0)>=50
      and r.get("household_count_moe_90_approx") is not None
      and r["household_count_moe_90_approx"]<=r["households"]*.5)
def accept_poverty(r):
    return (r.get("poverty_rate_pct") is not None
      and r.get("poverty_universe_people",0)>=100
      and r.get("poverty_rate_moe_90_pp_conservative") is not None
      and r["poverty_rate_moe_90_pp_conservative"]<=20)
def accept_race(r,key):
    shares=r.get("race_ethnicity_percent") or {}
    moes=r.get("race_ethnicity_moe_90_pp_conservative") or {}
    return (r.get("race_total_population",0)>=100 and
      isinstance(shares.get(key),(int,float))
      and isinstance(moes.get(key),(int,float))
      and 0<=shares[key]<=100 and 0<=moes[key]<=20)
RACE_NAMES=[
  "White non-Hispanic","Black non-Hispanic","Asian non-Hispanic",
  "Hispanic (any race)","Other non-Hispanic"
]
def main():
    source=json.loads(SRC.read_text(encoding="utf-8"))
    if source.get("status")!="RESEARCH_QA_ONLY_NOT_AUTHORIZED_FOR_WEBSITE":
        raise ValueError("Research data provenance or review gate mismatch")
    features=json.loads(GEO.read_text(encoding="utf-8"))["features"]
    special={x["properties"]["nta2020"]:str(x["properties"].get("ntatype","0"))!="0" for x in features}
    research=source["records"]
    if len(special)!=262 or len(research)!=262:raise ValueError("2020 NTA coverage incomplete")
    result=[]; counters=Counter()
    for r in research:
        code=r["nta2020"]
        if code not in special:raise ValueError("Unknown 2020 NTA "+code)
        is_special=special[code]
        household_income=r["median_household_income_grouped_approx_usd"] if not is_special and accept_income(r) else None
        poverty=r["poverty_rate_pct"] if not is_special and accept_poverty(r) else None
        race={}
        for name in RACE_NAMES:
            if not is_special and accept_race(r,name):
                race[name]={"pct":r["race_ethnicity_percent"][name],
                            "moe_pp_90_approx":r["race_ethnicity_moe_90_pp_conservative"][name]}
            else:race[name]=None
        if household_income is not None:counters["income"]+=1
        if poverty is not None:counters["poverty"]+=1
        for name,v in race.items():
            if v is not None:counters["race_"+name]+=1
        result.append({
          "nta2020":code,
          "special_purpose":is_special,
          "median_household_income_grouped_approx_usd":household_income,
          "median_note":"Grouped ACS income-bracket interpolation, NOT the official B19013 median; no median MOE" if household_income is not None else None,
          "poverty_rate_pct":poverty,
          "poverty_rate_moe_90_pp_conservative":r["poverty_rate_moe_90_pp_conservative"] if poverty is not None else None,
          "race_ethnicity":race,
          "population_source":"2020-2024 ACS 5-year, not 2020 Census" if any(x is not None for x in race.values()) else None
        })
    if len({x["nta2020"] for x in result})!=262:raise ValueError("NTA duplicates")
    if counters["income"]<185 or counters["poverty"]<185 or counters["race_Black non-Hispanic"]<185:
        raise ValueError("Excessively incomplete NTA display dataset "+str(counters))
    payload={
      "status":"DERIVED_ACS_ESTIMATES_WITH_EXPLICIT_90_PERCENT_UNCERTAINTY",
      "publication_note":"Derived NTA-level tract aggregates, not published Census NTA estimates; do not use for exact comparisons without MOE",
      "acs_source":"US Census Bureau 2020-2024 5-year ACS Detailed Tables (table-based Summary File)",
      "acs_source_page":"https://www.census.gov/programs-surveys/acs/data/summary-file.2024.html",
      "nta_geography":"2020 NYC NTA (9nt8-h7nd), 2020 Census tract equivalency hm78-6dwm",
      "source_research_sha256":hashlib.sha256(SRC.read_bytes()).hexdigest(),
      "generated_at_utc":datetime.now(timezone.utc).isoformat(),
      "reference_dollars":"2024 inflation-adjusted USD",
      "quality_rules":"Income: >=50 households and household-count MOE <=50% of estimate. Poverty: >=100 persons and 90% approximate MOE <=20pp. Race: >=100 persons and category 90% approximate MOE <=20pp. Special-purpose NTAs excluded.",
      "race_categories":"Mutually exclusive Hispanic any race and four non-Hispanic groups",
      "moe_warning":"90% MOEs combined from tracts by root-sum-square; ratio MOE conservative approximation; no median MOE",
      "availability_counts":dict(counters),
      "records":result
    }
    OUT.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False)+"\n",encoding="utf-8")
    print("ACS_DISPLAY_VALIDATION",json.dumps({"counts":dict(counters),"special_purpose_nta":sum(special.values()),"total":len(result)}),flush=True)

if __name__=="__main__":main()
