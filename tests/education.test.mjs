import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  validateSchoolDistricts,validateSchoolLocations,filterSchoolLocations,
  SCHOOL_DISTRICTS_LOCAL,K12_SCHOOL_POINTS_LOCAL
} from '../assets/js/education.js';

const districts=JSON.parse(readFileSync(new URL('../data/schools/school-districts-2026.geojson',import.meta.url),'utf8'));
const schools=JSON.parse(readFileSync(new URL('../data/schools/k12-schools-nysed.geojson',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../data/schools/validation-2026.json',import.meta.url),'utf8'));

test('official DCP 26b source gives 32 unique NYC school district geometries from 33 source features',()=>{
  const records=validateSchoolDistricts(districts);
  assert.equal(records.length,32);
  assert.deepEqual(records.map(x=>x.code),Array.from({length:32},(_,i)=>i+1));
  assert.equal(manifest.district_source_feature_count,33);
  assert.equal(manifest.district_count,32);
  assert.ok(manifest.district_source.includes('8ugf-3d8u'));
  assert.equal(SCHOOL_DISTRICTS_LOCAL,'data/schools/school-districts-2026.geojson');
});

test('NYS Education GIS source K–12 site points have verified boroughs and school categories',()=>{
  const parsed=validateSchoolLocations(schools,manifest);
  assert.equal(parsed.length,manifest.nyc_school_count);
  assert.ok(parsed.length>=1500);
  assert.equal(new Set(parsed.map(x=>x.id)).size,parsed.length);
  for(const [b,n] of Object.entries(manifest.borough_counts)){
    assert.equal(parsed.filter(x=>x.borough===b).length,n,b);
  }
  for(const [type,n] of Object.entries(manifest.school_type_counts)){
    assert.equal(parsed.filter(x=>x.type===type).length,n,type);
  }
  assert.equal(K12_SCHOOL_POINTS_LOCAL,'data/schools/k12-schools-nysed.geojson');
});

test('K–12 school name, type, borough and ID search is deterministic',()=>{
  const parsed=validateSchoolLocations(schools,manifest);
  const example=parsed.find(s=>s.borough==='Bronx'&&s.type==='Public');
  assert.ok(example);
  assert.equal(filterSchoolLocations(parsed,'Bronx','Public',example.id).filter(x=>x.id===example.id).length,1);
  assert.equal(filterSchoolLocations(parsed,'Queens','Public',example.id).filter(x=>x.id===example.id).length,0);
  assert.ok(filterSchoolLocations(parsed,'all','all','').length>2000);
  assert.equal(filterSchoolLocations(parsed,'all','Charter','').length,manifest.school_type_counts.Charter);
});

test('education layer explicitly avoids fabricating grade spans and school assignment zones',()=>{
  const src=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(src.includes('loadEducationGeography()'));
  assert.ok(src.includes('refreshSchoolPins()'));
  assert.ok(src.includes("mode==='schooldistricts'"));
  assert.ok(src.includes('Grade span'));
  assert.ok(src.includes('Not available in mapped source'));
  assert.ok(html.includes('id="school-type"'));
  assert.ok(html.includes('id="school-search"'));
  assert.ok(html.includes('School districts · 2026'));
  assert.ok(html.includes('K–12 school locations'));
  assert.ok(!src.includes('schoolDistrictForNta('));
});
