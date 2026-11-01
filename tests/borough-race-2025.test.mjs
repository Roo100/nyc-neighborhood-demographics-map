import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBoroughRace2025,RACE_GROUPS} from '../assets/js/borough-race.js';

const codes={Bronx:'36005',Brooklyn:'36047',Manhattan:'36061',Queens:'36081','Staten Island':'36085'};
function fixture(){
  return {status:'VERIFIED_ACS_2025_1_YEAR_B03002_NYC_COUNTIES',period:'2025',
    records:Object.entries(codes).map(([borough,county_fips])=>({
      borough,county_fips,population:1000,
      counts:Object.fromEntries(RACE_GROUPS.map((g,i)=>[g,[250,300,100,250,100][i]])),
      shares_pct:Object.fromEntries(RACE_GROUPS.map((g,i)=>[g,[25,30,10,25,10][i]]))
    }))};
}
test('2025 race shares require 5 official NYC counties and mutually exclusive groups',()=>{
  const rows=validateBoroughRace2025(fixture());
  assert.equal(rows.size,5);
  assert.equal(rows.get('Bronx').shares_pct['Black non-Hispanic'],30);
});
test('reject county mismatch, missing borough and race groups with non-reconciling totals',()=>{
  let f=fixture();f.records[0].county_fips='36001';
  assert.throws(()=>validateBoroughRace2025(f));
  f=fixture();f.records.pop();assert.throws(()=>validateBoroughRace2025(f));
  f=fixture();f.records[0].counts['Other non-Hispanic']=200;
  assert.throws(()=>validateBoroughRace2025(f));
});
test('reject publication of a non-2025 or unverified source',()=>{
  let f=fixture();f.period='2024';assert.throws(()=>validateBoroughRace2025(f));
  f=fixture();f.status='draft';assert.throws(()=>validateBoroughRace2025(f));
});
