#!/usr/bin/env python3
"""Initial audit of official NYC BOE November 4, 2025 mayoral ED-level CSV.

Research staging only. Deliberately does NOT compute/publish a neighborhood,
Council district, or even precinct-level winner until BOE schema/ballot rows,
ED geography vintage, cross-county identifiers, and vote totals are reconciled.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import csv
import hashlib
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data" / "elections"
SOURCE = "https://www.vote.nyc/sites/default/files/pdf/election_results/2025/20251104General%20Election/00000100000Citywide%20Mayor%20Citywide%20EDLevel.csv"
GEO = "https://data.cityofnewyork.us/d/wwxk-38u4"
MAX_BYTES = 90_000_000

def get_source():
    req=Request(SOURCE,headers={
        "User-Agent":"Mozilla/5.0 (compatible; NYC-POP-official-election-data-audit/1.0)",
        "Accept":"text/csv,text/plain,*/*"
    })
    with urlopen(req, timeout=90) as resp:
        content=resp.read(MAX_BYTES+1)
        mime=resp.headers.get("content-type","")
    if len(content)>MAX_BYTES or len(content)<1000:
        raise ValueError("Unexpected source file length")
    text=content.decode("utf-8-sig",errors="strict")
    if "<html" in text[:1000].lower():
        raise ValueError("BOE served HTML rather than election CSV")
    return content,mime,text

def main():
    content,mime,text=get_source()
    rows=csv.reader(io.StringIO(text))
    widths=Counter()
    samples=[]
    first=[]
    total=0
    for row in rows:
        if total<5: first.append(row[:24])
        if len(row)<2: continue
        widths[len(row)]+=1
        total+=1
        if total<10: samples.append(row[:24])
    if total<1000:
        raise ValueError(f"Only {total} ED-level rows; not sufficient coverage for NYC")
    if len(widths)>5:
        raise ValueError(f"Unexpectedly heterogeneous row widths: {dict(widths)}")
    result={
        "status":"SOURCE_SCHEMA_AUDIT_ONLY__NO_ELECTION_RESULT_PUBLISHED",
        "election_date":"2025-11-04",
        "contest":"Mayor, citywide, 2025 General Election",
        "official_csv_url":SOURCE,
        "official_geo_dataset":GEO,
        "retrieved_utc":datetime.now(timezone.utc).isoformat(),
        "sha256":hashlib.sha256(content).hexdigest(),
        "content_type":mime,
        "file_bytes":len(content),
        "data_row_count":total,
        "row_width_counts":dict(widths),
        "first_rows":first,
        "limitations":[
            "Audit sample only: tally and candidate vote units have not been parsed or reconciled",
            "Official 2026 DCP election district boundaries may not match 2025 election ED assignments",
            "Early, absentee, affidavit and combined EDs require BOE-specific reconciliation",
            "Do not infer NTA political majority or turnout from registered-voter totals",
            "2026 upcoming election results must not be inferred from 2025 election"
        ]
    }
    DEST.mkdir(parents=True,exist_ok=True)
    out=DEST/"mayor_2025_ed_schema_audit.json"
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
        "source":SOURCE,
        "bytes":len(content),
        "rows":total,
        "widths":dict(widths),
        "sample_rows":first[:3],
        "status":result["status"]
    },ensure_ascii=False))
    print("HOLD: no election counts or geographic joins are authorized at schema-audit stage.")
if __name__=="__main__":main()
