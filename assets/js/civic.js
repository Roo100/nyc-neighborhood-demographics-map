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
  const jointInterest=numberInBorough>=80&&numberInBorough<=99;
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
