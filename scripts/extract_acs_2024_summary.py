#!/usr/bin/env python3
"""Extract NYC tract ACS 2024 5-year estimates + MOEs from official table-based SF.

No Census API key required. Streams three official nationwide .dat files and
retains ONLY 2020 census tracts within five NYC counties (no ZIP/PUMA proxy).
The raw official variable values are retained without imputing suppression.
No published map layer is enabled by this script.
"""
from datetime import datetime, timezone
from io import StringIO, TextIOWrapper
from urllib.request import Request, urlopen
from pathlib import Path
import csv, hashlib, json, time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/acs"
BASE="https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/"
COUNTIES={"005":"Bronx","047":"Brooklyn","061":"Manhattan","081":"Queens","085":"Staten Island"}
TABLES={
  "B19001":[*range(1,18)],
  "B17001":[1,2],
  "B03002":[1,2,3,4,6,12]
}
MIN_TRACTS=2000
MAX_TRACTS=4000

def census_id(raw):
    if not raw.startswith("1400000US"):
        return None
    code=raw[len("1400000US"):]
    if len(code)==11 and code.isdigit() and code[:2]=="36" and code[2:5] in COUNTIES:
        return code
    return None

def fetch_stream(table,variables):
    url=BASE+f"acsdt5y2024-{table.lower()}.dat"
    for attempt in range(3):
        try:
            request=Request(url,headers={"User-Agent":"NYC-POP-research-2024-ACS-summary-file/1.0"})
            response=urlopen(request,timeout=150)
            return url,response
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)

def read_table(table,variables):
    url,response=fetch_stream(table,variables)
    result={}
    raw_hasher=hashlib.sha256()
    byte_count=0
    try:
        # Streaming mode: read full official nationwide table but retain only
        # NYC tracts. Uses a deterministic line-level hash of the UTF-8 bytes.
        def lines():
            nonlocal byte_count
            for raw in response:
                raw_hasher.update(raw);byte_count+=len(raw)
                yield raw.decode("utf-8")
        reader=csv.DictReader(lines(),delimiter="|")
        header=reader.fieldnames or []
        wanted={}
        for field in variables:
            for suffix in ("E","M"):
                src=f"{table}_{suffix}{field:03d}"
                dst=f"{table}_{field:03d}{suffix}"
                if src not in header:
                    raise ValueError(f"Missing Census Summary File field {src}, found {header[:12]}")
                wanted[dst]=src
        for entry in reader:
            geoid=census_id(str(entry.get("GEO_ID") or ""))
            if not geoid:continue
            if geoid in result:raise ValueError("Duplicate tract GEOID in Census table "+table+" "+geoid)
            result[geoid]={dst:entry[src] for dst,src in wanted.items()}
        if not MIN_TRACTS<=len(result)<=MAX_TRACTS:
            raise ValueError(f"Unexpected NYC tract count {len(result)} in {table}")
        return result,{"url":url,"download_size_bytes":byte_count,
            "source_sha256":raw_hasher.hexdigest(),"nyc_tract_rows":len(result)}
    finally:
        response.close()

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    combined={}; provenance={}
    for table,variables in TABLES.items():
        records,meta=read_table(table,variables)
        provenance[table]=meta
        print("OFFICIAL_ACS_TABLE",table,json.dumps(meta),flush=True)
        for geoid,fields in records.items():
            target=combined.setdefault(geoid,{"tract_geoid":geoid})
            target.update(fields)
    expected=[]
    for table,nums in TABLES.items():
        expected.extend(f"{table}_{num:03d}{kind}" for num in nums for kind in ("E","M"))
    rows=[]
    for geoid in sorted(combined):
        data=combined[geoid]
        # Missing data are blank, never assigned zero.
        rows.append({"tract_geoid":geoid,**{f:data.get(f,"") for f in expected}})
    if not MIN_TRACTS<=len(rows)<=MAX_TRACTS:raise ValueError("NYC tract count out of range")
    path=OUT/"tract_acs_2024_full.csv"
    with path.open("w",newline="",encoding="utf-8") as file:
        writer=csv.DictWriter(file,fieldnames=["tract_geoid",*expected])
        writer.writeheader()
        writer.writerows(rows)
    # Existing income-only processor reads its exact E-field shape.
    fields=[f"B19001_{i:03d}E" for i in range(1,18)]+["B17001_001E","B17001_002E"]
    with (OUT/"tract_income_2024.csv").open("w",newline="",encoding="utf-8") as file:
        writer=csv.DictWriter(file,fieldnames=["tract_geoid",*fields])
        writer.writeheader()
        writer.writerows([{"tract_geoid":r["tract_geoid"],**{k:r[k] for k in fields}} for r in rows])
    manifest={
        "status":"ACS_2024_TRACT_SOURCE_STAGED_NOT_APPROVED_TO_RENDER",
        "source":"US Census Bureau ACS 2020–2024 5-year table-based Summary File",
        "downloaded_at_utc":datetime.now(timezone.utc).isoformat(),
        "geography":"2020 census tracts in Bronx, Kings, New York, Queens, Richmond counties",
        "five_nyc_counties":COUNTIES,
        "tables":provenance,
        "nyc_tract_union":len(rows),
        "nyc_tracts_by_county":{
            name:sum(1 for r in rows if r["tract_geoid"][2:5]==code)
            for code,name in COUNTIES.items()
        },
        "full_csv_sha256":hashlib.sha256(path.read_bytes()).hexdigest(),
        "income_csv_sha256":hashlib.sha256((OUT/"tract_income_2024.csv").read_bytes()).hexdigest(),
        "methodology":"Reproducibly filtered official nationwide table files by 1400000US GEOID; retained estimates and 90%-confidence MOEs; no filling of missing/suppressed values",
        "publication_gate":"HOLD until DCP 2020 tract-to-NTA completeness, suppression, MOE, borough reconciliation and 2020 NTA coverage are validated"
    }
    (OUT/"summary-file-provenance-2024.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    print("OFFICIAL_ACS_STAGING_COMPLETE",json.dumps({
        "tracts":len(rows),"boroughs":manifest["nyc_tracts_by_county"],
        "tables":list(TABLES),"status":manifest["status"]}),flush=True)

if __name__=="__main__":main()
