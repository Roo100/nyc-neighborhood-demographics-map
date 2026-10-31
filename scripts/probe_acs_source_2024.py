#!/usr/bin/env python3
"""Research-only probes of official 2024 ACS 5-year Detailed Tables.

No user identifiers are requested. Probes print HTTP status, content-type,
first 200 bytes and sanitized error information only, no estimates.
"""
from urllib.error import HTTPError,URLError
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from pathlib import Path
import json, ssl
from datetime import datetime,timezone

API="https://api.census.gov/data/2024/acs/acs5"
SUMMARY="https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData/"
urls={
  "acs_tract_3fields":API+"?"+urlencode({"get":"B19001_001E,B17001_001E,B03002_001E","for":"tract:*","in":"state:36 county:005"}),
  "acs_tract_19fields":API+"?"+urlencode({"get":",".join(["B19001_001E"]+[f"B19001_{i:03d}E" for i in range(2,18)]+["B17001_001E","B17001_002E"]),"for":"tract:*","in":"state:36 county:005"}),
  "summary_b19001":SUMMARY+"acsdt5y2024-b19001.dat",
  "summary_b17001":SUMMARY+"acsdt5y2024-b17001.dat",
  "summary_b03002":SUMMARY+"acsdt5y2024-b03002.dat"
}
for name,url in urls.items():
    try:
        headers={"Accept":"application/json,text/plain,*/*","User-Agent":"NYC-POP-research-data-validation/1.0"}
        if name.startswith("summary_"):
            headers["Range"]="bytes=0-4095"
        req=Request(url,headers=headers)
        with urlopen(req,timeout=70) as response:
            info={"status":response.status,"type":response.headers.get("Content-Type"),
                  "length":response.headers.get("Content-Length"),
                  "content_range":response.headers.get("Content-Range")}
            first=response.read(2800)
        info["preview"]=first[:500].decode("utf-8","replace").replace("\n","\\n")
        if name.startswith("acs"):
            try:info["json_rows_sample"]=len(json.loads(first))
            except Exception:pass
        print(name,json.dumps(info),flush=True)
    except HTTPError as exc:
        print(name,json.dumps({"HTTPError":exc.code,"body":exc.read(450).decode("utf-8","replace")}),flush=True)
    except Exception as exc:
        print(name,json.dumps({"error_type":type(exc).__name__,"message":str(exc)[:350]}),flush=True)
