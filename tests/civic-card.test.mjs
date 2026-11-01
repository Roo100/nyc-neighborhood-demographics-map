import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCivicCard,SCHOOL_ZONE_FINDER} from '../assets/js/civic-card.js';

const base={
  neighborhood:{name:'Astoria',borough:'Queens'},
  boardMatch:{status:'board',record:{name:'Queens Community Board 1',borough:'Queens'}},
  schoolMatch:{status:'match',record:{code:30}},
  legislators:{
    council:{status:'match',record:{code:22}},
    senate:{status:'match',record:{code:12}},
    assembly:{status:'match',record:{code:36}},
    congress:{status:'match',record:{code:14}}
  },
  boroughPresidents:{Queens:'Verified Queens President'},
  officials:{council:{names:{'22':'Council Representative'}},senate:{names:{}}}
};
test('point-based civic card contains community board, officials and geography, not demographics',()=>{
  const card=buildCivicCard(base);
  assert.equal(card.board,'Queens Community Board 1');
  assert.equal(card.school,'Geographic School District 30');
  assert.equal(card.officials[0][1],'Verified Queens President');
  assert.equal(card.officials[1][1],'Council Representative · District 22');
  assert.equal(card.officials[2][1],'District 12 · representative name not verified');
  assert.equal(card.officials[3][1],'District 36 · representative name not verified');
  assert.equal(card.schoolFinder,SCHOOL_ZONE_FINDER);
  const values=JSON.stringify(card);
  assert.doesNotMatch(values,/poverty|income|median|racial percentage/i);
  assert.match(values,/NOT a school zone/);
});
test('point on a boundary must not receive an invented official or school',()=>{
  const card=buildCivicCard({...base,
    boardMatch:{status:'boundary'},schoolMatch:{status:'boundary'},
    legislators:{council:{status:'boundary'},senate:{status:'unavailable'}}});
  assert.match(card.board,/boundary/i);
  assert.match(card.school,/boundary/i);
  assert.match(card.officials[1][1],/verify exact address/i);
  assert.match(card.officials[2][1],/unavailable/i);
});
test('joint-interest special area has no fabricated community board',()=>{
  const card=buildCivicCard({...base,neighborhood:null,
    boardMatch:{status:'joint_interest',record:{name:'Joint Interest Area',borough:'Queens'}}});
  assert.match(card.board,/not a regular community board/);
  assert.equal(card.title,'Selected NYC location');
});
