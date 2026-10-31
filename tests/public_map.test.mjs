import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BOROUGHS} from '../assets/js/nta.js';

const js=readFileSync(new URL('../assets/js/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../assets/css/styles.css',import.meta.url),'utf8');

test('city-only overview removes external street basemap',()=>{
  assert.ok(js.includes("map=L.map('map'"));
  assert.ok(!js.includes('L.tileLayer('));
  assert.ok(!js.includes('tile.openstreetmap.org'));
  assert.ok(css.includes('#map,.leaflet-container{background:#e7f1f5}'));
});

test('each of five official boroughs has an accessible direct control',()=>{
  const controls=[...html.matchAll(/data-borough="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(controls,BOROUGHS);
  assert.ok(html.includes('aria-label="Explore New York City boroughs"'));
  assert.ok(js.includes("if(ui.borough.value==='all')switchBorough(r.borough)"));
});

test('borough overview retains NTA drilldown and versioned official geography',()=>{
  assert.ok(js.includes("data/nta2020.geojson"));
  assert.ok(js.includes("filterNtas(records,borough)"));
  assert.ok(js.includes("function display(record)"));
  assert.ok(js.includes("findNta(records,ui.neighborhood.value,ui.borough.value)"));
  assert.ok(js.includes("BOROUGH_COLORS"));
});

test('unverified income and political measures remain absent',()=>{
  assert.ok(html.includes('remain unavailable until their source data and geographic alignment pass validation'));
  assert.ok(!js.includes('nta_income_2024.json'));
  assert.ok(!js.includes('election_results'));
});

test('comic atlas uses neon borough palette and exact named orientation markers',()=>{
  const palette=['#C7FF00','#FF3B9D','#00D9FF','#AF68FF','#FF9A24'];
  for(const hex of palette)assert.ok(js.includes(hex),'Missing borough fill '+hex);
  const landmarks=['Yankee Stadium','Coney Island Cyclone','Empire State Building','The Unisphere','St. George Ferry Terminal'];
  for(const name of landmarks)assert.ok(js.includes(name),'Missing named landmark '+name);
  assert.equal(js.split('coords:[').length-1,5);
  assert.ok(js.includes("marker.bindTooltip("));
  assert.ok(js.includes("landmarkLayer.clearLayers()"));
  assert.ok(html.includes('comic-style'));
  assert.ok(css.includes('.comic-landmark-inner'));
  assert.ok(css.includes('prefers-reduced-motion'));
});
