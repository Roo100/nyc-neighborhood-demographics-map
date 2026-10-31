import {indexCommunityDistricts,lookupPolygonAtPoint} from './civic.js';

export const DISTRICT_KINDS={
  council:{label:'NYC City Council',file:'data/legislative/council-districts-2026.geojson',source:'https://data.cityofnewyork.us/d/872g-cjhh',min:51,max:51},
  senate:{label:'NY State Senate',file:'data/legislative/senate-districts-2026.geojson',source:'https://data.cityofnewyork.us/d/afns-vxeu',min:28,max:28},
  assembly:{label:'NY State Assembly',file:'data/legislative/assembly-districts-2026.geojson',source:'https://data.cityofnewyork.us/d/5yfv-9hkp',min:65,max:65},
  congress:{label:'US House of Representatives',file:'data/legislative/congress-districts-2026.geojson',source:'https://data.cityofnewyork.us/d/j3u5-usz2',min:13,max:13}
};
export const OFFICIAL_LEGISLATIVE_DIRS={
  council:'https://council.nyc.gov/districts/',
  senate:'https://www.nysenate.gov/senators-committees',
  assembly:'https://assembly.ny.gov/mem/',
  congress:'https://www.house.gov/representatives'
};
export function validateDistrictGeoJSON(key,source,manifest){
  const cfg=DISTRICT_KINDS[key],meta=manifest?.sources?.[key];
  if(!cfg||source?.type!=='FeatureCollection'||!Array.isArray(source.features)||
    !meta||source.features.length!==meta.district_count||
    source.features.length<cfg.min||source.features.length>cfg.max){
    throw new Error('Legislative polygon coverage or manifest mismatch for '+key);
  }
  if(meta.source_page!==cfg.source||manifest.status!=='STAGED_FOR_REVIEW_OFFICIAL_2026_26b')
    throw new Error('Legislative source metadata mismatch for '+key);
  const seen=new Set();
  const records=source.features.map(feature=>{
    const code=Number(feature?.properties?.district);
    if(!Number.isInteger(code)||code<1||code>150||seen.has(code)||
      !['Polygon','MultiPolygon'].includes(feature?.geometry?.type)||
      !feature?.geometry?.coordinates?.length){
      throw new Error('Invalid or duplicate '+key+' polygon');
    }
    seen.add(code);
    return {code,name:cfg.label+' District '+code,feature};
  });
  if(key==='council'&&!Array.from({length:51},(_,i)=>i+1).every(n=>seen.has(n)))
    throw new Error('Council districts 1–51 not all covered');
  return records;
}
export function validateOfficialNames(official){
  if(official?.as_of!=='2026-10-31')throw new Error('No official reference snapshot date');
  if(official.council?.source!=='https://council.nyc.gov/districts/print/'||
    Object.keys(official.council.names||{}).length!==51)
    throw new Error('Current council name coverage/source incomplete');
  for(let n=1;n<=51;n++){
    if(typeof official.council.names[String(n)]!=='string'||
      official.council.names[String(n)].trim().length<4)
      throw new Error('Council name missing at district '+n);
  }
  if(official.senate?.names?.['12'])
    throw new Error('Senate district 12 must not be attributed to departed member without current verification');
  return official;
}
export function makeDistrictLookup(records){
  return indexCommunityDistricts(records);
}
export function identifyLegislators(loaded,lat,lng){
  const output={};
  for(const key of Object.keys(DISTRICT_KINDS)){
    output[key]=lookupPolygonAtPoint(loaded[key]?.index,lat,lng);
  }
  return output;
}
export function officialForDistrict(official,kind,code){
  if(!Number.isInteger(code)||!['council','senate'].includes(kind))return null;
  return official?.[kind]?.names?.[String(code)]||null;
}
