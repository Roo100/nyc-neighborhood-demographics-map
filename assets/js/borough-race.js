// Official ACS 2025 one-year B03002 mutually exclusive racial/ethnic groups,
// county level only. Not an NTA or neighborhood source.
export const BOROUGH_RACE_2025_FILE='data/acs/borough_race_2025_verified.json';
const COUNTIES={Bronx:'36005',Brooklyn:'36047',Manhattan:'36061',Queens:'36081','Staten Island':'36085'};
export const RACE_GROUPS=['White non-Hispanic','Black non-Hispanic','Asian non-Hispanic','Hispanic / Latino (any race)','Other non-Hispanic'];
export function validateBoroughRace2025(data){
  if(data?.status!=='VERIFIED_ACS_2025_1_YEAR_B03002_NYC_COUNTIES'||
    data.period!=='2025'||!Array.isArray(data.records)||data.records.length!==5)
    throw new Error('Unverified ACS 2025 borough ethnicity dataset');
  const map=new Map();
  for(const entry of data.records){
    if(COUNTIES[entry.borough]!==entry.county_fips||map.has(entry.borough)||
       !Number.isInteger(entry.population)||entry.population<1)
      throw new Error('Invalid 2025 ACS county race record');
    let sum=0;
    for(const group of RACE_GROUPS){
      const count=entry.counts?.[group], share=entry.shares_pct?.[group];
      if(!Number.isInteger(count)||count<0||
         !Number.isFinite(share)||share<0||share>100||
         Math.abs(share-100*count/entry.population)>.011)
        throw new Error('Invalid 2025 race share '+group);
      sum+=count;
    }
    if(sum!==entry.population)throw new Error('Race/ethnicity count reconciliation failed');
    map.set(entry.borough,entry);
  }
  if(map.size!==5)throw new Error('Missing NYC borough race record');
  return map;
}
