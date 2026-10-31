import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseBoroCd,validateCommunityGeoJSON,BOARD_COUNTS,BOROUGH_PRESIDENTS,
  COMMUNITY_LOCAL,COMMUNITY_SOURCE,COUNCIL_DIRECTORY,NYS_REPRESENTATIVES
} from '../assets/js/civic.js';

const official=JSON.parse(readFileSync(new URL('../data/civic/community-districts-2026.geojson',import.meta.url),'utf8'));
const report=JSON.parse(readFileSync(new URL('../data/civic/community-districts-2026-validation.json',import.meta.url),'utf8'));

test('official pinned May 2026 geography yields exactly 59 boards and 12 non-board JIAs',()=>{
  const result=validateCommunityGeoJSON(official);
  assert.equal(official.features.length,71);
  assert.equal(result.boards.length,59);
  assert.equal(result.jointInterest.length,12);
  assert.equal(new Set(result.boards.map(x=>x.code)).size,59);
  for(const [borough,n] of Object.entries(BOARD_COUNTS)){
    assert.equal(result.boards.filter(x=>x.borough===borough).length,n,borough);
  }
  assert.equal(report.community_board_count,59);
  assert.equal(report.joint_interest_area_count,12);
  assert.equal(report.source_page,COMMUNITY_SOURCE);
  assert.equal(COMMUNITY_LOCAL,'data/civic/community-districts-2026.geojson');
});

test('Joint Interest Areas do not acquire fictitious board numbers or members',()=>{
  const parsed=parseBoroCd({properties:{boro_cd:226}});
  assert.equal(parsed.type,'joint_interest');
  assert.equal(parsed.borough,'Bronx');
  const parsed2=parseBoroCd({properties:{boro_cd:483}});
  assert.equal(parsed2.type,'joint_interest');
  assert.equal(parsed2.borough,'Queens');
  assert.equal(parseBoroCd({properties:{boro_cd:0}}),null);
  assert.equal(parseBoroCd({properties:{boro_cd:355}}).type,'joint_interest');
  const original=validateCommunityGeoJSON(official);
  for(const record of original.jointInterest)assert.notEqual(record.type,'board');
});

test('the user-facing civic resource layer identifies officeholders only at borough level',()=>{
  assert.deepEqual(Object.keys(BOROUGH_PRESIDENTS).sort(),
    ['Bronx','Brooklyn','Manhattan','Queens','Staten Island'].sort());
  assert.ok(COUNCIL_DIRECTORY.includes('council.nyc.gov/districts/'));
  assert.ok(NYS_REPRESENTATIVES.includes('elections.ny.gov/'));
  const js=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.ok(js.includes('communityLayer=L.geoJSON'));
  assert.ok(js.includes('communityLayer.addTo(map)'));
  assert.ok(js.includes("selectedCommunity?boardProfile(selectedCommunity):boardOverview(borough)"));
  assert.ok(!js.includes('communityBoards.find(x=>x.nta'));
});
