import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE_URL = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8765/';
const OUTPUT = 'test-artifacts';
const educationManifest = JSON.parse(fs.readFileSync('data/schools/validation-2026.json','utf8'));
const schoolData = JSON.parse(fs.readFileSync('data/schools/k12-schools-nysed.geojson','utf8'));
const bronxPublicSchool = schoolData.features.find(f=>f.properties.borough==='Bronx'&&f.properties.type==='Public');
if(!bronxPublicSchool)throw new Error('Missing public Bronx school sample in pinned source');
const bronxPublicCount=schoolData.features.filter(f=>f.properties.borough==='Bronx'&&f.properties.type==='Public').length;
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
  const matteCounts = await page.locator('canvas.city-matte-canvas').evaluate(canvas=>{
    const ctx=canvas.getContext('2d'),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let transparent=0,opaque=0;
    for(let i=3;i<d.length;i+=4*31){
      if(d[i]===0)transparent++;
      if(d[i]===255)opaque++;
    }
    return {transparent,opaque};
  });
  assert.ok(matteCounts.transparent>100 && matteCounts.opaque>100,
    'City canvas mask needs both transparent NYC land and opaque outside-city areas: '+JSON.stringify(matteCounts));
  if(label==='desktop'){
    const manhattanClear=await page.evaluate(()=>{
      const mapEl=document.getElementById('map');
      const marker=[...document.querySelectorAll('.borough-label')].find(e=>e.textContent?.includes('Manhattan'));
      const c=document.querySelector('canvas.city-matte-canvas');
      const a=marker.getBoundingClientRect(),b=mapEl.getBoundingClientRect();
      const x=Math.round(((a.left+a.width/2)-b.left)*c.width/b.width);
      const y=Math.round(((a.top+a.height/2)-b.top)*c.height/b.height);
      return c.getContext('2d').getImageData(x,y,1,1).data[3];
    });
    assert.equal(manhattanClear,0,'Manhattan landmark area must reveal the street grid through matte');
  }
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
  assert.ok(!(await page.locator('#detail-meta').textContent()).includes('BX0202'),'NTA identifiers should not be visible in neighborhood profiles');
  assert.equal(await page.locator('#neighborhood').getAttribute('placeholder'),'Search e.g. Harlem, Astoria, Longwood');
  await page.waitForFunction(()=>document.querySelector('#civic-source')?.textContent.includes('59 boards'));
  // Search centers the Longwood NTA. Click its map polygon, not a menu or the
  // side profile. Its popup must lead with the neighborhood name.
  await page.waitForTimeout(350);
  const neighborhoodMapBox=await page.locator('#map').boundingBox();
  await page.locator('#map').click({position:{
    x:Math.round(neighborhoodMapBox.width/2),y:Math.round(neighborhoodMapBox.height/2)
  }});
  const popupSelector=label==='mobile'?'.nyc-pop-mobile-overlay':'.nyc-pop-info-popup:visible';
  await page.locator(popupSelector+' .nyc-pop-info-title').last().waitFor();
  const heading=await page.locator(popupSelector+' .nyc-pop-info-title').last().textContent();
  assert.ok(heading&&heading!=='Selected NYC location','Map click must identify the actual neighborhood under the cursor');
  const firstPopup=await page.locator('.nyc-pop-info-card:visible').last().textContent();
  assert.ok(firstPopup.includes('Community board'));
  assert.ok(firstPopup.includes('School district'));
  assert.ok(firstPopup.includes('Borough president'));
  assert.ok(!firstPopup.includes('BX0202'),'No internal NTA identifier in public popup');
  const popupWidth=await page.locator(popupSelector+' .nyc-pop-info-card').last()
    .evaluate(element=>element.getBoundingClientRect().width);
  assert.ok(popupWidth>=220,'Civic popup content must be readable, not a tiny vertical text strip: '+popupWidth);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-neighborhood-click-popup.png',fullPage:true});
  assert.equal(await page.locator('#detail-name').textContent(),heading,'Selected map neighborhood and side profile must match');
  // Close the popup using the exposed accessible close control. Avoid relying
  // on pixel geometry if test zoom/scroll has positioned the control at edge.
  if(label==='mobile')await page.locator('.nyc-pop-mobile-overlay .nyc-pop-mobile-close').click();
  else await page.locator('.nyc-pop-info-popup:visible .leaflet-popup-close-button').last()
    .evaluate(node=>node.click());
  await page.locator('#identify-board-center').click();
  await page.waitForFunction(()=>['board','boundary','joint_interest','outside'].includes(
    document.querySelector('#point-board-panel')?.dataset.lookupStatus));
  assert.equal(await page.locator('#detail-name').textContent(),heading,
    'Clicked neighborhood profile remains available beside the street-grid lookup');
  await page.waitForTimeout(600);
  await page.locator('[data-borough="Queens"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='82');
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262');
  assert.equal(await page.locator('.comic-landmark').count(),5);
  // Community boards load independently from the pinned official May 2026 file.
  await page.waitForFunction(()=>{
    const x=document.getElementById('civic-layer');
    return x && !x.disabled && !x.querySelector('[value="boards"]').disabled;
  },null,{timeout:45000});
  assert.ok((await page.locator('#civic-source').textContent()).includes('59 boards'));
  await page.locator('#civic-layer').selectOption('boards');
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='59');
  assert.equal(await page.locator('#feature-label').textContent(),'community boards in selected borough filter');
  assert.equal(await page.locator('#board-picker-field').isVisible(),true);
  assert.equal(await page.locator('#community-board option').count(),60); // 59 + placeholder
  assert.equal(await page.locator('#detail-name').textContent(),'NYC Community Boards');
  assert.ok((await page.locator('#civic-context').textContent()).includes('59 community boards'));
  await page.locator('[data-borough="Bronx"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='12');
  assert.equal(await page.locator('#borough-president').textContent(),'Vanessa L. Gibson');
  assert.equal(await page.locator('#community-board option').count(),13);
  await page.locator('#community-board').selectOption('201');
  await page.locator('#detail-name').filter({hasText:'Bronx Community Board 1'}).waitFor();
  assert.ok((await page.locator('#detail-meta').textContent()).includes('201'));
  // Selecting a geographic point must look up its board from the pinned 2026
  // polygons without replacing the board/education/neighborhood profile.
  await page.locator('#identify-board-center').click();
  await page.waitForFunction(()=>['board','boundary','outside','joint_interest'].includes(
    document.querySelector('#point-board-panel')?.dataset.lookupStatus),null,{timeout:15000});
  assert.ok((await page.locator('#point-board-coordinates').textContent()).includes('Selected map point:'));
  assert.ok(await page.locator('.grid-map-click-marker').count()===1);
  assert.equal(await page.locator(popupSelector).count(),1);
  if(label==='mobile')await page.locator('.nyc-pop-mobile-overlay .nyc-pop-mobile-close').click();
  else await page.locator('.nyc-pop-info-popup:visible .leaflet-popup-close-button').last()
    .evaluate(node=>node.click());
  // The point can also be selected by clicking the map grid directly.
  const mapBoxForClick=await page.locator('#map').boundingBox();
  await page.locator('#map').click({position:{x:Math.round(mapBoxForClick.width/2),y:Math.round(mapBoxForClick.height/2)}});
  await page.waitForFunction(()=>['board','boundary','outside','joint_interest'].includes(
    document.querySelector('#point-board-panel')?.dataset.lookupStatus));
  assert.equal(await page.locator('.grid-map-click-marker').count(),1);
  assert.ok((await page.locator('#point-board-result').textContent()).length>35);
  assert.equal(await page.locator('#detail-name').textContent(),'Bronx Community Board 1');
  await page.waitForTimeout(500);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-community-board.png',fullPage:true});
  await page.locator('[data-borough="Queens"]').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='14');
  assert.equal(await page.locator('#borough-president').textContent(),'Donovan Richards');
  await page.locator('#civic-layer').selectOption('nta');
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='82');
  assert.equal(await page.locator('#board-picker-field').isVisible(),false);
  assert.equal(await page.locator('#neighborhood').isEnabled(),true);
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262');

  // Independently pinned DCP school districts + NYSED K–12 school point records.
  await page.waitForFunction(()=>['schooldistricts','schools'].every(v=>
    !document.querySelector('#civic-layer option[value="'+v+'"]').disabled),
    null,{timeout:45000});
  await page.locator('#civic-layer').selectOption('schooldistricts');
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='32');
  assert.equal(await page.locator('#education-picker-field').isVisible(),true);
  assert.equal(await page.locator('#education-picker option').count(),33);
  assert.ok((await page.locator('#detail-intro').textContent()).includes('attendance zone'));
  await page.locator('#education-picker').selectOption('10');
  await page.locator('#detail-name').filter({hasText:'School District 10'}).waitFor();
  await page.waitForTimeout(550);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-school-district.png',fullPage:true});

  await page.locator('#civic-layer').selectOption('schools');
  await page.waitForFunction(expected=>
      Number(document.querySelector('#feature-count').textContent.replace(/,/g,''))===expected,
      educationManifest.nyc_school_count,{timeout:30000});
  assert.equal(await page.locator('#school-filter-field').isVisible(),true);
  assert.equal(await page.locator('#school-search-field').isVisible(),true);
  await page.locator('[data-borough="Bronx"]').click();
  await page.waitForFunction(expected=>Number(document.querySelector('#feature-count').textContent.replace(/,/g,''))===expected,
    educationManifest.borough_counts.Bronx);
  await page.locator('#school-type').selectOption('Public');
  await page.waitForFunction(expected=>Number(document.querySelector('#feature-count').textContent.replace(/,/g,''))===expected,
    bronxPublicCount);
  await page.locator('#school-search').fill(bronxPublicSchool.properties.id);
  await page.locator('#school-find').click();
  await page.locator('#detail-name').filter({hasText:bronxPublicSchool.properties.name}).waitFor();
  assert.ok((await page.locator('#detail-meta').textContent()).includes('Grade span'));
  await page.locator('#identify-board-center').click();
  await page.waitForFunction(()=>['board','boundary','joint_interest','outside'].includes(
    document.querySelector('#point-board-panel')?.dataset.lookupStatus));
  assert.equal(await page.locator('#detail-name').textContent(),bronxPublicSchool.properties.name,
    'School profile must survive independent map point community board lookup');
  await page.waitForFunction(()=>{
    const text=document.getElementById('school-pins-count')?.textContent||'';
    return /^[1-9][0-9]* school pins visible/.test(text);
  },null,{timeout:15000});
  await page.waitForTimeout(500);
  await page.screenshot({path:OUTPUT+'/nyc-pop-'+label+'-k12-school.png',fullPage:true});
  assert.ok(await page.locator('#map').isVisible());
  const widthCheck=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:innerWidth}));
  assert.ok(widthCheck.page<=widthCheck.viewport+2,'School mode must avoid horizontal overflow');

  await page.locator('#civic-layer').selectOption('nta');
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='50');
  assert.equal(await page.locator('#school-search-field').isVisible(),false);
  await page.locator('#reset').click();
  await page.waitForFunction(()=>document.getElementById('feature-count')?.textContent?.trim()==='262');
  assert.deepEqual(errors,[], 'Browser runtime JavaScript exceptions');
  console.log(JSON.stringify({viewport:label,viewportPx:viewport,featureCount:262,
    bronxCount:50,queensCount:82,landmarkCount:5,search:'Longwood',title,
    streetTiles:true,streetModeToggle:true,cityMask:true,mockedTiles:true,
    communityBoards:59,communityBoardSelected:'Bronx CB1',
    mapGridBoardLookup:true,schoolDistricts:32,k12SchoolPoints:educationManifest.nyc_school_count,
    exampleSchool:bronxPublicSchool.properties.id,noJSExceptions:true,measure:measured}));
  await context.close();
}

try {
  await checkViewport('desktop',{width:1440,height:900});
  await checkViewport('mobile',{width:390,height:844});
} finally {
  await browser.close();
}
