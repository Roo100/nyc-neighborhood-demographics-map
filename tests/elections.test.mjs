import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCitywideMayoralResult} from '../assets/js/elections.js';
const src=JSON.parse(readFileSync(new URL('../data/elections/mayor_2025_verified_citywide.json',import.meta.url),'utf8'));

test('certified 2025 mayoral source reconciles candidate and ballot totals',()=>{
  const d=validateCitywideMayoralResult(src);
  assert.equal(d.total_ballots,2218647);
  assert.equal(d.total_candidate_and_write_in_votes,2194204);
  assert.equal(d.unrecorded_ballots,24443);
  assert.equal(d.candidates[0].votes,1114184);
  assert.equal(d.candidates[1].votes,906614);
  assert.equal(d.candidates[2].votes,153749);
  assert.equal(d.candidates.reduce((v,r)=>v+r.votes,0),2194204);
  assert.equal(d.counties.reduce((v,r)=>v+r.ballots,0),2218647);
});

test('candidate fusion party lines are aggregated and election result remains citywide only',()=>{
  const d=validateCitywideMayoralResult(src);
  assert.equal(d.candidates.length,8);
  assert.equal(d.geographic_resolution,'CITYWIDE_ONLY');
  assert.equal(d.candidates[0].name,'Zohran Kwame Mamdani');
  assert.equal(d.candidates[0].votes,944950+169234);
  assert.equal(d.candidates[2].votes,143305+10444);
  assert.match(d.notice,/not party enrollment/i);
  assert.throws(()=>validateCitywideMayoralResult({...d,geographic_resolution:'NTA'}));
  assert.throws(()=>validateCitywideMayoralResult({...d,total_candidate_and_write_in_votes:2194203}));
});

test('site panel labels the election and does not infer neighborhood 2025 vote winner',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const script=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
 assert.ok(html.includes('id="mayor-election-2025"'));
 assert.ok(html.includes('Citywide results only.'));
 assert.ok(html.includes('Separate from 2026 party registration'));
 assert.ok(script.includes('loadCertifiedMayorResults()'));
 assert.ok(script.includes('MAYOR_2025_CITYWIDE'));
 assert.ok(!script.includes('mayorVotesForNta('));
});
