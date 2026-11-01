// Official 2025 ACS one-year county B19013 median household income.
// Distinct from grouped-bin 2020–2024 neighborhood estimates.
export const BOROUGH_INCOME_2025_FILE='data/acs/borough_income_2025_verified.json';
const COUNTY={Bronx:'36005',Brooklyn:'36047',Manhattan:'36061',Queens:'36081','Staten Island':'36085'};
export function validateBoroughIncome2025(data){
  if(data?.status!=='VERIFIED_ACS_2025_1_YEAR_B19013_NYC_COUNTIES'||
    data.period!=='2025'||!Array.isArray(data.records)||data.records.length!==5)
    throw new Error('2025 one-year ACS county dataset not validated');
  const map=new Map();
  for(const entry of data.records){
    if(COUNTY[entry.borough]!==entry.county_fips||map.has(entry.borough)||
       !Number.isInteger(entry.median_household_income_usd)||
       entry.median_household_income_usd<1||
       !Number.isInteger(entry.moe_90_usd)||entry.moe_90_usd<0)
      throw new Error('Unverified 2025 county median or MOE');
    map.set(entry.borough,entry);
  }
  if(map.size!==5)throw new Error('Missing NYC county incomes');
  return map;
}
