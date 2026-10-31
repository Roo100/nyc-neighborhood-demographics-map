import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  parseBoroCd,validateCommunityGeoJSON,BOARD_COUNTS,BOROUGH_PRESIDENTS,
  COMMUNITY_LOCAL,COMMUNITY_SOURCE,COUNCIL_DIRECTORY,NYS_REPRESENTATIVES,
  indexCommunityDistricts,lookupCommunityDistrict
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


test('grid point lookup distinguishes boards, Joint Interest Areas, boundaries, holes and outside NYC',()=>{
  const feature=(code,coordinates)=>({type:'Feature',properties:{boro_cd:code},
    geometry:{type:'Polygon',coordinates}});
  const rectangle=(x0,y0,x1,y1)=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]];
  const a={...parseBoroCd(feature(201,[])),feature:feature(201,[rectangle(-74,40,-73.9,40.1)])};
  const b={...parseBoroCd(feature(202,[])),feature:feature(202,[rectangle(-73.9,40,-73.8,40.1)])};
  const j={...parseBoroCd(feature(226,[])),feature:feature(226,[
    rectangle(-74,40.2,-73.8,40.4),rectangle(-73.96,40.24,-73.92,40.3)
  ])};
  const idx=indexCommunityDistricts([a,b,j]);
  assert.equal(lookupCommunityDistrict(idx,40.05,-73.95).record.code,201);
  assert.equal(lookupCommunityDistrict(idx,40.05,-73.85).record.code,202);
  assert.equal(lookupCommunityDistrict(idx,40.35,-73.9).status,'joint_interest');
  assert.equal(lookupCommunityDistrict(idx,40.27,-73.94).status,'outside','Holes must not be assigned to the enclosing area');
  assert.equal(lookupCommunityDistrict(idx,40.05,-73.9).status,'boundary','Shared district edges are ambiguous');
  assert.equal(lookupCommunityDistrict(idx,40.7,-73.5).status,'outside');
  assert.equal(lookupCommunityDistrict(idx,NaN,-73.9).status,'invalid');
  assert.equal(lookupCommunityDistrict(null,40.05,-73.95).status,'unavailable');
});

test('community grid lookup works on official 2026 multipolygon geometry',()=>{
  const valid=validateCommunityGeoJSON(official);
  const index=indexCommunityDistricts([...valid.boards,...valid.jointInterest]);
  const target=valid.boards.find(x=>x.code===201);
  assert.ok(target);
  const g=target.feature.geometry;
  const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
  let found=null;
  for(const poly of polys){
    const ring=poly[0];
    const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
    const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
    for(let ix=1;ix<=20&&!found;ix++)for(let iy=1;iy<=20&&!found;iy++){
      const longitude=bounds[0]+(bounds[2]-bounds[0])*ix/21;
      const latitude=bounds[1]+(bounds[3]-bounds[1])*iy/21;
      const match=lookupCommunityDistrict(index,latitude,longitude);
      if(match.status==='board'&&match.record.code===201)found=[latitude,longitude];
    }
    if(found)break;
  }
  assert.ok(found,'Should find a point inside official Bronx Community Board 1');
  const result=lookupCommunityDistrict(index,found[0],found[1]);
  assert.equal(result.record.name,'Bronx Community Board 1');
  assert.equal(result.record.borough,'Bronx');
});
