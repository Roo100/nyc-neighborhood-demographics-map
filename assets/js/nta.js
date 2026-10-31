export const BOROUGHS = ['Bronx','Brooklyn','Manhattan','Queens','Staten Island'];
const BOROUGH_CODES = {'1':'Manhattan','2':'Bronx','3':'Brooklyn','4':'Queens','5':'Staten Island'};
export const normalize = value => String(value ?? '').normalize('NFKD').toLowerCase().trim();
export const escapeLabel = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function first(properties, keys){ for(const key of keys){if(properties[key] !== undefined && properties[key] !== null && String(properties[key]).trim()) return String(properties[key]).trim();} return ''; }
export function parseNta(feature){
  const p = feature?.properties ?? {};
  const code = first(p, ['nta2020','NTA2020','NTA_2020','ntacode','NTACode']);
  const name = first(p, ['ntaname','NTAName','NTAName2020','nta_name']);
  const boroRaw = first(p, ['boroname','BoroName','borough','Borough']);
  const borough = BOROUGHS.find(b => normalize(b) === normalize(boroRaw)) || BOROUGH_CODES[first(p, ['borocode','BoroCode'])] || '';
  const ntaType = first(p, ['ntatype','NTAType']);
  const special = ntaType !== '' ? ntaType !== '0' : /park|cemetery|airport|special/i.test(name);
  return {code, name, borough, ntaType, special, feature};
}
export function validNtas(geojson){
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) throw new Error('Response was not a GeoJSON FeatureCollection.');
  const records = geojson.features.map(parseNta);
  const valid = records.filter(r => r.code && r.name && r.borough && ['Polygon','MultiPolygon'].includes(r.feature.geometry?.type));
  if (valid.length !== records.length) throw new Error(`${records.length - valid.length} features lack a valid NTA code, borough, name or polygon.`);
  const codes = new Set(valid.map(r => r.code));
  if(codes.size !== valid.length) throw new Error('Duplicate NTA identifiers encountered.');
  if(new Set(valid.map(r => r.borough)).size !== 5) throw new Error('Not all five boroughs were present.');
  return valid;
}
export function filterNtas(records, borough){return borough === 'all' ? records : records.filter(record => record.borough === borough);}
export function findNta(records, query, borough='all'){
  const q = normalize(query); if(!q) return null;
  const within = filterNtas(records,borough);
  return within.find(r => normalize(r.code)===q || normalize(`${r.name} (${r.code})`)===q) || within.find(r => normalize(r.name)===q) || within.find(r => normalize(r.name).includes(q) || normalize(r.code).includes(q)) || null;
}