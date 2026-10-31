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
  await page.goto(BASE_URL, {waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262',null,{timeout:45000});
  await page.locator('#status').filter({hasText:/Loaded 262 official 2020 NTA polygons/}).waitFor({timeout:45000});
  const title = await page.title();
  assert.match(title,/NYC POP!/);
  assert.equal(await page.locator('[data-borough]').count(),5);
  assert.equal(await page.locator('.comic-landmark').count(),5);
  assert.equal(await page.locator('.borough-label').count(),5);
  assert.equal(await page.locator('.leaflet-container').count(),1);
  assert.equal(await page.locator('.leaflet-tile').count(),0,'No tiles or surrounding municipalities');
  assert.equal(await page.locator('#map canvas').count()>0,true,'NTA polygons rendered on canvas');
  const measured = await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(measured.width <= measured.viewport+2,
    'Unexpected horizontal scrolling: '+JSON.stringify(measured));
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-overview.png',fullPage:true});
  await page.locator('[data-borough="Bronx"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='50');
  assert.equal(await page.locator('#detail-name').textContent(),'Bronx');
  assert.equal(await page.locator('.comic-landmark').count(),1);
  await page.locator('#neighborhood').fill('Longwood');
  await page.locator('#search-button').click();
  await page.locator('#detail-name').filter({hasText:'Longwood'}).waitFor();
  assert.equal(await page.locator('#detail-meta').textContent().then(text=>text.includes('BX0202')),true);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-bronx-longwood.png',fullPage:true});
  await page.locator('[data-borough="Queens"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='82');
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262');
  assert.equal(await page.locator('.comic-landmark').count(),5);
  assert.deepEqual(errors,[], 'Browser runtime JavaScript exceptions');
  console.log(JSON.stringify({viewport:label,viewportPx:viewport,featureCount:262,
    bronxCount:50,queensCount:82,landmarkCount:5,search:'Longwood/BX0202',title,
    noTiles:true,noJSExceptions:true,measure:measured}));
  await context.close();
}

try {
  await checkViewport('desktop',{width:1440,height:900});
  await checkViewport('mobile',{width:390,height:844});
} finally {
  await browser.close();
}
