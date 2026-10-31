#!/usr/bin/env python3
"""Pin school district boundaries and NYSED K-12 school points, from government GIS.

Official DCP geographic source: 2026 26b School Districts, 8ugf-3d8u.
Official NYS geohub: NYSED/ITS Schools K-12 points, separate dated source.
This data is for school-location browsing, NEVER student zoning/eligibility.
"""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "schools"
DISTRICT_URL = "https://data.cityofnewyork.us/resource/8ugf-3d8u.geojson?$limit=200"
SCHOOL_LAYER = "https://nysgeohub.ny.gov/arcgis/rest/services/Education/NYS_Schools/FeatureServer/0/query"
COUNTY_TO_BOROUGH = {"BRONX":"Bronx","KINGS":"Brooklyn","NEW YORK":"Manhattan","QUEENS":"Queens","RICHMOND":"Staten Island"}
OUTFIELDS = "OBJECTID,LEGAL_NAME,PHYSADDRLINE1,PHYSCITY,PHYSZIPCD5,COUNTY_DESC,INST_TYPE_DESC,INSTSUBTYPDESC,RECORD_TYPE_DESC,COMMUNITY_TYPE_DESC,SED_CODE,INSTIT_ID,SDL_DESC"

def get(url, params=None, limit=32_000_000):
    address = url + ("?" + urlencode(params) if params else "")
    req = Request(address, headers={"Accept":"application/geo+json, application/json","User-Agent":"NYC-POP-education-source-validation/1.0 (GitHub Roo100 NYC community atlas)"})
    for attempt in range(3):
        try:
            with urlopen(req, timeout=90) as resp:
                raw=resp.read(limit+1)
            if len(raw)>limit: raise ValueError("Response too large")
            data=json.loads(raw)
            if "error" in data: raise ValueError("Official GIS service error: "+str(data["error"])[:350])
            return data,raw
        except Exception:
            if attempt==2: raise
            time.sleep(attempt+1)

def prepare_districts(raw):
    features=raw.get("features")
    if raw.get("type")!="FeatureCollection" or not isinstance(features,list) or len(features)!=33:
        raise ValueError("Expected 33 official NYC school district polygons; actual: "+str(len(features) if isinstance(features,list) else "invalid"))
    result=[], 
    result=[]
    ids=set()
    for feature in features:
        p=feature.get("properties") or {}
        n=p.get("schooldist",p.get("SchoolDist"))
        try: code=int(n)
        except (ValueError,TypeError): raise ValueError("Invalid school district identifier "+str(n))
        if code in ids or not (1<=code<=99):
            raise ValueError("Duplicate/out-of-range school district: "+str(code))
        ids.add(code)
        g=feature.get("geometry")
        if g is None or g.get("type") not in ("Polygon","MultiPolygon") or not g.get("coordinates"):
            raise ValueError("Invalid district geometry for "+str(code))
        result.append({"type":"Feature","properties":{"district":code},"geometry":g})
    if not set(range(1,33)).issubset(ids):
        raise ValueError("Official geography missing one of NYC districts 1–32")
    print("NYC_DCP_SCHOOL_DISTRICT_IDS",sorted(ids),flush=True)
    return {"type":"FeatureCollection","features":sorted(result,key=lambda r:r["properties"]["district"])},sorted(ids)

def classify_type(p):
    x=(" ".join(str(p.get(k) or "") for k in ("INST_TYPE_DESC","INSTSUBTYPDESC","RECORD_TYPE_DESC"))).lower()
    if "charter" in x:return "Charter"
    if any(k in x for k in ("nonpublic","non-public","private","religious")):return "Nonpublic"
    if "public" in x:return "Public"
    return "Unclassified"

def prepare_school(f):
    p=f.get("properties") or {}
    name=str(p.get("LEGAL_NAME") or "").strip()
    sed=str(p.get("SED_CODE") or "").strip()
    county=str(p.get("COUNTY_DESC") or "").strip().upper()
    borough=COUNTY_TO_BOROUGH.get(county)
    geometry=f.get("geometry") or {}
    coords=geometry.get("coordinates") or []
    if not borough: return None
    if geometry.get("type")!="Point" or len(coords)<2 or not name or not sed:
        raise ValueError("Missing school name, SED code or point for NYC school "+str(p.get("OBJECTID")))
    lon,lat=coords[:2]
    if not (-74.35<float(lon)<-73.60 and 40.45<float(lat)<41.00):
        raise ValueError("NYC school point coordinate outside expected bbox "+name+str(coords))
    return {"type":"Feature","properties":{
        "id":sed,"name":name,"borough":borough,
        "street":str(p.get("PHYSADDRLINE1") or "").strip(),
        "city":str(p.get("PHYSCITY") or "").strip(),
        "zip":str(p.get("PHYSZIPCD5") or "").strip(),
        "type":classify_type(p),
        "source_class":str(p.get("INST_TYPE_DESC") or "").strip(),
        "source_subtype":str(p.get("INSTSUBTYPDESC") or "").strip()
        },"geometry":{"type":"Point","coordinates":[round(float(lon),6),round(float(lat),6)]}}

def fetch_schools():
    bbox="-74.30,40.47,-73.60,40.98"
    filters={"where":"1=1","geometry":bbox,"geometryType":"esriGeometryEnvelope",
             "inSR":4326,"spatialRel":"esriSpatialRelIntersects","returnIdsOnly":"true","f":"json"}
    ids_result,_=get(SCHOOL_LAYER,filters)
    ids=ids_result.get("objectIds")
    if not isinstance(ids,list) or len(ids)<1500 or len(ids)>15000:
        raise ValueError("Unexpected NYSED source object ID coverage: "+str(len(ids) if isinstance(ids,list) else ids))
    ids=sorted(set(ids))
    out=[]
    for start in range(0,len(ids),200):
        params={"objectIds":",".join(map(str,ids[start:start+200])),
                "outFields":OUTFIELDS,"returnGeometry":"true","outSR":"4326","f":"geojson"}
        features,_=get(SCHOOL_LAYER,params)
        if features.get("type")!="FeatureCollection" or not isinstance(features.get("features"),list):
            raise ValueError("Unexpected NYSED point response shape")
        if len(features["features"])!=len(ids[start:start+200]):
            raise ValueError("NYSED API silently truncated school batch")
        for f in features["features"]:
            parsed=prepare_school(f)
            if parsed is not None:out.append(parsed)
    if len(out)<1500 or len(out)>6000:
        raise ValueError("NYC school count suspicious; validate counties and source collection: "+str(len(out)))
    unique={r["properties"]["id"] for r in out}
    if len(unique)!=len(out):
        raise ValueError("Duplicate NYSED SED school codes; inspect school source")
    print("NYS_SCHOOL_POINTS",json.dumps({"total":len(out),"borough_counts":dict(Counter(f["properties"]["borough"] for f in out)),"types":dict(Counter(f["properties"]["type"] for f in out))}),flush=True)
    return {"type":"FeatureCollection","features":sorted(out,key=lambda r:(r["properties"]["borough"],r["properties"]["name"]))},len(ids)

def write_json(path,data):
    output=(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n").encode("utf-8")
    path.write_bytes(output)
    return hashlib.sha256(output).hexdigest()

def main():
    dcp,source_bytes=get(DISTRICT_URL)
    boundaries,district_ids=prepare_districts(dcp)
    schools,ids_queried=fetch_schools()
    OUT.mkdir(parents=True,exist_ok=True)
    d_hash=write_json(OUT/"school-districts-2026.geojson",boundaries)
    s_hash=write_json(OUT/"k12-schools-nysed.geojson",schools)
    report={
        "validation_status":"STAGED_FOR_REVIEW_NOT_PUBLISHED",
        "checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "district_source":DISTRICT_URL,"district_dataset":"NYC DCP 2026 26b 8ugf-3d8u",
        "district_count":len(district_ids),"district_codes":district_ids,
        "district_source_sha256":hashlib.sha256(source_bytes).hexdigest(),
        "district_pinned_sha256":d_hash,
        "school_source":SCHOOL_LAYER,"school_provider":"NYS ITS Geohub based on NYSED",
        "school_source_as_of":"Snapshot retrieved 2026-10-31; individual school status and grade spans NOT verified for Fall 2026",
        "school_source_object_id_count_in_bbox":ids_queried,
        "nyc_school_count":len(schools["features"]),
        "borough_counts":dict(Counter(f["properties"]["borough"] for f in schools["features"])),
        "school_type_counts":dict(Counter(f["properties"]["type"] for f in schools["features"])),
        "school_points_pinned_sha256":s_hash,
        "warnings":[
            "School point is not evidence of attendance-zone eligibility",
            "District 75/79, charter and special programs may be citywide",
            "A school and its physical district may differ administratively",
            "No grade span available in this NYSED GIS extract: do not invent grade bands",
            "Separate NYCPS Fall 2026 school directories must verify grade spans and operational status"
        ]
    }
    (OUT/"validation-2026.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("SCHOOL_SOURCE_VALIDATION",json.dumps(report),flush=True)

if __name__=="__main__":
    main()
