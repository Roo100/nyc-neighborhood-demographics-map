// NYC POP! 2020–2024 ACS five-year NTA derived estimates — not Census
// published NTA observations. Source QC excludes unreliable or special areas.
export const ACS_FILE='data/acs/nta_display_2024.json';
const RACES={
  race_white:'White non-Hispanic',race_black:'Black non-Hispanic',
  race_asian:'Asian non-Hispanic',race_hispanic:'Hispanic (any race)',
  race_other:'Other non-Hispanic'
};
export const ACS_LAYER_OPTIONS={
  borough:{label:'Borough colors'},
  income:{label:'Approx. median household income (2024 $)'},
  poverty:{label:'Poverty rate'},
  race_black:{label:'Black non-Hispanic population share'},
  race_hispanic:{label:'Hispanic/Latino population share'},
  race_white:{label:'White non-Hispanic population share'},
  race_asian:{label:'Asian non-Hispanic population share'},
  race_other:{label:'Other non-Hispanic population share'}
};
const PALETTES={
  income:['#f5fff0','#d9ffb7','#b7f880','#74d351','#27994c'],
  poverty:['#fff4f8','#ffc6df','#ff94c8','#ff529f','#a61764'],
  race:['#f4f1ff','#dfcafa','#c39afa','#9766e7','#5425a4']
};
const LIMITS={income:[40000,60000,90000,140000],poverty:[10,20,30,40],race:[10,25,40,60]};
export function validateACSDisplay(data,ntaCodes){
  if(data?.status!=='DERIVED_ACS_ESTIMATES_WITH_EXPLICIT_90_PERCENT_UNCERTAINTY'||
    !Array.isArray(data.records)||data.records.length!==262)throw new Error('2024 ACS NTA display source invalid');
  const seen=new Set(),lookup=new Map();
  for(const r of data.records){
    const code=r?.nta2020;
    if(typeof code!=='string'||!ntaCodes.has(code)||seen.has(code))
      throw new Error('ACS map has unknown or duplicate NTA: '+code);
    seen.add(code);
    for(const field of ['median_household_income_grouped_approx_usd','poverty_rate_pct','poverty_rate_moe_90_pp_conservative']){
      if(r[field]!==null&&(typeof r[field]!=='number'||!Number.isFinite(r[field])||r[field]<0))
        throw new Error('Unexpected ACS estimate '+field+' in '+code);
    }
    if(r.poverty_rate_pct!==null&&r.poverty_rate_pct>100)throw new Error('Invalid poverty ratio');
    for(const [name,val] of Object.entries(r.race_ethnicity||{})){
      if(val!==null&&(!Number.isFinite(val.pct)||val.pct<0||val.pct>100||
        !Number.isFinite(val.moe_pp_90_approx)||val.moe_pp_90_approx<0||val.moe_pp_90_approx>20))
        throw new Error('Invalid or insufficiently reliable race share '+code+' '+name);
    }
    if(r.special_purpose&&(r.median_household_income_grouped_approx_usd!==null||
      r.poverty_rate_pct!==null||Object.values(r.race_ethnicity||{}).some(x=>x!==null)))
      throw new Error('Special-purpose geography has residential values');
    lookup.set(code,r);
  }
  if(seen.size!==262)throw new Error('Missing NTA in ACS display source');
  return lookup;
}
export function acsLayerMetric(record,layer){
  if(!record||layer==='borough')return null;
  if(layer==='income')return record.median_household_income_grouped_approx_usd;
  if(layer==='poverty')return record.poverty_rate_pct;
  const group=RACES[layer];
  return group?(record.race_ethnicity?.[group]?.pct??null):null;
}
export function acsLayerError(record,layer){
  if(!record)return null;
  if(layer==='poverty')return record.poverty_rate_moe_90_pp_conservative;
  const group=RACES[layer];
  return group?(record.race_ethnicity?.[group]?.moe_pp_90_approx??null):null;
}
export function dataLegend(layer){
  if(layer==='borough')return null;
  const isIncome=layer==='income',isPoverty=layer==='poverty';
  const type=isIncome?'income':isPoverty?'poverty':'race';
  const labels=type==='income'
    ?['Under $40k','$40k–$60k','$60k–$90k','$90k–$140k','$140k+']
    :type==='poverty'
      ?['Under 10%','10%–20%','20%–30%','30%–40%','40%+']
      :['Under 10%','10%–25%','25%–40%','40%–60%','60%+'];
  return {title:ACS_LAYER_OPTIONS[layer].label,
    colors:PALETTES[type],limits:LIMITS[type],labels};
}
export function acsFill(record,layer){
  const metric=acsLayerMetric(record,layer);
  if(!Number.isFinite(metric))return '#cbd5d9';
  const legend=dataLegend(layer);
  let bucket=0;
  while(bucket<legend.limits.length&&metric>=legend.limits[bucket])bucket++;
  return legend.colors[bucket];
}
export function formatACSValue(value,layer){
  if(!Number.isFinite(value))return 'Not available / insufficiently reliable';
  if(layer==='income')return '≈'+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
  return value.toFixed(1)+'%';
}
export function raceLabels(){return {...RACES};}
