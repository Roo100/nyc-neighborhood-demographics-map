import test from 'node:test';
import assert from 'node:assert/strict';
import {CIVIC_CATEGORY_GROUPS,CIVIC_CATEGORIES,getCivicCategory,civicCategoryIsMapped}
  from '../assets/js/civic-categories.js';

test('civic guide groups BetaNYC boundary categories without duplicates',()=>{
  assert.deepEqual(CIVIC_CATEGORY_GROUPS.map(g=>g.id),[
    'representation','schools','services','planning','elections'
  ]);
  assert.equal(new Set(CIVIC_CATEGORIES.map(c=>c.id)).size,CIVIC_CATEGORIES.length);
  assert.ok(CIVIC_CATEGORIES.length>=22);
  for(const group of CIVIC_CATEGORY_GROUPS)assert.ok(group.items.length>=2);
});
test('mapped geographies are explicitly distinguished from reference-only categories',()=>{
  for(const id of ['community','council','senate','assembly','congress','schooldistricts','nta','schoolsites']){
    const category=getCivicCategory(id);
    assert.ok(category);
    assert.equal(civicCategoryIsMapped(category),true);
  }
  for(const id of ['precincts','sanitation','fire','health','zip','election']){
    const category=getCivicCategory(id);
    assert.ok(category);
    assert.equal(civicCategoryIsMapped(category),false);
    assert.equal(new URL(category.source).hostname,'boundaries.beta.nyc');
  }
});
test('school districts are geographic, not an attendance zone claim',()=>{
  const district=getCivicCategory('schooldistricts');
  assert.equal(district.code,'sd');
  assert.match(district.description,/not.*attendance zones/i);
  assert.equal(getCivicCategory('not-a-category'),null);
});
