import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNta,findNta,filterNtas,normalize} from '../assets/js/nta.js';
const make=(name,code,borough,type='0')=>({type:'Feature',properties:{ntaname:name,nta2020:code,boroname:borough,ntatype:type},geometry:{type:'MultiPolygon',coordinates:[]}});
test('parses official-style NTA properties',()=>{const r=parseNta(make('Central Harlem','MN1001','Manhattan'));assert.equal(r.borough,'Manhattan');assert.equal(r.code,'MN1001');assert.equal(r.special,false);});
test('special-purpose geography flagged',()=>assert.equal(parseNta(make('Park','MN9999','Manhattan','9')).special,true));
test('search and borough scope',()=>{const a=[parseNta(make('Astoria','QN0101','Queens')),parseNta(make('Central Harlem','MN1001','Manhattan'))];assert.equal(findNta(a,'harlem','Manhattan')?.code,'MN1001');assert.equal(findNta(a,'Harlem','Queens'),null);assert.equal(filterNtas(a,'Queens').length,1);});
test('normalization case insensitive',()=>assert.equal(normalize('  Queens '),'queens'));
