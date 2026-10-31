// NYC civic geography is distinct from 2020 Neighborhood Tabulation Areas.
// Official boundary dataset: NYC Department of City Planning 2026, 26b, 5crt-au7u.
export const COMMUNITY_SOURCE='https://data.cityofnewyork.us/d/5crt-au7u';
export const COMMUNITY_LOCAL='data/civic/community-districts-2026.geojson';
export const COMMUNITY_REMOTE='https://data.cityofnewyork.us/resource/5crt-au7u.geojson?$limit=1000';
export const BOARD_DIRECTORY='https://www.nyc.gov/site/communityboards/index.page';
export const NYC_GOVERNMENT='https://www.nyc.gov/main/your-government';
export const COUNCIL_DIRECTORY='https://council.nyc.gov/districts/';
export const NYS_REPRESENTATIVES='https://elections.ny.gov/new-york-state-elected-officials';
export const NYC_311='https://portal.311.nyc.gov/';
export const BOROUGH_ORDER={1:'Manhattan',2:'Bronx',3:'Brooklyn',4:'Queens',5:'Staten Island'};
export const BOARD_COUNTS={Manhattan:12,Bronx:12,Brooklyn:18,Queens:14,'Staten Island':3};
// As shown in NYC's current governmental officeholder directory, checked October 31, 2026.
// Directory links are used instead of embedding potentially stale personal contact details.
export const BOROUGH_PRESIDENTS={
  Bronx:'Vanessa L. Gibson',
  Brooklyn:'Antonio Reynoso',
  Manhattan:'Brad Hoylman-Sigal',
  Queens:'Donovan Richards',
  'Staten Island':'Vito Fossella'
};
export function parseBoroCd(feature){
  const props=feature?.properties||{};
  const raw=props.boro_cd??props.borocd??props.BoroCD;
  const number=Number(raw);
  if(!Number.isInteger(number)||number<101||number>599) return null;
  const boro=Math.floor(number/100),numberInBorough=number%100;
  const borough=BOROUGH_ORDER[boro];
  if(!borough)return null;
  const board=numberInBorough>=1&&numberInBorough<=BOARD_COUNTS[borough];
  const jointInterest=numberInBorough>BOARD_COUNTS[borough]&&numberInBorough<=99;
  if(!board&&!jointInterest)return null;
  return {code:number,borough,number:numberInBorough,
    type:board?'board':'joint_interest',
    name:board?`${borough} Community Board ${numberInBorough}`:`${borough} Joint Interest Area ${numberInBorough}`};
}
export function validateCommunityGeoJSON(source){
  if(source?.type!=='FeatureCollection'||!Array.isArray(source.features)||source.features.length!==71){
    throw new Error('Expected exactly 71 official DCP 2026 community district and joint-interest polygons');
  }
  const ids=new Set(),boards=[],jointInterest=[],byBorough={};
  for(const feature of source.features){
    const parsed=parseBoroCd(feature);
    if(!parsed||ids.has(parsed.code)||!['Polygon','MultiPolygon'].includes(feature.geometry?.type)||!feature.geometry.coordinates?.length){
      throw new Error('Unrecognized, duplicated or nonpolygon community district identifier');
    }
    ids.add(parsed.code);
    const record={...parsed,feature};
    if(parsed.type==='board'){
      boards.push(record);
      byBorough[parsed.borough]=(byBorough[parsed.borough]||0)+1;
    }else jointInterest.push(record);
  }
  for(const [borough,count] of Object.entries(BOARD_COUNTS)){
    if(byBorough[borough]!==count) throw new Error(`Community district count mismatch in ${borough}`);
  }
  if(boards.length!==59||jointInterest.length!==12)throw new Error('Expected 59 actual community boards plus 12 joint-interest areas');
  return {boards,jointInterest};
}


// Point-in-polygon lookup uses *only* the official pinned 2026 community
// district and Joint Interest Area geometries (GeoJSON longitude, latitude).
// NTAs, ZIP codes, nearest board centroid or borough membership are NOT valid
// substitutes for a location-based community board assignment.
function ringStatus([lon,lat],ring){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const [xi,yi]=ring[i], [xj,yj]=ring[j];
    const cross=(lon-xi)*(yj-yi)-(lat-yi)*(xj-xi);
    const scale=Math.max(1,Math.abs(xj-xi),Math.abs(yj-yi));
    if(Math.abs(cross)<=1e-10*scale &&
      lon>=Math.min(xi,xj)-1e-10&&lon<=Math.max(xi,xj)+1e-10&&
      lat>=Math.min(yi,yj)-1e-10&&lat<=Math.max(yi,yj)+1e-10){
      return 'boundary';
    }
    if(((yi>lat)!==(yj>lat)) &&
      lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;
  }
  return inside?'inside':'outside';
}
function polygonStatus(point,rings){
  if(!rings?.length)return 'outside';
  const outer=ringStatus(point,rings[0]);
  if(outer!=='inside')return outer;
  for(const ring of rings.slice(1)){
    const hole=ringStatus(point,ring);
    if(hole==='inside')return 'outside';
    if(hole==='boundary')return 'boundary';
  }
  return 'inside';
}
function polygonBounds(rings){
  let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
  for(const ring of rings){
    for(const [lon,lat] of ring){
      minLon=Math.min(minLon,lon);minLat=Math.min(minLat,lat);
      maxLon=Math.max(maxLon,lon);maxLat=Math.max(maxLat,lat);
    }
  }
  return [minLon,minLat,maxLon,maxLat];
}
export function indexCommunityDistricts(records){
  if(!Array.isArray(records)||!records.length)throw new Error('Community geographic records not loaded');
  return records.map(record=>{
    const geometry=record?.feature?.geometry;
    if(!['Polygon','MultiPolygon'].includes(geometry?.type))
      throw new Error('Community district missing polygon geometry');
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
    return {record,parts:polygons.map(rings=>({rings,bounds:polygonBounds(rings)}))};
  });
}
export function lookupPolygonAtPoint(index,latitude,longitude){
  if(!Array.isArray(index)||!index.length)return {status:'unavailable'};
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||
    latitude<-90||latitude>90||longitude<-180||longitude>180)return {status:'invalid'};
  const point=[longitude,latitude], hits=[];
  for(const entry of index){
    let result='outside';
    for(const part of entry.parts){
      const [x0,y0,x1,y1]=part.bounds;
      if(longitude<x0-1e-10||longitude>x1+1e-10||
        latitude<y0-1e-10||latitude>y1+1e-10)continue;
      const value=polygonStatus(point,part.rings);
      if(value==='inside'){result='inside';break;}
      if(value==='boundary')result='boundary';
    }
    if(result!=='outside')hits.push({record:entry.record,relation:result});
  }
  if(!hits.length)return {status:'outside'};
  if(hits.length>1||hits.some(x=>x.relation==='boundary'))
    return {status:'boundary',candidates:hits.map(x=>x.record)};
  const record=hits[0].record;
  return {status:'match',record};
}
export function lookupCommunityDistrict(index,latitude,longitude){
  const hit=lookupPolygonAtPoint(index,latitude,longitude);
  if(hit.status!=='match')return hit;
  return {status:hit.record.type==='board'?'board':'joint_interest',record:hit.record};
}
