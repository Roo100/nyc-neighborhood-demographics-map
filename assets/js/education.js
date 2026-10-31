// Official geographic sources; never use a district polygon to infer school admission.
export const SCHOOL_DISTRICTS_LOCAL = 'data/schools/school-districts-2026.geojson';
export const K12_SCHOOL_POINTS_LOCAL = 'data/schools/k12-schools-nysed.geojson';
export const SCHOOL_DISTRICTS_SOURCE = 'https://data.cityofnewyork.us/d/8ugf-3d8u';
export const K12_SCHOOL_POINTS_SOURCE = 'https://nysgeohub.ny.gov/arcgis/rest/services/Education/NYS_Schools/FeatureServer/0';
export const DOE_DIRECTORY_SOURCE = 'https://infohub.nyced.org/reports/admissions-and-enrollment/directory-data';
export const DOE_MYSCHOOLS = 'https://www.myschools.nyc/en/';
export const DOE_ZONING_INFO = 'https://www.schools.nyc.gov/enrollment/enrollment-help/find-a-school';
export const SCHOOL_BOROUGHS = ['Bronx','Brooklyn','Manhattan','Queens','Staten Island'];
const SCHOOL_TYPES = ['Public','Charter','Nonpublic','Unclassified'];

export function validateSchoolDistricts(source) {
  if(source?.type!=='FeatureCollection' || !Array.isArray(source.features) || source.features.length!==32){
    throw new Error('Expected exactly 32 unique official NYC school district geometries');
  }
  const codes = new Set(), records=[];
  for(const feature of source.features){
    const code=Number(feature?.properties?.district);
    if(!Number.isInteger(code)||code<1||code>32||codes.has(code)
      ||!['Polygon','MultiPolygon'].includes(feature?.geometry?.type)
      ||!feature?.geometry?.coordinates?.length){
      throw new Error('Unrecognized or duplicated school district number/geometry');
    }
    codes.add(code);
    records.push({code,name:'School District '+code,feature});
  }
  if(codes.size!==32)throw new Error('Missing one or more school district polygons');
  return records.sort((a,b)=>a.code-b.code);
}

export function validateSchoolLocations(source, report) {
  if(source?.type!=='FeatureCollection'||!Array.isArray(source.features)
    ||source.features.length<1500||source.features.length>6000){
    throw new Error('NYSED source K–12 school point count is missing or unexpectedly small/large');
  }
  if(report?.nyc_school_count!==source.features.length){
    throw new Error('NYSED school location manifest and point count disagree');
  }
  const seen=new Set(), records=[];
  for(const f of source.features){
    const p=f?.properties||{}, c=f?.geometry?.coordinates;
    if(f?.geometry?.type!=='Point'||!Array.isArray(c)||c.length!==2
      ||!SCHOOL_BOROUGHS.includes(p.borough)
      ||!SCHOOL_TYPES.includes(p.type)
      ||typeof p.name!=='string'||!p.name.trim()
      ||typeof p.id!=='string'||!p.id.trim()||seen.has(p.id)
      ||!Number.isFinite(c[0])||!Number.isFinite(c[1])
      ||c[0]<-74.35||c[0]>-73.6||c[1]<40.45||c[1]>41.0){
      throw new Error('NYSED K–12 point invalid, duplicate or outside expected NYC extent');
    }
    seen.add(p.id);
    records.push({id:p.id,name:p.name,borough:p.borough,street:p.street||'',
      city:p.city||'',zip:p.zip||'',type:p.type,
      sourceClass:p.source_class||'',sourceSubtype:p.source_subtype||'',
      coordinates:[c[1],c[0]],feature:f});
  }
  return records;
}
export function filterSchoolLocations(records,borough,type,query){
  const normalized=(query||'').trim().toLocaleLowerCase('en');
  return records.filter(s=>(borough==='all'||s.borough===borough)
    &&(type==='all'||s.type===type)
    &&(!normalized||s.name.toLocaleLowerCase('en').includes(normalized)
      ||s.street.toLocaleLowerCase('en').includes(normalized)
      ||s.id.toLocaleLowerCase('en').includes(normalized)));
}
