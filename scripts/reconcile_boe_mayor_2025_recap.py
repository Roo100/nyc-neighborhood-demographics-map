#!/usr/bin/env python3
"""Independently reconcile 2025 NYC mayoral ED candidate tallies with certified recap.

Fail closed: no user-visible election layer from this script until all matched.
"""
from collections import Counter,defaultdict
from datetime import datetime,timezone
import csv,io,json,hashlib
from audit_boe_mayor_2025_csv import get_source,DEST
from audit_boe_mayor_2025_units import get_recap,HEADER,COUNTIES,ADMIN,RECAP

BOE_COUNTY={"New York":"New York County","Bronx":"Bronx County",
            "Kings":"Kings County","Queens":"Queens County",
            "Richmond":"Richmond County"}
BALLOT_UNITS={"Public Counter","Manually Counted Emergency","Absentee / Military","Affidavit"}
CANDIDATE_LINES={
   "Zohran Kwame Mamdani (Democratic)":"Zohran Kwame Mamdani",
   "Zohran Kwame Mamdani (Working Families)":"Zohran Kwame Mamdani",
   "Andrew M. Cuomo (Fight and Deliver)":"Andrew M. Cuomo",
   "Curtis A. Sliwa (Republican)":"Curtis A. Sliwa",
   "Curtis A. Sliwa (Protect Animals)":"Curtis A. Sliwa",
   "Irene Estrada (Conservative)":"Irene Estrada",
   "Eric L. Adams (Safe&Affordable/EndAntiSemitism)":"Eric L. Adams",
   "Joseph Hernandez (Quality of Life)":"Joseph Hernandez",
   "Jim Walden (Integrity)":"Jim Walden",
   "Scattered":"Scattered write-in votes"
}
def intval(s):return int(str(s).replace(",","").strip())
def main():
    ed,_,text=get_source()
    recap_text,recap_sha=get_recap()
    by_county_unit=Counter()
    by_county_ballots=Counter()
    ed_keys_by_county=defaultdict(set)
    combined_keys=set()
    for row in csv.reader(io.StringIO(text)):
      if len(row)!=22 or row[:11]!=HEADER:raise ValueError("BOE ED CSV row schema unexpected")
      ad,edno,county,status,event,party,office,dist,for_n,unit,tally=row[11:]
      key=(county,ad.zfill(2),edno.zfill(3))
      n=intval(tally)
      if status!="IN-PLAY":
        combined_keys.add(key)
        if n!=0:raise ValueError("Combined ED contains nonzero tally: "+str(key))
        continue
      ed_keys_by_county[county].add(key)
      if unit in BALLOT_UNITS:by_county_ballots[(county,unit)]+=n
      elif unit in CANDIDATE_LINES:by_county_unit[(county,unit)]+=n
      else:raise ValueError("Unrecognized ballot/candidate unit: "+unit)
    county_prefix={v:k for k,v in BOE_COUNTY.items()}
    recap_counts=Counter()
    recap_ballots=Counter()
    recap_totals=defaultdict(lambda: {"total_votes":set(),"total_ballots":set(),"unrecorded":set()})
    recap_counties=Counter()
    for row in csv.reader(io.StringIO(recap_text)):
      if len(row)<6:continue
      county=county_prefix.get(row[3].strip())
      if county is None:continue
      unit=row[4].strip()
      try:val=intval(row[5])
      except (ValueError,TypeError):continue
      recap_counties[county]+=1
      if unit in CANDIDATE_LINES:recap_counts[(county,unit)]+=1
      if unit in BALLOT_UNITS:recap_ballots[(county,unit)]+=1
      # Do not trust duplicated metadata columns until audited.
      try:
        if len(row)>13 and row[12]=="Total Votes":
          recap_totals[county]["total_votes"].add(intval(row[13]))
        if len(row)>7 and row[6]=="Total Ballots":
          recap_totals[county]["total_ballots"].add(intval(row[7]))
        if len(row)>15 and row[14]=="Unrecorded":
          recap_totals[county]["unrecorded"].add(intval(row[15]))
      except ValueError:pass
    report={
      "status":"OFFICIAL_2025_ED_RECAP_CROSS_CHECK_PENDING",
      "retrieved_at_utc":datetime.now(timezone.utc).isoformat(),
      "ed_source_sha256":hashlib.sha256(ed).hexdigest(),
      "recap_source_sha256":recap_sha,
      "recap_source":RECAP,
      "unique_active_EDs":{county:len(keys) for county,keys in ed_keys_by_county.items()},
      "combined_ED_count":len(combined_keys),
      "recap_row_counts_by_county":dict(recap_counties),
      "recap_candidate_line_frequencies":{
         county:{unit:recap_counts[(county,unit)] for unit in CANDIDATE_LINES}
         for county in BOE_COUNTY
      },
      "recap_ballot_unit_frequencies":{
         county:{unit:recap_ballots[(county,unit)] for unit in BALLOT_UNITS}
         for county in BOE_COUNTY
      },
      "recap_unique_metadata":{
         county:{kind:sorted(values) for kind,values in kinds.items()}
         for county,kinds in recap_totals.items()
      },
      "candidate_votes_by_county":{
         county:{unit:by_county_unit[(county,unit)] for unit in CANDIDATE_LINES}
         for county in BOE_COUNTY
      },
      "ballots_by_county":{
         county:{unit:by_county_ballots[(county,unit)] for unit in BALLOT_UNITS}
         for county in BOE_COUNTY
      }
    }
    DEST.mkdir(parents=True,exist_ok=True)
    (DEST/"mayor_2025_recap_reconciliation_audit.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({
        "recap_counties":dict(recap_counties),
        "recap_candidate_frequency":report["recap_candidate_line_frequencies"],
        "metadata":report["recap_unique_metadata"],
        "active_ED_counts":report["unique_active_EDs"],
        "combined_ED_count":len(combined_keys)
    },ensure_ascii=False))
    print("HOLD: audit report created, no election values displayed on site.")
if __name__=="__main__":main()
