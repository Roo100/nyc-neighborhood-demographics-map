import test from 'node:test';
import assert from 'node:assert/strict';
import {EXTRA_CIVIC_SOURCES,validateOfficialExtraCivicGeoJSON} from '../assets/js/extra-civic.js';

const SQUARE={type:'Polygon',coordinates:[[[-73.96,40.73],[-73.95,40.73],
  [-73.95,40.74],[-73.96,40.74],[-73.96,40.73]]]};
const code=(type,i)=>type==='zip'?String(10000+i).padStart(5,'0'):
 type==='sanitation'?'MN'+String(i+1).padStart(2,'0'):i+1;
function fixture(type){
  const {count,field}=EXTRA_CIVIC_SOURCES[type];
  return {type:'FeatureCollection',features:Array.from({length:count},(_,i)=>({
    type:'Feature',geometry:SQUARE,
    properties:{[field]:code(type,i)}
  }))};
}
for(const type of ['precincts','sanitation','fire','zip']){
  test(type+' only publishes correct official source count and identifiers',()=>{
    const parsed=validateOfficialExtraCivicGeoJSON(type,fixture(type));
    assert.equal(parsed.records.length,EXTRA_CIVIC_SOURCES[type].count);
    assert.equal(parsed.index.length,EXTRA_CIVIC_SOURCES[type].count);
    assert.match(parsed.source,/data.cityofnewyork.us/);
    const short=fixture(type);short.features.pop();
    assert.throws(()=>validateOfficialExtraCivicGeoJSON(type,short));
    const repeated=fixture(type);
    repeated.features[1].properties={...repeated.features[0].properties};
    assert.throws(()=>validateOfficialExtraCivicGeoJSON(type,repeated));
    const broken=fixture(type);
    broken.features[0].geometry={type:'Point',coordinates:[-73.96,40.73]};
    assert.throws(()=>validateOfficialExtraCivicGeoJSON(type,broken));
  });
}
test('ZCTA is a 5-digit Census geography; reject USPS-like or ZIP+4 identifiers',()=>{
  const z=fixture('zip');
  z.features[0].properties.zcta5='10001-1234';
  assert.throws(()=>validateOfficialExtraCivicGeoJSON('zip',z));
});
test('no source exists for unscreened civic categories',()=>{
  assert.throws(()=>validateOfficialExtraCivicGeoJSON('court',fixture('fire')));
});
