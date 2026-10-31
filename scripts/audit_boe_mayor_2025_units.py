#!/usr/bin/env python3
"""Research QA on NYC BOE 2025 mayoral ED votes and certified recap CSV.

No NTA/ED geographic overlay is authorized by this report.
"""
from collections import Counter, defaultdict
import csv
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen
from audit_boe_mayor_2025_csv import get_source, DEST, SOURCE
from datetime import datetime, timezone
import hashlib

RECAP="https://www.vote.nyc/sites/default/files/pdf/election_results/2025/20251104General%20Election/00000100000Citywide%20Mayor%20Citywide%20Recap.csv"
HEADER=["AD","ED","County","EDAD Status","Event","Party/Independent Body",
        "Office/Position Title","District Key","VoteFor","Unit Name","Tally"]
ADMIN={"Public Counter","Manually Counted Emergency","Absentee / Military","Federal","Affidavit",
       "Scattered","Total Ballots","Less - Inapplicable Federal/Special Presidential Ballots","Total Applicable Ballots","Unrecorded"}
COUNTIES={"New York","Bronx","Kings","Queens","Richmond"}

def get_recap():
    req=Request(RECAP,headers={"User-Agent":"Mozilla/5.0 NYC-POP-official-election-reconciliation/1.0","Accept":"text/csv,*/*"})
    with urlopen(req,timeout=90) as r:
        data=r.read(5_000_000)
    return data.decode("utf-8-sig"),hashlib.sha256(data).hexdigest()

def main():
    raw,_,text=get_source()
    rows=list(csv.reader(io.StringIO(text)))
    keys=Counter()
    statuses=Counter()
    unit_freq=Counter()
    unit_tally=Counter()
    events=Counter()
    invalid=[]
    duplicates=Counter()
    candidate_samples=[]
    admin_samples=[]
    examples={}
    lines_by_county=Counter()
    for i,row in enumerate(rows,1):
        if len(row)!=22 or row[:11]!=HEADER:
            invalid.append({"row":i,"error":"unexpected fixed BOE export prefix/width"});continue
        ad,ed,county,status,event,party,office,dist,vote_for,unit,tally=row[11:]
        if county not in COUNTIES or office.strip()!="Mayor" or vote_for.strip()!="1" or dist.strip()!="NYC":
            invalid.append({"row":i,"county":county,"office":office,"district":dist});continue
        try: votes=int(tally.replace(",",""))
        except ValueError: invalid.append({"row":i,"tally":tally});continue
        if votes<0:invalid.append({"row":i,"negative":votes});continue
        key=(county,ad.zfill(2),ed.zfill(3),status,party,unit)
        duplicates[key]+=1
        statuses[status]+=1
        events[event]+=1
        unit_freq[unit]+=1
        unit_tally[unit]+=votes
        lines_by_county[county]+=1
        keys[(county,ad.zfill(2),ed.zfill(3))]+=1
        if unit not in ADMIN and len(candidate_samples)<18:
            candidate_samples.append({"county":county,"AD":ad,"ED":ed,"status":status,
               "party":party,"unit":unit,"votes":votes})
        if unit in ADMIN and len(admin_samples)<7:
            admin_samples.append({"unit":unit,"votes":votes,"status":status})
        examples.setdefault(unit,{"county":county,"AD":ad,"ED":ed,"votes":votes})
    try:
        recap_text,recap_hash=get_recap()
        recap_rows=list(csv.reader(io.StringIO(recap_text)))
        recap_sample=recap_rows[:10]
    except Exception as e:
        recap_hash=None;recap_rows=[];recap_sample=[["RECAP_RETRIEVAL_FAILED",str(e)[:250]]]
    if invalid:
        raise ValueError("Unexpected BOE raw structure, samples: "+json.dumps(invalid[:5]))
    if len(keys)<4000 or not unit_freq:
        raise ValueError("Unexpectedly few distinct election-district identifiers")
    report={
       "status":"RESEARCH_ONLY_NOT_FOR_PUBLIC_MAP",
       "as_of_utc":datetime.now(timezone.utc).isoformat(),
       "official_ed_csv":SOURCE,"ed_csv_sha256":hashlib.sha256(raw).hexdigest(),
       "official_recap_csv":RECAP,"recap_sha256":recap_hash,
       "line_count":len(rows),"unique_county_AD_ED_keys":len(keys),
       "county_line_counts":dict(lines_by_county),
       "status_counts":dict(statuses),
       "event_counts":dict(events),
       "unit_name_counts":dict(unit_freq.most_common()),
       "unit_name_tallies":dict(unit_tally.most_common()),
       "duplicate_full_rows_keys":sum(v>1 for v in duplicates.values()),
       "duplicates_sample":[{"key":list(k),"count":v} for k,v in duplicates.items() if v>1][:12],
       "candidate_samples":candidate_samples,
       "recap_row_count":len(recap_rows),
       "recap_first_rows":recap_sample,
       "special_types":[k for k in unit_freq if "combined" in k.lower() or "unrecord" in k.lower()],
       "source_cautions":[
          "No winners determined until candidate/ballot-line totals match certified recap",
          "In-play versus combined district rows need separate treatment",
          "2026 DCP ED geography might mismatch November 2025 ED boundaries",
          "No NTA-level votes without official 2025 spatial crosswalk"
       ]
    }
    DEST.mkdir(parents=True,exist_ok=True)
    (DEST/"mayor_2025_ed_units_audit.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
        "ED_keys":len(keys),"lines":len(rows),"statuses":dict(statuses),
        "units":unit_freq.most_common(50),"unit_votes":unit_tally.most_common(40),
        "candidate_samples":candidate_samples[:9],
        "recap_rows":len(recap_rows),"recap_sample":recap_sample[:3],
        "duplicates":report["duplicate_full_rows_keys"]
    },ensure_ascii=False))
    print("HOLD: no 2025 precinct, candidate or neighborhood results published.")
if __name__=="__main__":
    main()
