import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
import {COMMUNITY_LOCAL,COMMUNITY_REMOTE,BOARD_COUNTS,BOROUGH_PRESIDENTS,parseBoroCd,validateCommunityGeoJSON,indexCommunityDistricts,lookupCommunityDistrict,lookupPolygonAtPoint} from './civic.js';
import {SCHOOL_DISTRICTS_LOCAL,K12_SCHOOL_POINTS_LOCAL,validateSchoolDistricts,validateSchoolLocations,filterSchoolLocations} from './education.js';
import {ACS_FILE,ACS_LAYER_OPTIONS,validateACSDisplay,acsLayerMetric,acsLayerError,acsFill,dataLegend,formatACSValue,raceLabels} from './acs.js';
import {DISTRICT_KINDS,OFFICIAL_LEGISLATIVE_DIRS,validateDistrictGeoJSON,validateOfficialNames,makeDistrictLookup,identifyLegislators,officialForDistrict} from './representation.js';
import {ENROLLMENT_FILE,PARTY_OPTIONS,validateCouncilEnrollment,enrollmentShare,partyFill,partyLegend,enrollmentDetails} from './political.js';
const LOCAL_GEOJSON = 'data/nta2020.geojson';
const OFFICIAL_GEOJSON = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=5000';
// Tile access is for ordinary interactive viewing only; no prefetch or tile scraping.
// OpenStreetMap tile usage: https://operations.osmfoundation.org/policies/tiles/
const STREETS_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const NYC_BOUNDS = [[40.49,-74.27],[40.94,-73.68]];
const BOROUGH_COLORS = {Bronx:'#C7FF00',Brooklyn:'#FF3B9D',Manhattan:'#00D9FF',Queens:'#AF68FF','Staten Island':'#FF9A24'};
// Fixed landmark orientation markers are illustrative, not NTA demographic observations.
const LANDMARKS = [
  {borough:'Bronx',name:'Yankee Stadium',symbol:'⚾',coords:[40.82962,-73.92650]},
  {borough:'Brooklyn',name:'Coney Island Cyclone',symbol:'🎡',coords:[40.57450,-73.97772]},
  {borough:'Manhattan',name:'Empire State Building',symbol:'🏙️',coords:[40.74844,-73.98566]},
  {borough:'Queens',name:'The Unisphere',symbol:'🌐',coords:[40.74640,-73.84507]},
  {borough:'Staten Island',name:'St. George Ferry Terminal',symbol:'⛴️',coords:[40.64420,-74.07289]}
];
const LABEL_COORDS = {Bronx:[40.852,-73.876],Brooklyn:[40.657,-73.947],Manhattan:[40.787,-73.968],Queens:[40.733,-73.798],'Staten Island':[40.579,-74.145]};
// A bad or differently projected polygon must not zoom the map out to the world.
function plausibleNYCBounds(bounds){
  return bounds?.isValid() && bounds.getSouth() >= 40.30 && bounds.getNorth() <= 41.10 &&
    bounds.getWest() >= -74.60 && bounds.getEast() <= -73.40;
}
function fitNYCBounds(bounds, options={padding:[22,22]}){
  map.fitBounds(plausibleNYCBounds(bounds) ? bounds : NYC_BOUNDS, options);
}
const ui = Object.fromEntries(['civic-layer','political-metric','political-field','demographic-layer','demographic-field','education-picker-field','education-picker','school-filter-field','school-type','school-search-field','school-search','school-find','board-picker-field','community-board','borough','map-detail','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count','feature-label','profile-kicker','civic-context','borough-president'].map(id=>[id,document.getElementById(id)]));
let records=[], map, geoLayer, boroughLabels, landmarkLayer, streetTiles, outsideCityMask,
  selected=null, selectedCommunity=null, byCode=new Map(), communityBoards=[],
  communityByCode=new Map(), communityLayer=null,
  schoolDistricts=[],schoolDistrictByCode=new Map(),schoolDistrictLayer=null,
  schoolPoints=[],schoolById=new Map(),schoolMarkers=null,
  selectedSchool=null,selectedSchoolDistrict=null,
  communitySpatialIndex=null,schoolDistrictSpatialIndex=null,
  selectedMapPoint=null,selectedMapNeighborhood=null,mapPointMarker=null,
  acsLookup=new Map(),acsReady=false,
  legislativeLookup={},legislativeOfficials=null,
  councilEnrollment=new Map(),enrollmentReady=false,
  councilLayer=null,selectedCouncil=null;
function status(message,error=false){ui.status.textContent=message;ui.status.classList.toggle('error',error);}
function startMap(){
  if(!window.L) throw new Error('Leaflet failed to load. Check your network connection.');
  // Default view includes recognizable street and block grids; mask outside NYC.
  map=L.map('map',{zoomControl:false,scrollWheelZoom:false,zoomSnap:0.1,zoomDelta:0.5,minZoom:9,maxZoom:17,maxBounds:[[40.40,-74.40],[41.04,-73.50]],maxBoundsViscosity:1,preferCanvas:true}).fitBounds(NYC_BOUNDS);
  // Keep +/- clear of the large upper-left comic legend.
  L.control.zoom({position:'topright',zoomInTitle:'Zoom in',zoomOutTitle:'Zoom out'}).addTo(map);
  // Show an actual distance scale independently from +/-; keep it below the legend.
  L.control.scale({position:'bottomleft',metric:true,imperial:false,maxWidth:120}).addTo(map);
  const maskPane=map.createPane('cityMaskPane');
  maskPane.style.zIndex='350'; // Above street tiles (200), below neighborhood polygons (400).
  maskPane.style.pointerEvents='none';
}
async function download(url){const response=await fetch(url);if(!response.ok) throw new Error(`HTTP ${response.status}`);return response.json();}
async function loadGeography(){
  try { const source=await download(LOCAL_GEOJSON);return {source,location:'versioned local snapshot'}; }
  catch (_){ const source=await download(OFFICIAL_GEOJSON);return {source,location:'NYC Open Data (live development fallback)'}; }
}
function baseStyle(record){
  const layer=ui['demographic-layer'].value;
  const censusMode=acsReady&&layer!=='borough'&&ui['civic-layer'].value==='nta';
  const fill=censusMode?acsFill(acsLookup.get(record.code),layer):
    (BOROUGH_COLORS[record.borough] || '#cbd5dc');
  const streets=ui['map-detail'].value==='streets';
  // In ACS mode the colored data fills are legible over an actual street grid.
  // Missing/suppressed areas are gray; the original neon borough mode is unchanged.
  if(ui.borough.value==='all') return {
    color:'#241039',weight:streets?.8:.72,opacity:streets?.48:.9,
    fillColor:fill,fillOpacity:censusMode?(streets?.60:.94):(streets?.27:1)
  };
  return {
    color:'#241039',weight:streets?1.5:1.3,opacity:1,
    fillColor:censusMode?fill:(record.special?'#dee6ed':fill),
    fillOpacity:censusMode?(streets?.55:.94):(streets?.12:.96)
  };
}
function styleFor(record){
  if(selected===record) return {color:'#241039',weight:4,fillColor:'#FFFFFF',
    fillOpacity:ui['map-detail'].value==='streets'?.16:1};
  return baseStyle(record);
}
// Fill the viewport OUTSIDE the official NYC land polygons. A single custom
// canvas layer avoids Leaflet polygon clipping of a gigantic exterior ring;
// the old approach accidentally hid roads inside NYC rather than outside.
function createCityMatte(features){
 const CityMatte=L.Layer.extend({
  initialize(features){this._features=features;},
  onAdd(map){
    this._map=map;
    this._canvas=L.DomUtil.create('canvas','city-matte-canvas');
    this._canvas.style.pointerEvents='none';
    map.getPane('cityMaskPane').appendChild(this._canvas);
    map.on('moveend zoomend resize',this._draw,this);
    this._draw();
  },
  onRemove(map){
    map.off('moveend zoomend resize',this._draw,this);
    L.DomUtil.remove(this._canvas);
  },
  _draw(){
    const map=this._map, canvas=this._canvas;
    const size=map.getSize(),ratio=window.devicePixelRatio||1;
    canvas.width=Math.round(size.x*ratio);
    canvas.height=Math.round(size.y*ratio);
    canvas.style.width=size.x+'px';canvas.style.height=size.y+'px';
    L.DomUtil.setPosition(canvas,map.containerPointToLayerPoint([0,0]));
    const ctx=canvas.getContext('2d');
    if(!ctx)return;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    ctx.fillStyle='#e4faff';ctx.fillRect(0,0,size.x,size.y);
    // Clear a transparent window through the matte for every NYC polygon.
    // Each polygon's own rings are handled with even-odd fill to preserve holes.
    ctx.globalCompositeOperation='destination-out';
    ctx.fillStyle='#000';
    for(const feature of this._features){
      const g=feature.geometry;
      const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      for(const polygon of polygons){
        ctx.beginPath();
        for(const ring of polygon){
          if(!ring.length)continue;
          for(let i=0;i<ring.length;i++){
            const xy=map.latLngToContainerPoint([ring[i][1],ring[i][0]]);
            if(i===0)ctx.moveTo(xy.x,xy.y);else ctx.lineTo(xy.x,xy.y);
          }
          ctx.closePath();
        }
        ctx.fill('evenodd');
      }
    }
    ctx.globalCompositeOperation='source-over';
  }
 });
 return new CityMatte(features);
}
function initializeStreetMap(features){
  outsideCityMask=createCityMatte(features);
  streetTiles=L.tileLayer(STREETS_URL,{
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
    maxZoom:19,updateWhenIdle:true,keepBuffer:1
  });
  let errors=0;
  streetTiles.on('tileerror',()=>{
    if(++errors>=8 && ui['map-detail'].value==='streets'){
      ui['map-detail'].value='comic';
      setMapDetail('comic');
      status('Street tiles could not load. Switched to the neon map; official neighborhood boundaries still work.',true);
    }
  });
}
function setMapDetail(mode){
  if(mode==='streets'){
    // Add outside-city matte before showing tiles to avoid visible spillover.
    if(!map.hasLayer(outsideCityMask))outsideCityMask.addTo(map);
    if(!map.hasLayer(streetTiles))streetTiles.addTo(map);
  }else{
    if(map.hasLayer(streetTiles))map.removeLayer(streetTiles);
    if(map.hasLayer(outsideCityMask))map.removeLayer(outsideCityMask);
  }
  geoLayer.eachLayer(layer=>layer.setStyle(styleFor(byCode.get(layer.feature.properties.__ntaCode))));
  if(communityLayer)communityLayer.eachLayer(layer=>{
    const board=communityByCode.get(parseBoroCd(layer.feature)?.code);
    if(board)layer.setStyle(communityStyle(board));
  });
  if(schoolDistrictLayer)schoolDistrictLayer.eachLayer(layer=>{
    const entry=schoolDistrictByCode.get(Number(layer.feature?.properties?.district));
    if(entry)layer.setStyle(schoolDistrictStyle(entry));
  });
  document.getElementById('street-map-note').textContent=mode==='streets'
    ? 'Street and block grids: OpenStreetMap. Neon outlines: official NYC DCP 2020 NTAs.'
    : 'Neon-only view: official NYC DCP 2020 NTA geography.';
}
function writeMeta(pairs){
  ui['detail-meta'].replaceChildren();
  for(const [label,value] of pairs){
    const dt=document.createElement('dt');dt.textContent=label;
    const dd=document.createElement('dd');dd.textContent=value;
    ui['detail-meta'].append(dt,dd);
  }
}

const preservedBoroughLegend=document.querySelector('.map-key').innerHTML;
function updateACSLegend(){
  const container=document.querySelector('.map-key');
  const layer=ui['demographic-layer'].value;
  if(layer==='borough'||!acsReady||ui['civic-layer'].value!=='nta'){
    container.innerHTML=preservedBoroughLegend;
    return;
  }
  const legend=dataLegend(layer);
  const title=document.createElement('div');
  title.className='key-title';title.textContent=legend.title;
  container.replaceChildren(title);
  for(let i=0;i<legend.labels.length;i++){
    const item=document.createElement('div');
    item.className='acs-legend-item';
    const color=document.createElement('span');
    color.className='acs-legend-swatch';color.style.background=legend.colors[i];
    const label=document.createElement('span');
    label.textContent=legend.labels[i];
    item.append(color,label);container.append(item);
  }
  const noData=document.createElement('div');
  noData.className='acs-legend-item';
  const swatch=document.createElement('span');
  swatch.className='acs-legend-swatch';swatch.style.background='#cbd5d9';
  const label=document.createElement('span');
  label.textContent='No reliable data';noData.append(swatch,label);container.append(noData);
  const note=document.createElement('p');
  note.className='acs-legend-note';
  note.textContent=layer==='income'
    ?'2020–2024 ACS derived household-income bracket midpoint approximation, not published B19013. 2024 dollars.'
    :'2020–2024 ACS five-year derived tract aggregates. Gray = unavailable. Estimates have sampling error.';
  container.append(note);
}
function acsProfileRows(record){
  const stats=acsLookup.get(record?.code);
  if(!acsReady||!stats)return null;
  const rows=[
    ['Approx. household median income',formatACSValue(stats.median_household_income_grouped_approx_usd,'income')],
    ['Poverty rate',formatACSValue(stats.poverty_rate_pct,'poverty')],
  ];
  if(stats.poverty_rate_pct!=null&&stats.poverty_rate_moe_90_pp_conservative!=null){
    rows.push(['Poverty margin of error','±'+stats.poverty_rate_moe_90_pp_conservative.toFixed(1)+' percentage points (approx. 90%)']);
  }
  for(const [layer,group] of Object.entries(raceLabels())){
    const entry=stats.race_ethnicity?.[group];
    rows.push([group,entry
      ?entry.pct.toFixed(1)+'% (±'+entry.moe_pp_90_approx.toFixed(1)+' pp, approx. 90%)'
      :'Not available / insufficiently reliable']);
  }
  return {rows,stats};
}
function showACSProfile(record){
  const section=document.getElementById('acs-profile');
  const content=document.getElementById('acs-profile-content');
  const note=document.getElementById('acs-profile-note');
  const source=acsProfileRows(record);
  section.hidden=!source;
  if(!source){content.replaceChildren();return;}
  const list=document.createElement('dl');
  list.className='acs-profile-facts';
  for(const [name,value]of source.rows){
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=name;dd.textContent=value;list.append(dt,dd);
  }
  content.replaceChildren(list);
  note.textContent='Estimates derived from the 2020–2024 ACS five-year tract tables, aggregated to 2020 NTAs. Income uses grouped-bin interpolation, not a published ACS median; no valid median MOE. Margins of error are approximate. School district and community board boundaries differ.';
}
function addACSPopupInfo(root,neighborhood){
  const information=acsProfileRows(neighborhood);
  if(!information)return;
  const details=document.createElement('details');
  details.className='acs-popup-details';
  const summary=document.createElement('summary');
  summary.textContent='Neighborhood demographics · ACS 2020–2024';
  const facts=document.createElement('dl');
  facts.className='acs-popup-facts';
  for(const [label,value]of information.rows){
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=value;facts.append(dt,dd);
  }
  const note=document.createElement('p');
  note.className='acs-method-note';
  note.textContent='Approximate NTA estimates from tract aggregates. Income is a grouped-bin approximation, not the Census published median.';
  details.append(summary,facts,note);root.append(details);
}
async function loadACSGeography(){
  try{
    const source=await download(ACS_FILE);
    acsLookup=validateACSDisplay(source,new Set(records.map(r=>r.code)));
    acsReady=true;
    ui['demographic-layer'].disabled=false;
    document.getElementById('acs-source').textContent=
      '2020–2024 ACS five-year estimates derived from official 2020 Census tracts using NYC DCP 2020 NTA crosswalk. Income medians are grouped-bin approximations (not published B19013); 90% error ranges for rates are approximations. Special-purpose and unreliable estimates appear gray.';
    updateACSLegend();
    geoLayer.eachLayer(layer=>{
      const record=byCode.get(layer.feature.properties.__ntaCode);
      if(record)layer.setStyle(styleFor(record));
    });
    if(selected)showACSProfile(selected);
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
  }catch(error){
    console.warn('ACS derived neighborhood layer unavailable:',error);
    ui['demographic-layer'].disabled=true;
    acsReady=false;
    document.getElementById('acs-source').textContent=
      'ACS neighborhood estimates are temporarily unavailable; borough colors and official civic geography remain usable.';
  }
}
function closeMobileCivicCard(){
  map?.getContainer()?.querySelectorAll('.nyc-pop-mobile-overlay').forEach(el=>el.remove());
}
function resetMapPointLookup(){
  selectedMapPoint=null;selectedMapNeighborhood=null;
  if(map)map.closePopup();
  closeMobileCivicCard();
  if(mapPointMarker){map.removeLayer(mapPointMarker);mapPointMarker=null;}
  document.getElementById('point-board-result').textContent=
    'Click a street or place on the map to identify its community board from official 2026 boundaries.';
  document.getElementById('point-board-coordinates').textContent='';
  document.getElementById('point-board-panel').dataset.lookupStatus='idle';
}

function showCivicPopup(latlng,neighborhood,communityMatch){
  const root=document.createElement('div');
  root.className='nyc-pop-info-card';
  const eyebrow=document.createElement('div');
  eyebrow.className='nyc-pop-info-eyebrow';
  eyebrow.textContent='NYC POP! · NEIGHBORHOOD & CIVIC INFO';
  root.append(eyebrow);
  const title=document.createElement('h3');
  title.className='nyc-pop-info-title';
  title.textContent=neighborhood?.name||'Selected NYC location';
  root.append(title);
  if(neighborhood?.borough){
    const subtitle=document.createElement('p');
    subtitle.className='nyc-pop-info-subtitle';
    subtitle.textContent=neighborhood.borough+' · NYC';
    root.append(subtitle);
  }
  const facts=document.createElement('dl');
  facts.className='nyc-pop-info-facts';
  const row=(label,value)=>{
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=value;facts.append(dt,dd);
  };
  let boardBorough;
  if(communityMatch.status==='board'){
    row('Community board',communityMatch.record.name);
    boardBorough=communityMatch.record.borough;
  }else if(communityMatch.status==='joint_interest'){
    row('Community board','Joint Interest Area — no regular community board');
    boardBorough=communityMatch.record.borough;
  }else if(communityMatch.status==='boundary'){
    row('Community board','District boundary — confirm the exact address');
  }else if(communityMatch.status==='unavailable'){
    row('Community board','Official boundaries loading or unavailable');
  }else if(communityMatch.status==='outside'){
    row('Community board','No mapped community board at this point');
  }else{
    row('Community board','Location could not be checked');
  }
  const schoolDistrict=lookupPolygonAtPoint(schoolDistrictSpatialIndex,latlng.lat,latlng.lng);
  if(schoolDistrict.status==='match')
    row('School district','Geographic District '+schoolDistrict.record.code);
  else if(schoolDistrict.status==='boundary')
    row('School district','District boundary — verify address');
  else if(schoolDistrict.status==='unavailable')
    row('School district','District data loading or unavailable');
  else row('School district','No mapped geographic school district');
  const borough=neighborhood?.borough||boardBorough;
  if(borough&&BOROUGH_PRESIDENTS[borough])
    row('Borough president',BOROUGH_PRESIDENTS[borough]);
  // Legislative districts are independent 2026 DCP polygons, not an NTA
  // lookup. The official directory only assigns names when verified.
  const legislative=identifyLegislators(legislativeLookup,latlng.lat,latlng.lng);
  for(const key of ['council','senate','assembly','congress']){
    const matched=legislative[key];
    const label={council:'City Council representative',senate:'NY State Senator',
      assembly:'NY State Assembly district',congress:'US House district'}[key];
    if(matched.status==='match'){
      const code=matched.record.code;
      const official=officialForDistrict(legislativeOfficials,key,code);
      row(label,(official?official+' · ':'')+'District '+code+
        (key==='senate'&&!official?' · see official directory':''));
    }else if(matched.status==='boundary'){
      row(label,'District boundary — verify address');
    }else if(matched.status==='unavailable'){
      row(label,'Legislative district data loading / unavailable');
    }else{
      row(label,'No matched district at this location');
    }
  }
  root.append(facts);
  if(neighborhood)addACSPopupInfo(root,neighborhood);
  const links=document.createElement('div');
  links.className='nyc-pop-info-links';
  for(const [label,url] of [
    ['Community board contacts','https://www.nyc.gov/site/communityboards/index.page'],
    ['NYC City Council',OFFICIAL_LEGISLATIVE_DIRS.council],
    ['NY State Senate',OFFICIAL_LEGISLATIVE_DIRS.senate],
    ['NY State Assembly',OFFICIAL_LEGISLATIVE_DIRS.assembly],
    ['US House',OFFICIAL_LEGISLATIVE_DIRS.congress],
    ['Browse K–12 schools','https://www.myschools.nyc/en/']
  ]){
    const a=document.createElement('a');
    a.textContent=label;a.href=url;a.target='_blank';a.rel='noopener noreferrer';
    links.append(a);
  }
  root.append(links);
  const disclaimer=document.createElement('p');
  disclaimer.className='nyc-pop-info-disclaimer';
  disclaimer.textContent='All boundaries are assigned to this exact map point, not the entire neighborhood. Party enrollment is registration, not votes cast; attendance zones and enrollment rules are separate. Current officials should be confirmed in official directories.';
  root.append(disclaimer);
  // One card at a time. The phone version stays entirely *inside* the map
  // instead of allowing Leaflet's anchored popup to clip above its top edge.
  map.closePopup();
  closeMobileCivicCard();
  if(map.getSize().x<600){
    const overlay=document.createElement('section');
    overlay.className='nyc-pop-mobile-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-label','Neighborhood and civic information');
    const close=document.createElement('button');
    close.type='button';close.className='nyc-pop-mobile-close';
    close.textContent='×';close.setAttribute('aria-label','Close neighborhood information');
    close.addEventListener('click',()=>overlay.remove());
    overlay.append(close,root);
    L.DomEvent.disableClickPropagation(overlay);
    L.DomEvent.disableScrollPropagation(overlay);
    map.getContainer().append(overlay);
    return;
  }
  L.popup({className:'nyc-pop-info-popup',maxWidth:365,minWidth:245,
    maxHeight:Math.max(220,Math.min(390,map.getSize().y-100)),autoPan:true,
    autoPanPaddingTopLeft:[18,24],autoPanPaddingBottomRight:[18,26]})
    .setLatLng(latlng).setContent(root).openOn(map);
}
function identifyCommunityAtPoint(latlng,neighborhood=null){
  if(!latlng||!Number.isFinite(latlng.lat)||!Number.isFinite(latlng.lng))return;
  selectedMapPoint={lat:latlng.lat,lng:latlng.lng};
  selectedMapNeighborhood=neighborhood;
  if(mapPointMarker)map.removeLayer(mapPointMarker);
  mapPointMarker=L.marker(selectedMapPoint,{
    interactive:false,keyboard:false,zIndexOffset:500,
    icon:L.divIcon({className:'grid-map-click-marker',
      html:'<span class="grid-map-click-marker-symbol" aria-hidden="true">✚</span>',
      iconSize:[32,32],iconAnchor:[16,16]})
  }).addTo(map);
  document.getElementById('point-board-coordinates').textContent=
    'Selected map point: '+latlng.lat.toFixed(5)+'°, '+latlng.lng.toFixed(5)+'°';
  const match=lookupCommunityDistrict(communitySpatialIndex,latlng.lat,latlng.lng);
  const panel=document.getElementById('point-board-panel'),output=document.getElementById('point-board-result');
  panel.dataset.lookupStatus=match.status;
  if(match.status==='board'){
    output.textContent=match.record.name+' (BoroCD '+match.record.code+'). This location falls within its mapped 2026 community district.';
  }else if(match.status==='joint_interest'){
    output.textContent=match.record.name+' (BoroCD '+match.record.code+
      '). This is an official Joint Interest Area, not an ordinary residential community board.';
  }else if(match.status==='boundary'){
    const names=match.candidates.map(x=>x.name).join(' / ');
    output.textContent='This point is on a mapped district boundary'+
      (names?': '+names:'')+'. Verify the exact address with the NYC community board directory; no single board is assigned here.';
  }else if(match.status==='outside'){
    output.textContent='No community district polygon covers the selected point. It may be water or outside mapped NYC community districts.';
  }else if(match.status==='unavailable'){
    output.textContent='Community board boundaries are still loading or unavailable. The map will recheck this point if official geography loads.';
  }else{
    output.textContent='This map location cannot be checked. Select a valid point in NYC.';
  }
  showCivicPopup(latlng,neighborhood,match);
}
function updateCivicContext(borough, board=null){
  ui['borough-president'].textContent=borough?BOROUGH_PRESIDENTS[borough]:'Select a borough';
  ui['civic-context'].textContent=board
    ? board.name+' serves the mapped community district. Community board membership and meeting information are maintained in the official NYC directory. Council and state legislative districts have separate boundaries.'
    : borough
      ? 'Borough-wide executive: '+borough+'. Use the official directories below to locate the district-specific Council member, State Senator and Assembly member. Neighborhoods may cross their district lines.'
      : 'NYC has 59 community boards. Select the Community boards map layer to explore their actual boundaries; use official lookup directories to confirm elected representatives by address.';
}
function overviewProfile(){
  ui['profile-kicker'].textContent='NEIGHBORHOOD PROFILE';
  ui['detail-name'].textContent='Explore the five boroughs';
  ui['detail-intro'].textContent='Pick a neon borough, tap a landmark icon, or use the search to explore official NYC neighborhood areas.';
  writeMeta([['Geographic coverage','New York City'],['Boroughs','5'],['2020 NTAs',String(records.length)]]);
  updateCivicContext(null);
}
function boroughProfile(borough){
  const local=filterNtas(records,borough);
  ui['profile-kicker'].textContent='BOROUGH PROFILE';
  ui['detail-name'].textContent=borough;
  ui['detail-intro'].textContent='Tap any neighborhood for its profile. The landmark icon helps orient your view; gray areas are special-purpose NTAs.';
  writeMeta([['Borough',borough],['2020 NTAs',String(local.length)],['Special-purpose areas',String(local.filter(r=>r.special).length)]]);
  updateCivicContext(borough);
}
function switchBorough(borough){
  resetMapPointLookup();
  selected=null;selectedCommunity=null;selectedSchoolDistrict=null;selectedSchool=null;
  ui.borough.value=borough;ui.neighborhood.value='';
  render();
  const layerName=ui['civic-layer'].value==='boards'?'community boards':'neighborhoods';
  status(borough==='all'?'Showing all five NYC boroughs and their '+layerName+'.':'Exploring '+borough+' '+layerName+'.');
}
function display(record,zoom=true){
  if(ui.borough.value!==record.borough){ui.borough.value=record.borough;render();}
  selected=record;
  ui['profile-kicker'].textContent='NEIGHBORHOOD PROFILE';
  ui['detail-name'].textContent=record.name;
  ui['detail-intro'].textContent=record.special?'Official special-purpose area; residential ACS statistics may not be meaningful.':'NYC Planning 2020 neighborhood geography. ACS 2020–2024 derived demographic estimates are shown when source quality allows; election results remain pending.';
  writeMeta([['Borough',record.borough],['Area type',record.special?'Special-purpose area':'Neighborhood']]);
  showACSProfile(record);
  updateCivicContext(record.borough);
  geoLayer.eachLayer(layer=>{
    const r=byCode.get(layer.feature.properties.__ntaCode);
    layer.setStyle(styleFor(r));
  });
  const layer=geoLayer.getLayers().find(x=>x.feature.properties.__ntaCode===record.code);
  if(layer){layer.bringToFront();if(zoom)fitNYCBounds(layer.getBounds(),{padding:[48,48],maxZoom:14});}
}
// Community Board boundaries (DCP 2026) have an independent source and are NOT NTA matches.
function communityStyle(board){
  const selectedHere=selectedCommunity?.code===board.code;
  const streets=ui['map-detail'].value==='streets';
  return {color:selectedHere?'#ffffff':'#241039',
    weight:selectedHere?4.5:2.3,
    opacity:1,
    fillColor:BOROUGH_COLORS[board.borough],
    fillOpacity:streets?(selectedHere?.3:.20):(selectedHere?.85:.7)};
}
function boardOverview(borough){
  ui['profile-kicker'].textContent='COMMUNITY BOARDS · NYC PLANNING 2026';
  const count=borough==='all'?communityBoards.length:communityBoards.filter(x=>x.borough===borough).length;
  ui['detail-name'].textContent=borough==='all'?'NYC Community Boards':borough+' Community Boards';
  ui['detail-intro'].textContent='Select a boundary for the community board number and official government contact directory. These 2026 boundaries are distinct from 2020 NTA geography.';
  writeMeta([['Community boards',String(count)],['Boundary release','NYC DCP 26b · May 2026'],['Source ID','5crt-au7u'],['Special areas','12 citywide Joint Interest Areas are not community boards']]);
  updateCivicContext(borough==='all'?null:borough);
}
function boardProfile(board){
  ui['profile-kicker'].textContent='OFFICIAL COMMUNITY DISTRICT';
  ui['detail-name'].textContent=board.name;
  ui['detail-intro'].textContent='This is a 2026 community district boundary, not a 2020 NTA or an elected legislative district. Visit the official community board directory for members, meetings and district contacts.';
  writeMeta([['Borough',board.borough],['Community board','Board '+board.number],['BoroCD',String(board.code)],['Geography','NYC DCP 2026 · 26b'],['Other districts','City Council and state legislative districts may cross this board']]);
  updateCivicContext(board.borough,board);
}
function focusCommunityBoard(bounds){
  map.stop();
  fitNYCBounds(bounds,{padding:[25,25],maxZoom:14,animate:false});
  // Small screens otherwise squeeze irregular board shapes into an unreadable speck.
  // The visitor can pan/zoom to inspect the full official boundary.
  if(map.getSize().x<500 && map.getZoom()<12.2){
    map.setView(bounds.getCenter(),12.2,{animate:false});
  }
}
function showCommunityBoard(board){
  selected=null;
  selectedCommunity=board;
  if(ui.borough.value!==board.borough){
    ui.borough.value=board.borough;
    render();
  }else{
    boardProfile(board);
    ui['community-board'].value=String(board.code);
    communityLayer.eachLayer(layer=>{
      const r=communityByCode.get(parseBoroCd(layer.feature)?.code);
      if(r)layer.setStyle(communityStyle(r));
    });
  }
  const featureLayer=communityLayer.getLayers().find(layer=>parseBoroCd(layer.feature)?.code===board.code);
  if(featureLayer){featureLayer.bringToFront();focusCommunityBoard(featureLayer.getBounds());}
  status('Selected '+board.name+'. Verify current board contacts in the NYC directory; elected officials use separate boundaries.');
}
async function loadCommunityGeography(){
  try{
    let source, origin;
    try{source=await download(COMMUNITY_LOCAL);origin='pinned 2026 DCP snapshot';}
    catch(_){source=await download(COMMUNITY_REMOTE);origin='NYC Open Data live fallback';}
    const valid=validateCommunityGeoJSON(source);
    communitySpatialIndex=indexCommunityDistricts([...valid.boards,...valid.jointInterest]);
    communityBoards=valid.boards;
    communityByCode=new Map(communityBoards.map(b=>[b.code,b]));
    communityLayer=L.geoJSON(null,{
      style:feature=>communityStyle(communityByCode.get(parseBoroCd(feature)?.code)),
      onEachFeature:(feature,layer)=>{
        const board=communityByCode.get(parseBoroCd(feature)?.code);
        layer.bindTooltip(board.name+' · official 2026 district',{sticky:true,direction:'top'});
        layer.on('click',()=>showCommunityBoard(board));
        layer.on('mouseover',()=>{if(selectedCommunity?.code!==board.code)layer.setStyle({weight:4,color:'#241039'});});
        layer.on('mouseout',()=>layer.setStyle(communityStyle(board)));
      }
    });
    ui['civic-layer'].disabled=false;
    ui['civic-layer'].title='Choose 2020 NTAs or 59 verified 2026 community boards ('+origin+')';
    document.getElementById('civic-source').textContent='Community districts: DCP 2026, 59 boards + 12 non-board special areas. '+origin+'.';
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
  }catch(error){
    console.warn('Community board geography unavailable:',error);
    const option=ui['civic-layer'].querySelector('option[value="boards"]');
    if(option)option.disabled=true;
    ui['civic-layer'].disabled=false;
    document.getElementById('civic-source').textContent='Community board boundary map temporarily unavailable; official civic directories remain accessible.';
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
  }
}
function schoolDistrictStyle(district){
  const active=selectedSchoolDistrict?.code===district.code;
  const streets=ui['map-detail'].value==='streets';
  const fill=Object.values(BOROUGH_COLORS)[district.code%5];
  return {color:active?'#241039':'#472474',weight:active?4:1.7,opacity:1,
    fillColor:active?'#C7FF00':fill,fillOpacity:streets?(active?.23:.11):(active?.72:.48)};
}
function schoolDistrictOverview(){
  ui['profile-kicker'].textContent='NYC SCHOOL DISTRICT BOUNDARIES · 2026';
  ui['detail-name'].textContent='32 NYC School Districts';
  ui['detail-intro'].textContent='Explore community school-district boundaries from NYC Planning. These administrative districts do not establish a child’s attendance zone or school assignment.';
  writeMeta([['Geographic school districts','32'],['Source','NYC DCP 26b · May 2026'],['School zoning','Separate elementary and middle school zones'],['Special programs','Districts 75, 79 and charter programs may operate citywide']]);
  updateCivicContext(ui.borough.value==='all'?null:ui.borough.value);
}
function schoolDistrictProfile(entry){
  ui['profile-kicker'].textContent='SCHOOL DISTRICT · NYC PLANNING';
  ui['detail-name'].textContent='School District '+entry.code;
  ui['detail-intro'].textContent='This is an administrative school district. It is not an individual school attendance zone. Confirm zoned schools and enrollment eligibility using NYCPS MySchools.';
  writeMeta([['Geographic district',String(entry.code)],['Boundary vintage','NYC DCP 26b · May 2026'],['Boundary authority','Department of City Planning'],['Admissions','Check actual address in MySchools']]);
  updateCivicContext(null);
}
function selectSchoolDistrict(entry){
  selectedSchoolDistrict=entry;selected=null;selectedCommunity=null;selectedSchool=null;
  schoolDistrictProfile(entry);
  schoolDistrictLayer.eachLayer(layer=>{
    const match=schoolDistrictByCode.get(Number(layer.feature.properties.district));
    if(match)layer.setStyle(schoolDistrictStyle(match));
  });
  const layer=schoolDistrictLayer.getLayers().find(l=>Number(l.feature.properties.district)===entry.code);
  if(layer){layer.bringToFront();fitNYCBounds(layer.getBounds(),{padding:[35,35],maxZoom:13,animate:false});}
  ui['education-picker'].value=String(entry.code);
  status('Showing NYC school district '+entry.code+'. School attendance zones are a separate geography.');
}
function schoolOverview(){
  const visible=filterSchoolLocations(schoolPoints,ui.borough.value,ui['school-type'].value,'');
  ui['profile-kicker'].textContent='K–12 SCHOOL LOCATIONS · NYSED GIS';
  ui['detail-name'].textContent=ui.borough.value==='all'?'NYC K–12 Schools':ui.borough.value+' K–12 Schools';
  ui['detail-intro'].textContent='School sites appear as pins when you zoom in, or search by school name or NYSED ID. This dataset includes public, charter and nonpublic schools; listed grades and current admission eligibility require NYCPS confirmation.';
  writeMeta([['Matching NYC school sites',String(visible.length)],['Source','NYS Education Department / NYS GIS'],['School grades','Not verified from this point dataset'],['School assignment','Not determined by proximity or school-district polygon']]);
  updateCivicContext(ui.borough.value==='all'?null:ui.borough.value);
}
function schoolProfile(school){
  ui['profile-kicker'].textContent='K–12 SCHOOL LOCATION · NYSED';
  ui['detail-name'].textContent=school.name;
  ui['detail-intro'].textContent='Mapped NYSED school point (not an admissions guarantee). Verify current operating status, program grades and admission details with the school or NYCPS directory.';
  writeMeta([['NYSED institution ID',school.id],['Borough',school.borough],
    ['Location',[school.street,school.city,school.zip].filter(Boolean).join(', ')||'Address unavailable'],
    ['Category',school.type],['NYSED classification',school.sourceClass||'Not specified'],['Grade span','Not available in mapped source']]);
  updateCivicContext(school.borough);
}
function selectSchool(school){
  selectedSchool=school;selectedSchoolDistrict=null;selectedCommunity=null;selected=null;
  if(ui.borough.value!=='all'&&ui.borough.value!==school.borough){
    ui.borough.value=school.borough;
  }
  schoolProfile(school);
  map.stop();map.setView(school.coordinates,15,{animate:false});
  refreshSchoolPins();
  status('Mapped '+school.name+' ('+school.borough+'). See NYCPS for grade levels, programs and admissions.');
}
function refreshSchoolPins(){
  if(!schoolMarkers)return;
  schoolMarkers.clearLayers();
  const note=document.getElementById('school-pins-count');
  if(ui['civic-layer'].value!=='schools')return;
  if(map.getZoom()<12.2){
    if(note)note.textContent='Zoom in to display school site pins; locations do not indicate school admission zones.';
    return;
  }
  const bounds=map.getBounds().pad(.13);
  const matches=filterSchoolLocations(schoolPoints,ui.borough.value,ui['school-type'].value,'')
    .filter(s=>bounds.contains(s.coordinates));
  for(const school of matches){
    const active=selectedSchool?.id===school.id;
    const marker=L.circleMarker(school.coordinates,{radius:active?10:6,weight:active?3:1.8,
      color:'#241039',fillColor:active?'#FFFFFF':(school.type==='Charter'?'#FF3B9D':school.type==='Nonpublic'?'#AF68FF':'#00D9FF'),
      fillOpacity:1,keyboard:true});
    marker.bindTooltip(school.name+' · '+school.type,{sticky:true,direction:'top'});
    marker.on('click',()=>selectSchool(school));
    marker.addTo(schoolMarkers);
  }
  if(note)note.textContent=matches.length+' school pins visible in this view. School location does not establish attendance-zone eligibility.';
}
function findSchool(){
  const q=ui['school-search'].value.trim();
  if(q.length<2){status('Enter at least two characters of a school name or an NYSED institution ID.',true);return;}
  const possible=filterSchoolLocations(schoolPoints,ui.borough.value,ui['school-type'].value,q);
  if(!possible.length){status('No matching K–12 school in the selected borough and type filter. Try a shorter name or All schools.',true);return;}
  const exact=possible.filter(s=>s.name.toLowerCase()===q.toLowerCase()||s.id===q);
  const candidates=exact.length?exact:possible;
  if(candidates.length!==1){
    status(candidates.length+' schools match. Add more of the name or enter the NYSED institution ID to identify one.',true);return;
  }
  selectSchool(candidates[0]);
}
async function loadLegislativeDistricts(){
  try{
    const [manifest,official]=await Promise.all([
      download('data/legislative/validation-2026.json'),
      download('data/legislative/officials-verified-2026-10-31.json')]);
    legislativeOfficials=validateOfficialNames(official);
    const rows=await Promise.all(Object.keys(DISTRICT_KINDS).map(async key=>{
      const source=await download(DISTRICT_KINDS[key].file);
      const records=validateDistrictGeoJSON(key,source,manifest);
      return [key,{records,index:makeDistrictLookup(records)}];
    }));
    legislativeLookup=Object.fromEntries(rows);
    document.getElementById('representation-source').textContent=
      'Official 2026 DCP Council, Senate, Assembly and congressional polygons verified; City Council and NY Senate officeholder names checked on October 31, 2026.';
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
    if(enrollmentReady){
      initializeCouncilMap();
      if(ui['civic-layer'].value==='enrollment')render();
    }
  }catch(error){
    console.warn('Legislative DCP boundary validation unavailable:',error);
    document.getElementById('representation-source').textContent=
      'Legislative district source temporarily unavailable. Use the official representative directory links.';
  }
}
async function loadCouncilEnrollment(){
  try{
    const data=await download(ENROLLMENT_FILE);
    councilEnrollment=validateCouncilEnrollment(data);
    enrollmentReady=true;
    document.getElementById('party-source').textContent=
      'Voter party enrollment: NYC Board of Elections Council District Summary Report as of February 20, 2026. Data include active and inactive registrants, and are not election results.';
    if(legislativeLookup.council)initializeCouncilMap();
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
  }catch(error){
    console.warn('Official BOE party enrollment unavailable:',error);
    document.getElementById('party-source').textContent=
      'BOE party enrollment is unavailable; political party conclusions are not inferred from demographics or election results.';
  }
}
async function loadEducationGeography(){
  let districtsOK=false,schoolsOK=false;
  try{
    const source=await download(SCHOOL_DISTRICTS_LOCAL);
    schoolDistricts=validateSchoolDistricts(source);
    schoolDistrictByCode=new Map(schoolDistricts.map(x=>[x.code,x]));
    schoolDistrictSpatialIndex=indexCommunityDistricts(schoolDistricts);
    if(selectedMapPoint)identifyCommunityAtPoint(selectedMapPoint,selectedMapNeighborhood);
    schoolDistrictLayer=L.geoJSON(null,{
      style:f=>schoolDistrictStyle(schoolDistrictByCode.get(Number(f.properties.district))),
      onEachFeature:(f,layer)=>{
        const entry=schoolDistrictByCode.get(Number(f.properties.district));
        layer.bindTooltip('NYC School District '+entry.code,{sticky:true});
        layer.on('click',()=>selectSchoolDistrict(entry));
      }
    });
    ui['civic-layer'].querySelector('[value="schooldistricts"]').disabled=false;
    districtsOK=true;
  }catch(e){console.warn('School district map remains unavailable:',e);}
  try{
    const [source,manifest]=await Promise.all([
      download(K12_SCHOOL_POINTS_LOCAL),download('data/schools/validation-2026.json')]);
    schoolPoints=validateSchoolLocations(source,manifest);
    schoolById=new Map(schoolPoints.map(s=>[s.id,s]));
    schoolMarkers=L.layerGroup().addTo(map);
    ui['civic-layer'].querySelector('[value="schools"]').disabled=false;
    schoolsOK=true;
  }catch(e){console.warn('NYSED school point map remains unavailable:',e);}
  document.getElementById('education-source').textContent=
    'NYC DCP school district polygons '+(districtsOK?'verified (2026)':'unavailable')+
    '; NYSED K–12 school point locations '+(schoolsOK?'verified ('+schoolPoints.length+' records)':'unavailable')+
    '. Administrative boundaries are not attendance zones. Confirm Fall 2026 grades/admissions with NYCPS.';
}
function render(){
  const borough=ui.borough.value,mode=ui['civic-layer'].value;
  ui['demographic-field'].hidden=mode!=='nta';
  updateACSLegend();
  document.getElementById('acs-profile').hidden=mode!=='nta'||!selected||!acsReady;
  const visible=filterNtas(records,borough);
  const boardMode=mode==='boards'&&!!communityLayer;
  const districtMode=mode==='schooldistricts'&&!!schoolDistrictLayer;
  const schoolMode=mode==='schools'&&!!schoolMarkers;
  const visibleBoards=communityBoards.filter(b=>borough==='all'||b.borough===borough);
  const visibleSchools=filterSchoolLocations(schoolPoints,borough,ui['school-type'].value,'');

  // Show only the controls that apply to this independently sourced geography.
  ui['board-picker-field'].hidden=!boardMode;
  ui['community-board'].disabled=!boardMode;
  ui['community-board'].replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent='Select a community board';
  ui['community-board'].append(placeholder);
  if(boardMode){
    for(const board of visibleBoards.slice().sort((a,b)=>a.borough.localeCompare(b.borough)||a.number-b.number)){
      const option=document.createElement('option');
      option.value=String(board.code);option.textContent=board.name;
      ui['community-board'].append(option);
    }
    if(selectedCommunity)ui['community-board'].value=String(selectedCommunity.code);
  }
  ui['education-picker-field'].hidden=!districtMode;
  ui['education-picker'].disabled=!districtMode;
  ui['education-picker'].replaceChildren();
  const schoolPlaceholder=document.createElement('option');
  schoolPlaceholder.value='';schoolPlaceholder.textContent='Select a school district';
  ui['education-picker'].append(schoolPlaceholder);
  if(districtMode){
    for(const entry of schoolDistricts){
      const o=document.createElement('option');
      o.value=String(entry.code);o.textContent='School District '+entry.code;
      ui['education-picker'].append(o);
    }
    if(selectedSchoolDistrict)ui['education-picker'].value=String(selectedSchoolDistrict.code);
  }
  ui['school-filter-field'].hidden=!schoolMode;
  ui['school-search-field'].hidden=!schoolMode;
  document.getElementById('school-pins-count').hidden=!schoolMode;
  ui['school-type'].disabled=!schoolMode;
  ui['school-search'].disabled=!schoolMode;
  ui['school-find'].disabled=!schoolMode;

  // Preserve the 2020 NTA source and its search when exploring neighborhoods.
  geoLayer.clearLayers();
  geoLayer.addData({type:'FeatureCollection',features:visible.map(r=>r.feature)});
  ui['nta-options'].replaceChildren();
  for(const r of visible.slice().sort((a,b)=>a.name.localeCompare(b.name))){
    const option=document.createElement('option');
    option.value=r.name;
    ui['nta-options'].append(option);
  }
  ui.neighborhood.disabled=mode!=='nta';
  ui['search-button'].disabled=mode!=='nta';
  ui.neighborhood.placeholder=mode==='nta'?'Search e.g. Harlem, Astoria, Longwood':
    'Return to Neighborhoods to search a 2020 NTA';

  // Switch actual polygon layers, without pretending their boundaries coincide.
  if(boardMode){
    if(map.hasLayer(geoLayer))map.removeLayer(geoLayer);
    if(schoolDistrictLayer&&map.hasLayer(schoolDistrictLayer))map.removeLayer(schoolDistrictLayer);
    communityLayer.clearLayers();
    communityLayer.addData({type:'FeatureCollection',features:visibleBoards.map(b=>b.feature)});
    if(!map.hasLayer(communityLayer))communityLayer.addTo(map);
  }else if(districtMode){
    if(map.hasLayer(geoLayer))map.removeLayer(geoLayer);
    if(communityLayer&&map.hasLayer(communityLayer))map.removeLayer(communityLayer);
    schoolDistrictLayer.clearLayers();
    schoolDistrictLayer.addData({type:'FeatureCollection',features:schoolDistricts.map(d=>d.feature)});
    if(!map.hasLayer(schoolDistrictLayer))schoolDistrictLayer.addTo(map);
  }else{
    if(communityLayer&&map.hasLayer(communityLayer))map.removeLayer(communityLayer);
    if(schoolDistrictLayer&&map.hasLayer(schoolDistrictLayer))map.removeLayer(schoolDistrictLayer);
    if(!map.hasLayer(geoLayer))geoLayer.addTo(map);
  }
  if(schoolMode&&schoolMarkers&&!map.hasLayer(schoolMarkers))schoolMarkers.addTo(map);
  if(!schoolMode&&schoolMarkers&&map.hasLayer(schoolMarkers))map.removeLayer(schoolMarkers);

  const total=boardMode?visibleBoards.length:districtMode?schoolDistricts.length:
    schoolMode?visibleSchools.length:visible.length;
  ui['feature-count'].textContent=total.toLocaleString();
  ui['feature-label'].textContent=boardMode?'community boards in selected borough filter':
    districtMode?'geographic NYC school districts (citywide)':
    schoolMode?'K–12 school location records matching selected filters':
    'NTAs in selected borough filter';

  if(borough==='all'&&!schoolMode&&!districtMode){
    if(!map.hasLayer(boroughLabels))boroughLabels.addTo(map);
  }else if(map.hasLayer(boroughLabels))map.removeLayer(boroughLabels);
  landmarkLayer.clearLayers();
  if(!schoolMode){
    for(const landmark of LANDMARKS){
      if(borough!=='all'&&borough!==landmark.borough)continue;
      const icon=L.divIcon({
        className:'comic-landmark',
        html:'<span class="comic-landmark-inner" aria-hidden="true">'+landmark.symbol+'</span>',
        iconSize:[42,42],iconAnchor:[21,21]
      });
      const marker=L.marker(landmark.coords,{icon,keyboard:true,
        title:landmark.name+', '+landmark.borough,alt:landmark.name}).addTo(landmarkLayer);
      marker.bindTooltip(landmark.name+' · '+landmark.borough,
        {direction:'top',offset:[0,-21],className:'comic-tooltip'});
      marker.on('click',()=>{
        if(ui.borough.value==='all')switchBorough(landmark.borough);
        status(landmark.name+' is in '+landmark.borough+'. Explore the selected geography layer.');
      });
    }
  }
  for(const button of document.querySelectorAll('[data-borough]')){
    const active=button.dataset.borough===borough;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  if(selected&&!visible.includes(selected))selected=null;
  if(selectedCommunity&&!visibleBoards.includes(selectedCommunity))selectedCommunity=null;
  if(selectedSchool&&!visibleSchools.includes(selectedSchool))selectedSchool=null;

  if(boardMode){
    selectedCommunity?boardProfile(selectedCommunity):boardOverview(borough);
    if(visibleBoards.length){
      const target=selectedCommunity?
        communityLayer.getLayers().find(x=>parseBoroCd(x.feature)?.code===selectedCommunity.code):null;
      if(target)focusCommunityBoard(target.getBounds());
      else fitNYCBounds(communityLayer.getBounds(),{padding:[35,35],animate:false});
    }
  }else if(districtMode){
    selectedSchoolDistrict?schoolDistrictProfile(selectedSchoolDistrict):schoolDistrictOverview();
    const target=selectedSchoolDistrict?
      schoolDistrictLayer.getLayers().find(x=>Number(x.feature.properties.district)===selectedSchoolDistrict.code):null;
    if(target)fitNYCBounds(target.getBounds(),{padding:[35,35],maxZoom:13,animate:false});
    else if(visible.length)fitNYCBounds(geoLayer.getBounds(),{padding:[35,35],animate:false});
  }else if(schoolMode){
    selectedSchool?schoolProfile(selectedSchool):schoolOverview();
    if(selectedSchool)map.setView(selectedSchool.coordinates,15,{animate:false});
    else if(visible.length)fitNYCBounds(geoLayer.getBounds(),{padding:[35,35],animate:false});
    refreshSchoolPins();
  }else{
    if(!selected)(borough==='all'?overviewProfile():boroughProfile(borough));
    if(selected)showACSProfile(selected);
    if(visible.length)fitNYCBounds(geoLayer.getBounds(),{padding:[35,35]});
  }
}
function search(){const found=findNta(records,ui.neighborhood.value,ui.borough.value);if(found){display(found);status('Selected '+found.name+', '+found.borough+'. Click any street in the neighborhood to view its community board.');}else{status('No matching neighborhood in the selected borough. Try another spelling or clear the borough filter.',true);}}
function wire(){
  for(const b of BOROUGHS){const o=document.createElement('option');o.value=b;o.textContent=b;ui.borough.append(o);}
  for(const id of ['borough','map-detail','neighborhood','search-button','reset'])ui[id].disabled=false;
  ui['map-detail'].addEventListener('change',()=>setMapDetail(ui['map-detail'].value));
  ui['demographic-layer'].addEventListener('change',()=>{
    if(!acsReady)return;
    updateACSLegend();
    geoLayer.eachLayer(layer=>{
      const item=byCode.get(layer.feature.properties.__ntaCode);
      if(item)layer.setStyle(styleFor(item));
    });
    if(selected)showACSProfile(selected);
    status('Viewing '+ACS_LAYER_OPTIONS[ui['demographic-layer'].value].label+'. Gray areas have missing or unreliable ACS estimates.');
  });
  ui['community-board'].addEventListener('change',()=>{
    const found=communityByCode.get(Number(ui['community-board'].value));
    if(found)showCommunityBoard(found);
  });
  ui['education-picker'].addEventListener('change',()=>{
    const found=schoolDistrictByCode.get(Number(ui['education-picker'].value));
    if(found)selectSchoolDistrict(found);
  });
  ui['school-type'].addEventListener('change',()=>{
    selectedSchool=null;
    render();
  });
  ui['school-find'].addEventListener('click',findSchool);
  ui['school-search'].addEventListener('keydown',event=>{
    if(event.key==='Enter'){event.preventDefault();findSchool();}
  });
  map.on('moveend zoomend',refreshSchoolPins);
  // A street-grid click identifies the actual point; never infer board from NTA.
  // Leaflet path clicks bubble to the map, so profiles and this independent
  // civic lookup can be shown together.
  map.on('click',event=>identifyCommunityAtPoint(event.latlng));
  document.getElementById('identify-board-center').disabled=false;
  document.getElementById('identify-board-center').addEventListener('click',()=>{
    identifyCommunityAtPoint(map.getCenter());
  });
  ui['civic-layer'].addEventListener('change',()=>{
    resetMapPointLookup();
    selected=null;selectedCommunity=null;ui.neighborhood.value='';
    render();
    const mode=ui['civic-layer'].value;
    status(mode==='boards'?'Showing official NYC community boards (2026).':
      mode==='schooldistricts'?'Showing the 32 NYC geographic school districts, not attendance zones.':
      mode==='schools'?'Showing NYSED K–12 school locations. Zoom in for pins or search by school name.':
      'Showing official NYC 2020 Neighborhood Tabulation Areas.');
  });
  ui.borough.addEventListener('change',()=>switchBorough(ui.borough.value));
  ui['search-button'].addEventListener('click',search);
  ui.neighborhood.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  ui.reset.addEventListener('click',()=>switchBorough('all'));
  for(const button of document.querySelectorAll('[data-borough]')){
    button.addEventListener('click',()=>switchBorough(button.dataset.borough));
  }
}
async function init(){
  try{
    startMap();
    const {source,location}=await loadGeography();records=validNtas(source);
    if(records.length!==262) status(`Boundary dataset contains ${records.length} NTAs; expected 262. Verify the source version before publication.`,true);
    byCode=new Map(records.map(r=>[r.code,r]));
    for(const r of records) r.feature.properties.__ntaCode=r.code;
    geoLayer=L.geoJSON(null,{bubblingMouseEvents:false,style:feature=>baseStyle(byCode.get(feature.properties.__ntaCode)),onEachFeature:(feature,layer)=>{
      const r=byCode.get(feature.properties.__ntaCode);
      layer.bindTooltip(`${r.name} · ${r.borough}`,{sticky:true,direction:'top'});
      layer.on('click',event=>{
        // The clicked point, not the NTA centroid, determines the board.
        // A single NTA can cross more than one board or school district.
        if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);
        if(ui.borough.value==='all')switchBorough(r.borough);
        display(r,false);
        identifyCommunityAtPoint(event.latlng,r);
        status('Showing neighborhood and civic information for '+r.name+', '+r.borough+'.');
      });
      layer.on('mouseover',()=>{if(ui.borough.value!=='all'&&selected!==r)layer.setStyle({weight:3,color:'#241039'});});
      layer.on('mouseout',()=>{if(selected!==r)layer.setStyle(baseStyle(r));});
    }}).addTo(map);
    boroughLabels=L.layerGroup();
    landmarkLayer=L.layerGroup().addTo(map);
    for(const [borough,point] of Object.entries(LABEL_COORDS)){
      const icon=L.divIcon({className:'borough-label',html:'<span>'+borough+'</span>',iconSize:[146,42],iconAnchor:[73,21]});
      L.marker(point,{icon,keyboard:true,title:'Explore '+borough}).on('click',()=>switchBorough(borough)).addTo(boroughLabels);
    }
    initializeStreetMap(records.map(r=>r.feature));
    wire();render();
    setMapDetail(ui['map-detail'].value);
    void loadCommunityGeography();
    void loadEducationGeography();
    void loadACSGeography();
    void loadLegislativeDistricts();
    void loadCouncilEnrollment();
    if(geoLayer.getLayers().length !== records.length || !plausibleNYCBounds(geoLayer.getBounds())) {
      throw new Error("NTA polygons could not be placed within the expected New York City map extent. Check the GeoJSON coordinate reference system.");
    }
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
