// On-demand official NYC Open Data geometry for the civic boundary guide.
// Never substitute NTA or community-board geometry for another authority's
// service territory. The source record count and geometry are validated before
// a layer may be drawn. Last dataset documentation review: 2026-10-31.
import {indexCommunityDistricts} from './civic.js';

export const EXTRA_CIVIC_SOURCES={
  precincts:{
    id:'y76i-bdw7',count:78,field:'precinct',title:'NYPD precinct',
    source:'https://data.cityofnewyork.us/d/y76i-bdw7',
    period:'NYC DCP 26b · May 2026'
  },
  sanitation:{
    id:'i6mn-amj2',count:59,field:'district',title:'DSNY district',
    source:'https://data.cityofnewyork.us/d/i6mn-amj2',
    period:'DSNY · September 2026'
  },
  fire:{
    id:'xzng-ft6f',count:49,field:'fire_bn',title:'FDNY battalion',
    source:'https://data.cityofnewyork.us/d/xzng-ft6f',
    period:'NYC DCP 26b · May 2026'
  },
  zip:{
    id:'35j5-n34v',count:221,field:'zcta5',title:'Census ZCTA',
    source:'https://data.cityofnewyork.us/d/35j5-n34v',
    period:'NYC OTI · April 2026'
  }
};

function getProp(properties,field){
  const key=Object.keys(properties||{}).find(name=>name.toLowerCase()===field);
  return key===undefined?undefined:properties[key];
}
function readableIdentifier(key,properties){
  const cfg=EXTRA_CIVIC_SOURCES[key];
  const value=getProp(properties,cfg.field);
  if(key==='zip'){
    if(!/^\d{5}$/.test(String(value??'')))throw new Error('Invalid Census ZCTA identifier');
    return String(value);
  }
  if(key==='sanitation'){
    if(typeof value!=='string'||!value.trim()||value.length>25)
      throw new Error('Invalid DSNY district');
    return value.trim();
  }
  const number=Number(value);
  if(!Number.isInteger(number)||number<1||number>300)
    throw new Error('Invalid precinct/battalion number');
  return String(number);
}
export function validateOfficialExtraCivicGeoJSON(key,data){
  const cfg=EXTRA_CIVIC_SOURCES[key];
  if(!cfg)throw new Error('Unsupported civic district type');
  if(data?.type!=='FeatureCollection'||!Array.isArray(data.features)||
     data.features.length!==cfg.count)
    throw new Error('Unexpected '+key+' record count; source must be revalidated');
  const seen=new Set();
  const records=data.features.map(feature=>{
    const geo=feature?.geometry;
    if(!['Polygon','MultiPolygon'].includes(geo?.type)||!Array.isArray(geo.coordinates)||
       !geo.coordinates.length)throw new Error('Invalid geographic polygon in '+key);
    const id=readableIdentifier(key,feature.properties||{});
    if(seen.has(id))throw new Error('Repeated '+key+' code: '+id);
    seen.add(id);
    let first=geo.coordinates;
    while(Array.isArray(first)&&Array.isArray(first[0]))first=first[0];
    if(!Array.isArray(first)||first.length<2||!Number.isFinite(first[0])||
       !Number.isFinite(first[1])||first[0]<-74.5||first[0]>-73.45||
       first[1]<40.35||first[1]>41.05)
      throw new Error('Unexpected coordinates in '+key);
    const title=key==='zip'?'Census ZCTA '+id:
      key==='precincts'?'NYPD Precinct '+id:
      key==='fire'?'FDNY Battalion '+id:'DSNY District '+id;
    return {code:id,name:title,feature};
  });
  // Use the same tested point-in-polygon implementation as other civic layers.
  const index=indexCommunityDistricts(records);
  return {records,index,source:cfg.source,period:cfg.period};
}
export async function fetchOfficialExtraCivic(key){
  const cfg=EXTRA_CIVIC_SOURCES[key];
  if(!cfg)throw new Error('Unsupported civic category');
  // Socrata's public GeoJSON endpoint supplies polygon geometry in WGS84.
  // Data are loaded only if a user selects a category: no bulk prefetching.
  const response=await fetch('https://data.cityofnewyork.us/resource/'+
    cfg.id+'.geojson?$limit=1000');
  if(!response.ok)throw new Error('NYC Open Data unavailable (HTTP '+response.status+')');
  const data=await response.json();
  return validateOfficialExtraCivicGeoJSON(key,data);
}
