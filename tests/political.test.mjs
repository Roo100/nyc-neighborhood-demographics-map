import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ENROLLMENT_FILE,ENROLLMENT_SOURCE,validateCouncilEnrollment,
  enrollmentDetails,enrollmentShare,largestEnrollmentCategory,
  partyFill,partyLegend,PARTY_OPTIONS
} from '../assets/js/political.js';
const raw=JSON.parse(readFileSync(new URL('../data/political/council_enrollment_2026.json',import.meta.url),'utf8'));
const enrolled=validateCouncilEnrollment(raw);

test('NYC BOE official February 20 2026 PDF covers all 51 Council districts without duplicate borough fragments',()=>{
  assert.equal(raw.source_url,ENROLLMENT_SOURCE);
  assert.equal(raw.pdf_pages,56);
  assert.deepEqual(raw.pdf_continuation_pages,[44]);
  assert.equal(raw.raw_district_county_sections,55);
  assert.equal(enrolled.size,51);
  assert.deepEqual([...enrolled.keys()].sort((a,b)=>a-b),Array.from({length:51},(_,i)=>i+1));
  assert.deepEqual(Object.keys(raw.cross_borough_districts).sort(),['8','22','34','50']);
  assert.equal(ENROLLMENT_FILE,'data/political/council_enrollment_2026.json');
});
test('party registration sums reconcile to every district and the published BOE citywide report',()=>{
  const totals={active:0,inactive:0,total:0};
  for(const row of enrolled.values()){
    for(const status of Object.keys(totals))totals[status]+=row[status].Total;
  }
  assert.deepEqual(totals,{active:4960232,inactive:399113,total:5359345});
  const cd1=enrolled.get(1);
  assert.deepEqual(cd1.total,{
    Democratic:75023,Republican:10807,Conservative:231,
    'Working Families':336,Other:1550,'Unaffiliated (Blank)':28508,Total:116455
  });
  assert.equal(cd1.active.Total,104854);
});
test('largest enrollment category is not inferred from election returns or candidate party',()=>{
  assert.equal(largestEnrollmentCategory(enrolled.get(51)).name,'Republican');
  assert.equal(largestEnrollmentCategory(enrolled.get(9)).name,'Democratic');
  assert.equal([...enrolled.values()].filter(x=>largestEnrollmentCategory(x).name==='Democratic').length,50);
  assert.equal([...enrolled.values()].filter(x=>largestEnrollmentCategory(x).name==='Republican').length,1);
  assert.ok(enrollmentShare(enrolled.get(51),'republican')>0);
  assert.equal(enrollmentShare(null,'democrat'),null);
});
test('party map includes explicit category labels and a missing-data presentation',()=>{
  const legend=partyLegend('democrat');
  assert.equal(legend.entries.length,5);
  assert.equal(partyLegend('dominant').entries.length,6);
  assert.equal(partyFill(null,'dominant'),'#cbd5d9');
  assert.ok(partyFill(enrolled.get(51),'dominant')!=='#cbd5d9');
  assert.ok(enrollmentDetails(enrolled.get(1)).parties.length===6);
  assert.deepEqual(Object.keys(PARTY_OPTIONS),
    ['democrat','republican','unaffiliated','working_families','dominant']);
});
test('map source must say registration by 2026 Council district and keep distinct 2025 election results on hold',()=>{
  const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.ok(app.includes('validateCouncilEnrollment(data)'));
  assert.ok(app.includes('Council District '));
  assert.ok(app.includes('initializeCouncilMap()'));
  assert.ok(html.includes('Party enrollment · City Council districts'));
  assert.ok(html.includes('2026 party enrollment'));
  assert.ok(!app.includes('Election results are calculated by Council district'));
});
