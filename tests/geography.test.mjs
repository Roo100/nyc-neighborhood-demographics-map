import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validNtas, filterNtas, findNta } from '../assets/js/nta.js';

const geoPath = new URL('../data/nta2020.geojson', import.meta.url);
const hasSnapshot = fs.existsSync(geoPath);
const required = process.env.REQUIRE_PINNED_GEOJSON === '1';
if (required && !hasSnapshot) throw new Error('Required pinned official 2020 NTA GeoJSON missing');

test('official 2020 NTA GeoJSON is complete and aligned with map search', {skip: !hasSnapshot}, () => {
  const collection = JSON.parse(fs.readFileSync(geoPath, 'utf8'));
  const rows = validNtas(collection);
  assert.equal(rows.length, 262);
  assert.equal(rows.filter(r => r.special).length, 65);
  for (const [boro, count] of [
    ['Bronx', 50], ['Brooklyn', 69], ['Manhattan', 38], ['Queens', 82], ['Staten Island', 23]
  ]) {
    assert.equal(filterNtas(rows, boro).length, count);
    assert.ok(filterNtas(rows, boro).every(r => r.borough === boro));
  }
  assert.equal(findNta(rows, 'Longwood', 'Bronx')?.code, 'BX0202');
  assert.equal(findNta(rows, 'BX0202', 'Bronx')?.name, 'Longwood');
  assert.equal(findNta(rows, 'Longwood', 'Queens'), null);
  assert.equal(findNta(rows, 'QN0151')?.borough, 'Bronx'); // Rikers Island DCP exception
  assert.equal(findNta(rows, 'BX0802')?.borough, 'Bronx'); // Kingsbridge–Marble Hill
});
