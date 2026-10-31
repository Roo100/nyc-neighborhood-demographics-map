import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8765/';
const OUTPUT = 'test-artifacts';
fs.mkdirSync(OUTPUT, {recursive:true});
const browser = await chromium.launch({headless:true, args:['--no-sandbox']});

async function checkViewport(label, viewport) {
  const context = await browser.newContext({viewport, deviceScaleFactor:1, reducedMotion:'reduce'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error=>errors.push(error.message));
  // Automated CI must not request real OSM tiles: respect OSMF no-bulk-fetch policy.
  // A deterministic mock grid exercises layering, clipping and interaction.
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({
    status:200,contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" fill="#f8f9f5"/>
      <path d="M0 40H256 M0 95H256 M0 159H256 M0 221H256 M32 0V256 M97 0V256 M162 0V256 M222 0V256"
      stroke="#b7bac0" stroke-width="11" fill="none"/>
      <path d="M0 40H256 M0 95H256 M0 159H256 M0 221H256 M32 0V256 M97 0V256 M162 0V256 M222 0V256"
      stroke="#fff" stroke-width="8" fill="none"/>
    </svg>`
  }));
  await page.goto(BASE_URL, {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262',null,{timeout:45000});
  await page.locator('#status').filter({hasText:/Loaded 262 official 2020 NTA polygons/}).waitFor({timeout:45000});
  const title = await page.title();
  assert.match(title,/NYC POP!/);
  assert.equal(await page.locator('[data-borough]').count(),5);
  assert.equal(await page.locator('.comic-landmark').count(),5);
  assert.equal(await page.locator('.borough-label').count(),5);
  assert.equal(await page.locator('.leaflet-container').count(),1);
  assert.equal(await page.locator('#map-detail').inputValue(),'streets');
  await page.locator('.leaflet-tile').first().waitFor({timeout:15000});
  assert.ok(await page.locator('.leaflet-tile').count()>0,'Street-grid tiles are present');
  assert.ok(await page.locator('.leaflet-cityMask-pane').count()===1,'City clipping pane is present');
  assert.ok(await page.locator('#map .leaflet-control-attribution').count()===1,'Street source attribution remains visible');
  await page.locator('#map-detail').selectOption('comic');
  await page.waitForFunction(()=>document.querySelectorAll('.leaflet-tile').length===0);
  await page.locator('#map-detail').selectOption('streets');
  await page.locator('.leaflet-tile').first().waitFor({timeout:15000});
  assert.equal(await page.locator('#map canvas').count()>0,true,'NTA polygons rendered on canvas');
  if(label==='mobile'){
    const mapRect=await page.locator('#map').boundingBox();
    const legendRect=await page.locator('.map-key').boundingBox();
    assert.ok(legendRect.y>=mapRect.y+mapRect.height-1,
      'Mobile legend must be below, not over, map polygons');
  }
  const measured = await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(measured.width <= measured.viewport+2,
    'Unexpected horizontal scrolling: '+JSON.stringify(measured));
  await page.waitForTimeout(500); // Wait for Leaflet zoom animation to settle before captures.
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-overview.png',fullPage:true});
  await page.locator('[data-borough="Bronx"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='50');
  assert.equal(await page.locator('#detail-name').textContent(),'Bronx');
  assert.equal(await page.locator('.comic-landmark').count(),1);
  await page.locator('#neighborhood').fill('Longwood');
  await page.locator('#search-button').click();
  await page.locator('#detail-name').filter({hasText:'Longwood'}).waitFor();
  assert.equal(await page.locator('#detail-meta').textContent().then(text=>text.includes('BX0202')),true);
  await page.waitForTimeout(600);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-bronx-longwood.png',fullPage:true});
  await page.locator('[data-borough="Queens"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='82');
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262');
  assert.equal(await page.locator('.comic-landmark').count(),5);
  assert.deepEqual(errors,[], 'Browser runtime JavaScript exceptions');
  console.log(JSON.stringify({viewport:label,viewportPx:viewport,featureCount:262,
    bronxCount:50,queensCount:82,landmarkCount:5,search:'Longwood/BX0202',title,
    streetTiles:true,streetModeToggle:true,cityMask:true,mockedTiles:true,noJSExceptions:true,measure:measured}));
  await context.close();
}

try {
  await checkViewport('desktop',{width:1440,height:900});
  await checkViewport('mobile',{width:390,height:844});
} finally {
  await browser.close();
}
