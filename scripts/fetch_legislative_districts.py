#!/usr/bin/env python3
"""Pin official NYC DCP 2026 legislative district polygons; never infer districts from NTA.

Datasets (DCP 26b): City Council 872g-cjhh, NY Senate afns-vxeu,
NY Assembly 5yfv-9hkp, US Congress j3u5-usz2.
A data-fail policy prevents unsupported geographies from appearing as official.
"""
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen,Request
import hashlib
import json
import time

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"data/legislative"
SOURCES={
    "council":{"id":"872g-cjhh","keys":["coundist","coun_dist","council_dist"],"min":51,"max":51,"min_id":1,"max_id":51},
    "senate":{"id":"afns-vxeu","keys":["stsendist","st_sen_dist","senate_dist","stsend_dist"],"min":20,"max":45,"min_id":1,"max_id":63},
    "assembly":{"id":"5yfv-9hkp","keys":["assemdist","assem_dist","assembly_dist"],"min":50,"max":100,"min_id":1,"max_id":150},
    "congress":{"id":"j3u5-usz2","keys":["congdist","cong_dist","congress_dist"],"min":8,"max":20,"min_id":1,"max_id":26}
}
def get_bytes(url):
    for attempt in range(3):
        try:
            req=Request(url,headers={"User-Agent":"NYC-POP-GitHub-GIS-26b-validation/1.0","Accept":"application/json, application/geo+json"})
            with urlopen(req,timeout=150) as response:
                contents=response.read(60_000_001)
            if len(contents)>60_000_000:raise ValueError("Unexpectedly large GIS payload")
            return contents
        except Exception:
            if attempt==2:raise
            time.sleep(attempt+1)
def parse(source,payload):
    try:data=json.loads(payload)
    except json.JSONDecodeError as e:raise ValueError("Official API returned invalid JSON") from e
    features=data.get("features")
    if data.get("type")!="FeatureCollection" or not isinstance(features,list):
        raise ValueError("Expected DCP GeoJSON collection: "+str(data)[:350])
    if len(features)<source["min"] or len(features)>source["max"]*2:
        raise ValueError(f"Unexpected raw feature count {len(features)} for source {source['id']}")
    merged={}
    observed_keys=Counter()
    for f in features:
        props={str(k).lower():v for k,v in (f.get("properties") or {}).items()}
        observed_keys.update(props.keys())
        val=next((props.get(key) for key in source["keys"] if props.get(key) is not None),None)
        if val is None:
            raise ValueError(f"Missing district field; expected {source['keys']}. Actual fields {list(props)}")
        try:district=int(val)
        except (TypeError,ValueError) as e:raise ValueError(f"Invalid official district {val!r}") from e
        if not source["min_id"]<=district<=source["max_id"]:
            raise ValueError(f"Unexpected official district number {district}")
        g=f.get("geometry") or {}
        if g.get("type") not in ("Polygon","MultiPolygon") or not g.get("coordinates"):
            raise ValueError(f"Invalid official polygon geometry for district {district}")
        polygons=[g["coordinates"]] if g["type"]=="Polygon" else g["coordinates"]
        for polygon in polygons:
            for ring in polygon:
                if len(ring)<4:raise ValueError(f"Short ring for {district}")
                for x,y,*rest in ring:
                    if not (-74.7<float(x)<-73.3 and 40.25<float(y)<41.2):
                        raise ValueError(f"Out of NYC bounding region: {district}, {x}, {y}")
        merged.setdefault(district,[]).extend(polygons)
    if not source["min"]<=len(merged)<=source["max"]:
        raise ValueError(f"Unexpected distinct districts: {len(merged)}")
    if source["id"]=="872g-cjhh" and set(merged)!=set(range(1,52)):
        raise ValueError("Council district IDs are not 1 to 51")
    records=[{"type":"Feature","properties":{"district":i},
      "geometry":{"type":"MultiPolygon","coordinates":merged[i]}} for i in sorted(merged)]
    return {"type":"FeatureCollection","features":records},sorted(merged),len(features)
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    manifest={"checked_at_utc":datetime.now(timezone.utc).isoformat(),
        "status":"STAGED_FOR_REVIEW_OFFICIAL_2026_26b",
        "method":"DCP official Socrata GEOJSON; duplicate district fragments merged, no NTA crosswalk",
        "sources":{}}
    for name,cfg in SOURCES.items():
        url=f"https://data.cityofnewyork.us/resource/{cfg['id']}.geojson?$limit=300"
        raw=get_bytes(url)
        geo,ids,raw_count=parse(cfg,raw)
        encoded=(json.dumps(geo,separators=(",",":"),ensure_ascii=False)+"\n").encode()
        path=OUT/f"{name}-districts-2026.geojson"
        path.write_bytes(encoded)
        manifest["sources"][name]={
            "source_page":f"https://data.cityofnewyork.us/d/{cfg['id']}",
            "source_api":url,
            "raw_count":raw_count,"district_count":len(ids),"district_ids":ids,
            "first_id":min(ids),"last_id":max(ids),
            "pinned_sha256":hashlib.sha256(encoded).hexdigest(),
            "source_sha256":hashlib.sha256(raw).hexdigest(),
            "bytes":len(encoded)}
        print("DISTRICT_SOURCE_VALIDATED",name,len(ids),"raw",raw_count,"bytes",len(encoded),flush=True)
    (OUT/"validation-2026.json").write_text(json.dumps(manifest,indent=2)+"\n",encoding="utf8")
    print("DISTRICT_SOURCE_MANIFEST",json.dumps({k:{"count":v["district_count"],"ids":v["district_ids"]} for k,v in manifest["sources"].items()}),flush=True)

if __name__=="__main__":main()
