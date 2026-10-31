import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DISTRICT_KINDS,validateDistrictGeoJSON,validateOfficialNames,
  makeDistrictLookup,identifyLegislators,officialForDistrict} from '../assets/js/representation.js';
const manifest=JSON.parse(readFileSync(new URL('../data/legislative/validation-2026.json',import.meta.url),'utf8'));
const names=validateOfficialNames(JSON.parse(readFileSync(new URL('../data/legislative/officials-verified-2026-10-31.json',import.meta.url),'utf8')));
const source={};
for(const [key,cfg] of Object.entries(DISTRICT_KINDS)){
  const raw=JSON.parse(readFileSync(new URL('../'+cfg.file,import.meta.url),'utf8'));
  source[key]=validateDistrictGeoJSON(key,raw,manifest);
}
test('official 2026 DCP legislative boundaries validate exact NYC district coverage',()=>{
  assert.deepEqual(Object.fromEntries(Object.entries(source).map(([key,rows])=>[key,rows.length])),
    {council:51,senate:28,assembly:65,congress:13});
  for(const [key,rows] of Object.entries(source)){
    assert.equal(new Set(rows.map(x=>x.code)).size,rows.length,key);
    assert.equal(rows.length,manifest.sources[key].district_count);
    assert.equal(rows.every(x=>x.feature.geometry.coordinates.length>0),true);
  }
});
test('as-of official directory maps exactly 51 council seats; missing senate member is not invented',()=>{
  for(let i=1;i<=51;i++)assert.ok(officialForDistrict(names,'council',i));
  assert.equal(officialForDistrict(names,'council',9),'Yusef Salaam');
  assert.equal(officialForDistrict(names,'senate',47),'Erik Bottcher');
  assert.equal(officialForDistrict(names,'senate',12),null,'Former senator is not incumbent in Oct 2026');
  assert.equal(officialForDistrict(names,'assembly',70),null,'Assembly name not verified in this snapshot');
});
test('clicked city block resolves independent polygon memberships, not NTA majority',()=>{
  const indices=Object.fromEntries(Object.entries(source).map(([k,rows])=>[k,{index:makeDistrictLookup(rows)}]));
  const points=[[40.74844,-73.98566],[40.8307,-73.927],[40.7306,-73.794],[40.579,-74.145]];
  for(const [latitude,longitude] of points){
    const hit=identifyLegislators(indices,latitude,longitude);
    for(const type of Object.keys(DISTRICT_KINDS)){
      assert.equal(hit[type].status,'match',type+' at '+latitude+','+longitude+' got '+hit[type].status);
      assert.ok(Number.isInteger(hit[type].record.code));
    }
  }
  const misses=identifyLegislators(indices,40.70,-72.00);
  assert.ok(Object.values(misses).every(v=>v.status==='outside'));
});
test('no NTA to representative one-to-one shortcuts are introduced',()=>{
  const js=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.ok(js.includes('identifyLegislators(legislativeLookup,latlng.lat,latlng.lng)'));
  assert.ok(js.includes('loadLegislativeDistricts()'));
  assert.ok(!js.includes('getCouncilForNta('));
});
