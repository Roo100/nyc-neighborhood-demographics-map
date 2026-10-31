import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACS_LAYER_OPTIONS,validateACSDisplay,acsLayerMetric,acsLayerError,acsFill,dataLegend,formatACSValue} from '../assets/js/acs.js';

const data=JSON.parse(readFileSync(new URL('../data/acs/nta_display_2024.json',import.meta.url),'utf8'));
const official=JSON.parse(readFileSync(new URL('../data/acs/nta_demographics_2024_review.json',import.meta.url),'utf8'));
const ntaCodes=new Set(data.records.map(x=>x.nta2020));
const lookup=validateACSDisplay(data,ntaCodes);

test('ACS 2024 sourced from official tract tables, 262 2020 NTAs, no special-area estimates',()=>{
  assert.equal(lookup.size,262);
  assert.equal(official.status,'RESEARCH_QA_ONLY_NOT_AUTHORIZED_FOR_WEBSITE');
  assert.equal(data.status,'DERIVED_ACS_ESTIMATES_WITH_EXPLICIT_90_PERCENT_UNCERTAINTY');
  assert.ok(data.acs_source.includes('US Census Bureau'));
  assert.ok(data.quality_rules.includes('Special-purpose NTAs excluded'));
  for(const r of lookup.values()){
    if(r.special_purpose){
      assert.equal(r.median_household_income_grouped_approx_usd,null);
      assert.equal(r.poverty_rate_pct,null);
      assert.ok(Object.values(r.race_ethnicity).every(x=>x===null));
    }
  }
});

test('availability counts respect missingness and quality threshold',()=>{
  const available=Object.fromEntries(['income','poverty','race_black','race_white','race_hispanic','race_asian','race_other'].map(k=>[k,
    [...lookup.values()].filter(r=>acsLayerMetric(r,k)!==null).length]));
  assert.deepEqual(available,{income:195,poverty:197,race_black:197,
    race_white:197,race_hispanic:197,race_asian:197,race_other:197});
  assert.equal(acsLayerError(null,'poverty'),null);
  for(const r of lookup.values()){
    for(const k of ['poverty','race_black','race_white','race_hispanic','race_asian','race_other']){
      const value=acsLayerMetric(r,k),moe=acsLayerError(r,k);
      if(value!==null){
        assert.ok(value>=0&&value<=100);
        assert.ok(moe!==null&&moe>=0&&moe<=20);
      }
    }
  }
});
test('income median stays clearly labeled as an approximate bracket-interpolated metric',()=>{
  const r=lookup.get('BK0101');
  assert.ok(r);
  assert.equal(acsLayerMetric(r,'income'),127599);
  assert.ok(formatACSValue(acsLayerMetric(r,'income'),'income').startsWith('≈$'));
  assert.match(r.median_note,/NOT the official B19013 median/);
  assert.match(data.moe_warning,/no median MOE/);
  assert.ok(formatACSValue(null,'income').includes('Not available'));
  assert.deepEqual(Object.keys(ACS_LAYER_OPTIONS),[
    'borough','income','poverty','race_black','race_hispanic','race_white','race_asian','race_other']);
});
test('choropleth boundaries provide unambiguous no-data swatch and fixed scale',()=>{
  const r=lookup.get('BK0101');
  const legend=dataLegend('poverty');
  assert.equal(legend.colors.length,5);
  assert.equal(legend.labels.length,5);
  assert.notEqual(acsFill(r,'poverty'),'#cbd5d9');
  const suppressed=[...lookup.values()].find(r=>acsLayerMetric(r,'poverty')===null);
  assert.ok(suppressed);
  assert.equal(acsFill(suppressed,'poverty'),'#cbd5d9');
  assert.equal(acsFill(suppressed,'income'),'#cbd5d9');
});
test('source and map presentation never invent party registration or election results',()=>{
  const app=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
  assert.ok(app.includes("acsLookup=validateACSDisplay(source,new Set(records.map(r=>r.code)))"));
  assert.ok(app.includes("ui['demographic-layer'].addEventListener('change'"));
  assert.ok(app.includes('addACSPopupInfo(root,neighborhood)'));
  assert.ok(!app.includes('getVoterPartyByNta('));
});
