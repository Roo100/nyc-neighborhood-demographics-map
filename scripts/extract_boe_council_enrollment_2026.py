#!/usr/bin/env python3
"""NYC BOE Feb 20 2026 Council district active/inactive voter enrollment.

Official 56-page PDF is grouped into borough/county portions. Council
districts spanning counties occur more than once: SUM those explicit BOE
section totals by Council district (do not deduplicate by page).

Output is party registration/enrollment, not votes for candidates, not
election results, not residential population, not NTA/borough majority.
"""
from collections import defaultdict,Counter
from datetime import datetime,timezone
from hashlib import sha256
from pathlib import Path
from urllib.request import Request,urlopen
from io import BytesIO
import json,re,time
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/political"
URL="https://www.vote.nyc/sites/default/files/pdf/vote/2026/CityCouncil_Enrollment_Feb2026.pdf"
COLUMNS=["Democratic","Republican","Conservative","Working Families","Other","Unaffiliated (Blank)","Total"]
NUMBER=r"([0-9][0-9,]*)"

def download():
    for attempt in range(3):
        try:
            req=Request(URL,headers={"User-Agent":"NYC-POP-official-BOE-report-audit/1.0","Accept":"application/pdf"})
            with urlopen(req,timeout=100) as resp:
                binary=resp.read(8_000_001)
                if resp.status!=200 or len(binary)>8_000_000 or not binary.startswith(b"%PDF"):
                    raise ValueError("BOE report response not a reasonable PDF")
                return binary
        except Exception:
            if attempt==2:raise
            time.sleep(2+attempt)

def extract_section(text,page_number):
    text=text.replace("\u00a0"," ").replace("\u2007"," ")
    hits=re.findall(r"Totals\s+for\s+Council\s+(\d+)",text,re.IGNORECASE)
    if len(hits)!=1:raise ValueError(f"Expected one BOE Council subtotal on PDF page {page_number+1}; got {hits}")
    district=int(hits[0])
    if not 1<=district<=51:raise ValueError("Invalid council number "+str(district))
    section=text[text.lower().index("totals for council"):]
    captured={}
    for kind in ("Active","Inactive","Total"):
        expr=r"\b"+kind+r"\s*:\s*((?:\d[\d,]*\s+){6}\d[\d,]*)"
        found=re.search(expr,section,re.IGNORECASE)
        if not found:raise ValueError(f"Could not parse {kind} subtotal on page {page_number+1}. Preview: {section[:550]!r}")
        values=[int(x.replace(",","")) for x in found.group(1).split()]
        if len(values)!=7:raise ValueError("Unexpected party column count")
        if sum(values[:6])!=values[6]:raise ValueError("Party subtotals do not sum to total on page "+str(page_number+1))
        captured[kind.lower()]=values
    for idx in range(7):
        if captured["active"][idx]+captured["inactive"][idx]!=captured["total"][idx]:
            raise ValueError("Active+inactive mismatch on page "+str(page_number+1))
    return district,captured

def parse_report(binary):
    reader=PdfReader(BytesIO(binary))
    if len(reader.pages)!=56:
        raise ValueError(f"Expected 56 official BOE February 2026 pages; got {len(reader.pages)}")
    totals=defaultdict(lambda:{"active":[0]*7,"inactive":[0]*7,"total":[0]*7})
    parts=Counter()
    first={}
    for index,page in enumerate(reader.pages):
        text=page.extract_text(extraction_mode="layout")
        if not text or "2026" not in text:
            raise ValueError("Missing February 2026 report heading")
        district,values=extract_section(text,index)
        parts[district]+=1
        first.setdefault(district,index+1)
        for status,cols in values.items():
            totals[district][status]=[a+b for a,b in zip(totals[district][status],cols)]
    if set(totals)!=set(range(1,52)):
        raise ValueError("Source does not include each of NYC's 51 City Council districts: "+str(sorted(totals)))
    if sum(parts.values())!=56:
        raise ValueError("Missing district/county page fragments")
    processed=[]
    for district in sorted(totals):
        row={"district":district,"parts":parts[district],"first_pdf_page":first[district]}
        for status in ("active","inactive","total"):
            row[status]=dict(zip(COLUMNS,totals[district][status]))
        for idx in range(7):
            if totals[district]["active"][idx]+totals[district]["inactive"][idx]!=totals[district]["total"][idx]:
                raise ValueError("District "+str(district)+" mismatched totals")
        processed.append(row)
    for status in ("active","inactive","total"):
        city={name:sum(d[status][name] for d in processed) for name in COLUMNS}
        if sum(city[name] for name in COLUMNS[:6])!=city["Total"]:
            raise ValueError("Citywide parties do not reconcile")
    return processed,dict(parts)

def main():
    binary=download()
    rows,parts=parse_report(binary)
    OUT.mkdir(exist_ok=True,parents=True)
    data={
      "status":"OFFICIAL_BOE_2026_COUNCIL_ENROLLMENT_VERIFIED",
      "as_of":"2026-02-20",
      "downloaded_at_utc":datetime.now(timezone.utc).isoformat(),
      "source":"NYC Board of Elections",
      "source_url":URL,
      "pdf_sha256":sha256(binary).hexdigest(),
      "pdf_pages":56,
      "report_geo":"NYC City Council District (51 districts) with cross-borough PDF sections summed per district",
      "category_labels":COLUMNS,
      "active_inactive_note":"Active and inactive voter enrollment shown separately; total includes both. Unaffiliated/Blank is not a political party.",
      "district_count":51,
      "district_page_counts":parts,
      "cross_borough_districts":{k:v for k,v in parts.items() if v>1},
      "districts":rows
    }
    out=OUT/"council_enrollment_2026.json"
    out.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
    print("BOE_ENROLLMENT_VALIDATED",json.dumps({
      "districts":len(rows),"page_parts":sum(parts.values()),
      "cross_borough":data["cross_borough_districts"],
      "city_total":sum(r["total"]["Total"] for r in rows),
      "city_active":sum(r["active"]["Total"] for r in rows),
      "district_1_total":rows[0]["total"]}),flush=True)

if __name__=="__main__":main()
