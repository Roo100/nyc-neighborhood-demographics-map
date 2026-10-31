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
    recap_candidate_values=Counter()
    recap_ballots=Counter()
    recap_ballot_values=Counter()
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
      if unit in CANDIDATE_LINES:
        recap_counts[(county,unit)]+=1
        recap_candidate_values[(county,unit)]+=val
      if unit in BALLOT_UNITS:
        recap_ballots[(county,unit)]+=1
        recap_ballot_values[(county,unit)]+=val
      # Do not trust duplicated metadata columns until audited.
      try:
        if len(row)>13 and row[12]=="Total Votes":
          recap_totals[county]["total_votes"].add(intval(row[13]))
        if len(row)>7 and row[6]=="Total Ballots":
          recap_totals[county]["total_ballots"].add(intval(row[7]))
        if len(row)>15 and row[14]=="Unrecorded":
          recap_totals[county]["unrecorded"].add(intval(row[15]))
      except ValueError:pass
    # All nine major candidate ballot lines appear once per county in the
    # certified recap. 'Scattered' write-ins appear only as a remainder,
    # so independently reconcile total votes and unrecorded by county.
    for county in BOE_COUNTY:
      meta=recap_totals[county]
      if any(len(meta[k])!=1 for k in ("total_votes","total_ballots","unrecorded")):
        raise ValueError("Certified recap county metadata ambiguous "+county)
      total_votes=next(iter(meta["total_votes"]))
      total_ballots=next(iter(meta["total_ballots"]))
      unrecorded=next(iter(meta["unrecorded"]))
      if total_votes+unrecorded!=total_ballots:
        raise ValueError("Certified recap county total-vote/unrecorded reconciliation failed "+county)
      ed_ballots=sum(by_county_ballots[(county,unit)] for unit in BALLOT_UNITS)
      ed_votes=sum(by_county_unit[(county,unit)] for unit in CANDIDATE_LINES)
      if ed_ballots!=total_ballots or ed_votes!=total_votes:
        raise ValueError("ED tallies do not reconcile to certified recap "+county+
           f": ED ballots {ed_ballots}, recap {total_ballots}, ED votes {ed_votes}, recap {total_votes}")
      for unit in CANDIDATE_LINES:
        if unit=="Scattered":continue
        if recap_counts[(county,unit)]!=1 or recap_candidate_values[(county,unit)]!=by_county_unit[(county,unit)]:
          raise ValueError(f"ED versus certified candidate-line discrepancy: {county} {unit}")
      for unit in BALLOT_UNITS:
        if recap_ballots[(county,unit)]!=1 or recap_ballot_values[(county,unit)]!=by_county_ballots[(county,unit)]:
          raise ValueError(f"ED versus certified ballot-unit discrepancy: {county} {unit}")
    citywide=Counter()
    for (county,unit),votes in by_county_unit.items():
      citywide[CANDIDATE_LINES[unit]]+=votes
    candidate_ranked=sorted(citywide.items(),key=lambda x:-x[1])
    citywide_ballots=sum(sum(by_county_ballots[(county,u)] for u in BALLOT_UNITS) for county in BOE_COUNTY)
    citywide_votes=sum(citywide.values())
    if citywide_votes!=2194204 or citywide_ballots!=2218647:
      raise ValueError("Citywide certified grand totals changed unexpectedly")
    citywide_result={
       "status":"VERIFIED_OFFICIAL_2025_MAYOR_CITYWIDE_ONLY",
       "election_date":"2025-11-04",
       "certification_date":"2025-12-02",
       "contest":"NYC Mayor — 2025 General Election (citywide)",
       "official_ed_source":"https://www.vote.nyc/page/election-results-summary-2025",
       "source_ed_csv_sha256":hashlib.sha256(ed).hexdigest(),
       "source_certified_recap_sha256":recap_sha,
       "total_ballots":citywide_ballots,
       "total_candidate_and_write_in_votes":citywide_votes,
       "unrecorded_ballots":citywide_ballots-citywide_votes,
       "candidates":[{"name":name,"votes":n,"vote_share_pct":round(n/citywide_votes*100,2)} for name,n in candidate_ranked],
       "counties":[{
           "county":county,
           "ballots":next(iter(recap_totals[county]["total_ballots"])),
           "candidate_and_write_in_votes":next(iter(recap_totals[county]["total_votes"])),
           "unrecorded":next(iter(recap_totals[county]["unrecorded"]))
       } for county in BOE_COUNTY],
       "geographic_resolution":"CITYWIDE_ONLY",
       "notice":"Official mayoral votes, not party enrollment. No election-district/NTA allocation or turnout measure is asserted.",
       "QA":"ED CSV candidate line counts and ballot units match official certified county recap exactly; fusion candidate lines combined by named candidate."
    }
    report={
      "status":"OFFICIAL_2025_ED_RECAP_CROSS_CHECK_PASSED",
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
    (DEST/"mayor_2025_verified_citywide.json").write_text(json.dumps(citywide_result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    (DEST/"mayor_2025_recap_reconciliation_audit.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({
        "recap_counties":dict(recap_counties),
        "recap_candidate_frequency":report["recap_candidate_line_frequencies"],
        "metadata":report["recap_unique_metadata"],
        "active_ED_counts":report["unique_active_EDs"],
        "combined_ED_count":len(combined_keys)
    },ensure_ascii=False))
    print("CERTIFIED_MAYOR_CITYWIDE "+json.dumps({
        "ballots":citywide_ballots,"votes":citywide_votes,"unrecorded":citywide_ballots-citywide_votes,
        "candidates":citywide_result["candidates"]},ensure_ascii=False))
    print("PASS: citywide results verified; precinct/NTA election maps remain on hold pending historical ED geography.")
if __name__=="__main__":main()
