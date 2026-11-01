import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
import {COMMUNITY_LOCAL,COMMUNITY_REMOTE,BOARD_COUNTS,BOROUGH_PRESIDENTS,parseBoroCd,validateCommunityGeoJSON,indexCommunityDistricts,lookupCommunityDistrict,lookupPolygonAtPoint} from './civic.js';
import {SCHOOL_DISTRICTS_LOCAL,K12_SCHOOL_POINTS_LOCAL,validateSchoolDistricts,validateSchoolLocations,filterSchoolLocations} from './education.js';
import {ACS_FILE,ACS_LAYER_OPTIONS,validateACSDisplay,acsLayerMetric,acsLayerError,acsFill,dataLegend,formatACSValue,raceLabels} from './acs.js';
import {DISTRICT_KINDS,OFFICIAL_LEGISLATIVE_DIRS,validateDistrictGeoJSON,validateOfficialNames,makeDistrictLookup,identifyLegislators,officialForDistrict} from './representation.js';
import {ENROLLMENT_FILE,PARTY_OPTIONS,validateCouncilEnrollment,enrollmentShare,partyFill,partyLegend,enrollmentDetails} from './political.js';
import {MAYOR_2025_CITYWIDE,validateCitywideMayoralResult} from './elections.js';
import {fetchNYCPollSites,OFFICIAL_POLL_LOOKUP} from './polling.js';
import {BOROUGH_INCOME_2025_FILE,validateBoroughIncome2025} from './borough-income.js';
import {BOROUGH_RACE_2025_FILE,validateBoroughRace2025,RACE_GROUPS} from './borough-race.js';
import {buildCivicCard} from './civic-card.js';
import {createCivicExplorer} from './civic-explorer.js';
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
const ui = Object.fromEntries(['civic-layer','council-picker-field','council-picker','political-metric','political-field','demographic-layer','demographic-field','education-picker-field','education-picker','school-filter-field','school-type','school-search-field','school-search','school-find','poll-sites','poll-sites-note','board-picker-field','community-board','borough','map-detail','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count','feature-label','profile-kicker','civic-context','borough-president'].map(id=>[id,document.getElementById(id)]));
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
  councilLayer=null,selectedCouncil=null,
  pollLayer=null,pollRequest=0,pollCache=new Map(),boroughIncome2025=null,boroughRace2025=null,
  civicExplorer=null,ntaSpatialIndex=null;
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
  // Keep other boroughs clickable after one borough is selected, but visually de-emphasize them.
  if(ui.borough.value!=='all'&&record.borough!==ui.borough.value) return {
    color:'#241039',weight:.65,opacity:.35,fillColor:'#b8cad8',fillOpacity:.08
  };
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
  if(councilLayer)councilLayer.eachLayer(layer=>{
    const rec=legislativeLookup.council?.records.find(x=>x.code===Number(layer.feature?.properties?.district));
    if(rec)layer.setStyle(councilStyle(rec));
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
  if(ui['civic-layer'].value==='enrollment'&&enrollmentReady){updatePartyLegend();return;}
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
  map?.getContainer()?.querySelectorAll('.nyc-pop-mobile-overlay, .nyc-demographic-preview, .nyc-civic-preview').forEach(el=>el.remove());
}
function resetMapPointLookup(){
  selectedMapPoint=null;selectedMapNeighborhood=null;
  civicExplorer?.refreshPoint();
  if(map)map.closePopup();
  closeMobileCivicCard();
  if(mapPointMarker){map.removeLayer(mapPointMarker);mapPointMarker=null;}
  document.getElementById('point-board-result').textContent=
    'Click a street or place on the map to identify its community board from official 2026 boundaries.';
  document.getElementById('point-board-coordinates').textContent='';
  document.getElementById('point-board-panel').dataset.lookupStatus='idle';
}

function addCouncilEnrollmentToPopup(root,latlng,legislative){
  if(!enrollmentReady||legislative.council?.status!=='match')return;
  const record=councilEnrollment.get(legislative.council.record.code);
  const details=enrollmentDetails(record,'active');
  if(!details)return;
  const section=document.createElement('details');
  section.className='party-popup-details';
  const summary=document.createElement('summary');
  summary.textContent='Registered voters · Council District '+record.district+' (Feb 2026)';
  const list=document.createElement('dl');
  list.className='acs-popup-facts';
  const row=(label,value)=>{
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=label;dd.textContent=value;list.append(dt,dd);
  };
  row('Active registered voters',details.total.toLocaleString('en-US'));
  for(const p of details.parties){
    row(p.name,p.count.toLocaleString('en-US')+' ('+(p.share??0).toFixed(1)+'% of active)');
  }
  row('Active + inactive voters',record.total.Total.toLocaleString('en-US'));
  const note=document.createElement('p');
  note.className='party-profile-note';
  note.textContent='Source: NYC BOE 02/20/2026 Council District Summary. Registered voters, NOT candidate votes or neighborhood voting results. Districts can span multiple neighborhoods.';
  section.append(summary,list,note);root.append(section);
}
function showCivicPopup(latlng,neighborhood,communityMatch){
  // The clicked map point, never an NTA centroid, determines administrative
  // districts. Detailed racial and income figures stay in the sidebar.
  map.closePopup();
  closeMobileCivicCard();
  const schoolMatch=lookupPolygonAtPoint(schoolDistrictSpatialIndex,latlng.lat,latlng.lng);
  const legislative=identifyLegislators(legislativeLookup,latlng.lat,latlng.lng);
  const card=buildCivicCard({
    neighborhood,boardMatch:communityMatch,schoolMatch,
    legislators:legislative,officials:legislativeOfficials,
    boroughPresidents:BOROUGH_PRESIDENTS
  });
  const root=document.createElement('section');
  root.className='nyc-civic-preview';
  root.setAttribute('role','region');
  root.setAttribute('aria-label','Community board, elected officials and school zone information');
  const close=document.createElement('button');
  close.type='button';close.className='nyc-civic-preview-close';
  close.textContent='×';close.setAttribute('aria-label','Close civic information');
  close.addEventListener('click',()=>root.remove());
  root.append(close);
  const heading=document.createElement('h3');
  heading.textContent=card.title;root.append(heading);
  const context=document.createElement('p');
  context.className='nyc-civic-preview-context';
  context.textContent=card.borough+' · Selected map point';root.append(context);
  const addSection=(headingText,items)=>{
    const section=document.createElement('section');
    section.className='nyc-civic-preview-section';
    const heading=document.createElement('h4');
    heading.textContent=headingText;section.append(heading);
    const list=document.createElement('dl');
    for(const [label,value] of items){
      const dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=value;
      list.append(dt,dd);
    }
    section.append(list);root.append(section);
  };
  const boundary=civicExplorer?.selectedBoundaryAt(latlng);
  if(boundary)addSection('Selected boundary',[[boundary.label,boundary.value]]);
  addSection('Community board',[['Board at this point',card.board]]);
  addSection('Elected representatives',card.officials);
  addSection('Schools and zoning',[['Geographic district',card.school],
    ['Attendance zone','Verify by home address and grade']]);
  const notice=document.createElement('p');
  notice.className='nyc-civic-preview-notice';
  notice.textContent=card.schoolZoneNotice;
  root.append(notice);
  const finder=document.createElement('a');
  finder.className='nyc-civic-preview-school-link';
  finder.href=card.schoolFinder;finder.target='_blank';finder.rel='noopener noreferrer';
  finder.textContent='Find my zoned school · NYCPS';
  root.append(finder);
  const resource=document.createElement('details');
  resource.className='nyc-civic-preview-resources';
  const summary=document.createElement('summary');
  summary.textContent='Official representative and board directories';
  resource.append(summary);
  const links=document.createElement('div');
  for(const [label,url] of card.links){
    const link=document.createElement('a');
    link.href=url;link.target='_blank';link.rel='noopener noreferrer';
    link.textContent=label;links.append(link);
  }
  resource.append(links);root.append(resource);
  const citation=document.createElement('p');
  citation.className='nyc-civic-preview-source';
  citation.textContent='District boundaries: NYC Planning 2026. Council and Senate representative names: October 31, 2026 verification snapshot where available. Confirm current school zones and officeholders with official sources.';
  root.append(citation);
  L.DomEvent.disableClickPropagation(root);
  L.DomEvent.disableScrollPropagation(root);
  map.getContainer().append(root);
}
function identifyCommunityAtPoint(latlng,neighborhood=null){
  if(!latlng||!Number.isFinite(latlng.lat)||!Number.isFinite(latlng.lng))return;
  selectedMapPoint={lat:latlng.lat,lng:latlng.lng};
  if(!neighborhood&&ntaSpatialIndex){
    const matchedNta=lookupPolygonAtPoint(ntaSpatialIndex,latlng.lat,latlng.lng);
    if(matchedNta.status==='match')neighborhood=matchedNta.record;
  }
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
  civicExplorer?.refreshPoint();
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
  if(ui['civic-layer'].value==='enrollment')ui['civic-layer'].value='nta';
  selected=null;selectedCommunity=null;selectedSchoolDistrict=null;selectedSchool=null;selectedCouncil=null;
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
    civicExplorer?.refreshData();
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
    civicExplorer?.refreshData();
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
    civicExplorer?.refreshData();
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
    civicExplorer?.refreshData();
    ui['civic-layer'].querySelector('[value="schools"]').disabled=false;
    schoolsOK=true;
  }catch(e){console.warn('NYSED school point map remains unavailable:',e);}
  document.getElementById('education-source').textContent=
    'NYC DCP school district polygons '+(districtsOK?'verified (2026)':'unavailable')+
    '; NYSED K–12 school point locations '+(schoolsOK?'verified ('+schoolPoints.length+' records)':'unavailable')+
    '. Administrative boundaries are not attendance zones. Confirm Fall 2026 grades/admissions with NYCPS.';
}
function councilStyle(entry){
  const record=councilEnrollment.get(entry.code);
  const chosen=ui['political-metric'].value;
  const streets=ui['map-detail'].value==='streets';
  const selectedHere=selectedCouncil?.code===entry.code;
  return {color:'#241039',weight:selectedHere?4:1.5,opacity:1,
    fillColor:partyFill(record,chosen),
    fillOpacity:streets?(selectedHere?.65:.57):.93};
}
function showCouncilOverview(){
  ui['profile-kicker'].textContent='NYC BOE 2026 · COUNCIL PARTY ENROLLMENT';
  ui['detail-name'].textContent='51 City Council Districts';
  ui['detail-intro'].textContent='Select a City Council district to see registered voters by party. This is district-level enrollment, not neighborhood-level voting or candidate election results.';
  writeMeta([['Reporting date','February 20, 2026'],['Geography','51 Council districts'],['Voter statuses','Active and inactive reported separately'],['Party classification','Unaffiliated is not a political party']]);
  document.getElementById('party-profile').hidden=true;
  updateCivicContext(null);
}
function showCouncilProfile(entry){
  const record=councilEnrollment.get(entry.code);
  if(!record)return;
  const active=enrollmentDetails(record,'active');
  ui['profile-kicker'].textContent='OFFICIAL CITY COUNCIL DISTRICT · NYC BOE';
  ui['detail-name'].textContent='City Council District '+entry.code;
  const name=officialForDistrict(legislativeOfficials,'council',entry.code);
  ui['detail-intro'].textContent='Party enrollment by Council district as of February 20, 2026. The district may span neighborhoods and boroughs; these are registered voters, not votes cast.';
  writeMeta([['City Council member',name||'Verify NYC Council directory'],
    ['Active voters',active.total.toLocaleString('en-US')],
    ['Inactive voters',record.inactive.Total.toLocaleString('en-US')],
    ['Total enrolled',record.total.Total.toLocaleString('en-US')],
    ['Largest active enrollment category',active.largest?.name||'Unavailable']]);
  const profile=document.getElementById('party-profile');
  const content=document.getElementById('party-profile-content');
  profile.hidden=false;
  const list=document.createElement('dl');list.className='party-profile-facts';
  for(const p of active.parties){
    const dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=p.name;
    dd.textContent=p.count.toLocaleString('en-US')+' ('+(p.share??0).toFixed(1)+'%)';
    list.append(dt,dd);
  }
  content.replaceChildren(list);
  updateCivicContext(null);
}
function selectCouncilDistrict(entry,latlng){
  selectedCouncil=entry;
  selected=null;selectedCommunity=null;selectedSchool=null;selectedSchoolDistrict=null;
  if(councilLayer)councilLayer.eachLayer(layer=>{
    const match=legislativeLookup.council.records.find(x=>x.code===Number(layer.feature.properties.district));
    if(match)layer.setStyle(councilStyle(match));
  });
  showCouncilProfile(entry);
  ui['council-picker'].value=String(entry.code);
  if(latlng)identifyCommunityAtPoint(latlng);
  status('City Council District '+entry.code+' · 2026 BOE party enrollment. This is voter registration, not election votes.');
}
function initializeCouncilMap(){
  if(councilLayer||!enrollmentReady||!legislativeLookup.council)return;
  const entries=legislativeLookup.council.records;
  if(entries.length!==51||entries.some(x=>!councilEnrollment.has(x.code))){
    document.getElementById('party-source').textContent='Party enrollment and council polygons could not be matched by district ID.';
    return;
  }
  councilLayer=L.geoJSON(null,{
    bubblingMouseEvents:false,
    style:feature=>{
      const rec=entries.find(x=>x.code===Number(feature.properties.district));
      return councilStyle(rec);
    },
    onEachFeature:(feature,layer)=>{
      const entry=entries.find(x=>x.code===Number(feature.properties.district));
      layer.bindTooltip('Council District '+entry.code+' · official 2026 enrollment',{sticky:true});
      layer.on('click',event=>{
        if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);
        selectCouncilDistrict(entry,event.latlng);
      });
      layer.on('mouseout',()=>layer.setStyle(councilStyle(entry)));
    }
  });
  councilLayer.addData({type:'FeatureCollection',features:entries.map(x=>x.feature)});
  const option=ui['civic-layer'].querySelector('[value="enrollment"]');
  option.disabled=false;
  ui['political-metric'].disabled=false;
}
function updatePartyLegend(){
  if(!enrollmentReady)return;
  const container=document.querySelector('.map-key');
  const data=partyLegend(ui['political-metric'].value);
  const title=document.createElement('div');
  title.className='key-title';title.textContent=data.title;
  container.replaceChildren(title);
  for(const entry of data.entries){
    const row=document.createElement('div');row.className='acs-legend-item';
    const swatch=document.createElement('span');swatch.className='acs-legend-swatch';
    swatch.style.background=entry.color;
    const label=document.createElement('span');label.textContent=entry.label;
    row.append(swatch,label);container.append(row);
  }
  const note=document.createElement('p');note.className='acs-legend-note';
  note.textContent='NYC BOE active voter party enrollment, February 20, 2026. Council district totals, NOT neighborhood votes or election results. Blank=unaffiliated.';
  container.append(note);
}

async function loadCertifiedMayorResults(){
  const status=document.getElementById('mayor-election-status');
  const totals=document.getElementById('mayor-election-totals');
  const host=document.getElementById('mayor-election-candidates');
  if(!status||!totals||!host)return;
  try{
    const validated=validateCitywideMayoralResult(await download(MAYOR_2025_CITYWIDE));
    const comma=n=>new Intl.NumberFormat('en-US').format(n);
    status.textContent='Certified December 2, 2025 · NYC Board of Elections · all five boroughs';
    totals.replaceChildren();
    for(const [label,count] of [
      ['Ballots cast',validated.total_ballots],
      ['Recorded votes',validated.total_candidate_and_write_in_votes],
      ['Unrecorded',validated.unrecorded_ballots]
    ]){
      const box=document.createElement('div'),number=document.createElement('strong'),heading=document.createElement('span');
      number.textContent=comma(count);heading.textContent=label;
      box.append(number,heading);totals.append(box);
    }
    const table=document.createElement('table');
    table.className='mayor-election-table';
    const caption=document.createElement('caption');
    caption.textContent='Certified NYC mayoral votes, November 4, 2025 — all boroughs combined';
    table.append(caption);
    const thead=document.createElement('thead'),headers=document.createElement('tr');
    for(const title of ['Candidate','Vote distribution','Votes','Share']){
      const th=document.createElement('th');th.scope='col';th.textContent=title;headers.append(th);
    }
    thead.append(headers);table.append(thead);
    const body=document.createElement('tbody');
    for(const candidate of validated.candidates){
      const tr=document.createElement('tr');
      const name=document.createElement('th');name.scope='row';name.textContent=candidate.name;
      const barCell=document.createElement('td'),track=document.createElement('div'),bar=document.createElement('span');
      track.className='mayor-vote-track';bar.className='mayor-vote-bar';
      bar.style.width=candidate.vote_share_pct+'%';
      track.append(bar);barCell.append(track);
      const votes=document.createElement('td'),share=document.createElement('td');
      votes.textContent=comma(candidate.votes);
      share.textContent=candidate.vote_share_pct.toFixed(2)+'%';
      tr.append(name,barCell,votes,share);body.append(tr);
    }
    table.append(body);host.replaceChildren(table);
  }catch(e){
    console.warn('Certified mayor election panel unavailable:',e);
    status.textContent='Certified mayoral results temporarily unavailable. Use the official NYC Board of Elections link below.';
    totals.replaceChildren();host.replaceChildren();
  }
}
const BOROUGH_COUNTY_FIPS={Bronx:'36005',Brooklyn:'36047',Manhattan:'36061',Queens:'36081','Staten Island':'36085'};
function updateBoroughRace2025(){
  const borough=ui.borough.value;
  const panel=document.getElementById('borough-race-2025');
  const description=document.getElementById('borough-race-2025-description');
  const value=document.getElementById('borough-race-2025-value');
  const link=document.getElementById('borough-race-2025-source');
  if(!panel||!value||!link||!description)return;
  panel.hidden=ui['civic-layer'].value!=='nta';
  const fips=BOROUGH_COUNTY_FIPS[borough],record=boroughRace2025?.get(borough);
  value.replaceChildren();
  if(!fips){
    description.textContent='The 2025 one-year ACS is the latest borough-level racial/ethnic source. Choose a borough; neighborhood profiles use the 2020–2024 five-year ACS.';
    value.textContent='Select a borough to explore the latest available Census data.';
    link.href='https://data.census.gov/table/ACSDT1Y2025.B03002?g=050XX00US36005,36047,36061,36081,36085';
    link.textContent='Official 2025 NYC county race/ethnicity table';
    return;
  }
  description.textContent=borough+' · ACS 2025 one-year B03002. Five non-overlapping racial/ethnic categories.';
  link.href='https://data.census.gov/table/ACSDT1Y2025.B03002?g=050XX00US'+fips;
  link.textContent='Official 2025 race/ethnicity source for '+borough;
  if(!record){
    value.textContent='2025 borough percentages are pending independent Census source validation. No unverified percentages are displayed.';
    return;
  }
  const list=document.createElement('dl');
  list.className='borough-race-facts';
  for(const group of RACE_GROUPS){
    const name=document.createElement('dt'),share=document.createElement('dd');
    name.textContent=group;share.textContent=record.shares_pct[group].toFixed(1)+'%';
    list.append(name,share);
  }
  value.append(list);
}
function updateBoroughIncome2025(){
  const borough=ui.borough.value;
  const panel=document.getElementById('borough-income-2025');
  const value=document.getElementById('borough-income-2025-value');
  const description=document.getElementById('borough-income-2025-description');
  const link=document.getElementById('borough-income-2025-source');
  if(!panel||!value||!description||!link)return;
  const code=BOROUGH_COUNTY_FIPS[borough];
  panel.hidden=ui['civic-layer'].value!=='nta';
  if(code){
    description.textContent=borough+' (county '+code+') · 2025 ACS one-year estimates, 2025 inflation-adjusted dollars.';
    const record=boroughIncome2025?.get(borough);
    value.textContent=record?'Median household income: '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(record.median_household_income_usd)+' (90% margin of error ±'+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(record.moe_90_usd)+')':'2025 Census borough figures are available at the official source. The dashboard is withholding the numeric value until B19013 estimate and 90% margin of error are checked against the release.';
    link.textContent='View official 2025 Census income for '+borough;
    link.href='https://data.census.gov/table/ACSDT1Y2025.B19013?g=050XX00US'+code;
  }else{
    description.textContent='2025 ACS one-year figures are published for each of the five NYC boroughs (counties).';
    value.textContent='Choose a borough above to open the correct official 2025 Census income table. Neighborhood income continues to use the 2020–2024 five-year ACS.';
    link.textContent='Explore official 2025 Census county income tables';
    link.href='https://data.census.gov/table/ACSDT1Y2025.B19013?g=050XX00US36005,36047,36061,36081,36085';
  }
}
async function loadBoroughRace2025(){
  try{
    boroughRace2025=validateBoroughRace2025(await download(BOROUGH_RACE_2025_FILE));
  }catch(error){
    console.info('2025 borough race/ethnicity remains pending source verification:',error.message);
    boroughRace2025=null;
  }
  updateBoroughRace2025();
}
async function loadBoroughIncome2025(){
  try{
    boroughIncome2025=validateBoroughIncome2025(await download(BOROUGH_INCOME_2025_FILE));
    updateBoroughIncome2025();
  }catch(error){
    // Fail closed: missing or invalid 2025 values must never be presented as verified.
    console.info('2025 borough incomes pending source verification:',error.message);
    boroughIncome2025=null;
    updateBoroughIncome2025();
  }
}
function render(){
  const borough=ui.borough.value,mode=ui['civic-layer'].value;
  updateBoroughIncome2025();
  updateBoroughRace2025();
  const enrollmentMode=mode==='enrollment'&&!!councilLayer;
  ui['political-field'].hidden=!enrollmentMode;
  ui['political-metric'].disabled=!enrollmentMode;
  ui['council-picker-field'].hidden=!enrollmentMode;
  ui['council-picker'].disabled=!enrollmentMode;
  ui['council-picker'].replaceChildren();
  const councilPlaceholder=document.createElement('option');
  councilPlaceholder.value='';councilPlaceholder.textContent='Select a Council district';
  ui['council-picker'].append(councilPlaceholder);
  if(enrollmentMode){
    for(const entry of legislativeLookup.council.records){
      const option=document.createElement('option');
      option.value=String(entry.code);option.textContent='Council District '+entry.code;
      ui['council-picker'].append(option);
    }
    if(selectedCouncil)ui['council-picker'].value=String(selectedCouncil.code);
  }
  ui.borough.disabled=enrollmentMode;
  document.getElementById('party-profile').hidden=!enrollmentMode||!selectedCouncil;
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
  // Retain all borough geometries for pointer hit-testing. Filter the zoom target,
  // search choices and profile, not the clickability of adjacent boroughs.
  geoLayer.addData({type:'FeatureCollection',features:records.map(r=>r.feature)});
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
  if(councilLayer&&!enrollmentMode&&map.hasLayer(councilLayer))map.removeLayer(councilLayer);
  if(enrollmentMode){
    if(map.hasLayer(geoLayer))map.removeLayer(geoLayer);
    if(communityLayer&&map.hasLayer(communityLayer))map.removeLayer(communityLayer);
    if(schoolDistrictLayer&&map.hasLayer(schoolDistrictLayer))map.removeLayer(schoolDistrictLayer);
    if(!map.hasLayer(councilLayer))councilLayer.addTo(map);
  }else if(boardMode){
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

  const total=enrollmentMode?51:boardMode?visibleBoards.length:districtMode?schoolDistricts.length:
    schoolMode?visibleSchools.length:visible.length;
  ui['feature-count'].textContent=total.toLocaleString();
  ui['feature-label'].textContent=enrollmentMode?'City Council districts with official February 2026 BOE party enrollment':
    boardMode?'community boards in selected borough filter':
    districtMode?'geographic NYC school districts (citywide)':
    schoolMode?'K–12 school location records matching selected filters':
    'NTAs in selected borough filter';

  if(borough==='all'&&!schoolMode&&!districtMode&&!enrollmentMode){
    if(!map.hasLayer(boroughLabels))boroughLabels.addTo(map);
  }else if(map.hasLayer(boroughLabels))map.removeLayer(boroughLabels);
  landmarkLayer.clearLayers();
  if(!schoolMode){
    for(const landmark of LANDMARKS){
      // Landmarks remain available as borough switch targets after filtering.
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
        if(ui.borough.value!==landmark.borough)switchBorough(landmark.borough);
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

  if(enrollmentMode){
    selectedCouncil?showCouncilProfile(selectedCouncil):showCouncilOverview();
    if(!selectedCouncil)fitNYCBounds(councilLayer.getBounds(),{padding:[35,35],animate:false});
  }else if(boardMode){
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
    else if(visible.length)fitNYCBounds(L.geoJSON({type:'FeatureCollection',features:visible.map(r=>r.feature)}).getBounds(),{padding:[35,35],animate:false});
  }else if(schoolMode){
    selectedSchool?schoolProfile(selectedSchool):schoolOverview();
    if(selectedSchool)map.setView(selectedSchool.coordinates,15,{animate:false});
    else if(visible.length)fitNYCBounds(L.geoJSON({type:'FeatureCollection',features:visible.map(r=>r.feature)}).getBounds(),{padding:[35,35],animate:false});
    refreshSchoolPins();
  }else{
    if(!selected)(borough==='all'?overviewProfile():boroughProfile(borough));
    if(selected)showACSProfile(selected);
    if(visible.length)fitNYCBounds(L.geoJSON({type:'FeatureCollection',features:visible.map(r=>r.feature)}).getBounds(),{padding:[35,35]});
  }
  civicExplorer?.bringToFront();
}
function search(){const found=findNta(records,ui.neighborhood.value,ui.borough.value);if(found){display(found);status('Selected '+found.name+', '+found.borough+'. Click any street in the neighborhood to view its community board.');}else{status('No matching neighborhood in the selected borough. Try another spelling or clear the borough filter.',true);}}
async function setPollingSites(kind){
  const token=++pollRequest;
  if(pollLayer){map.removeLayer(pollLayer);pollLayer=null;}
  const note=ui['poll-sites-note'];
  if(kind==='off'){
    note.textContent='Poll sites are assigned by registered home address. Verify yours using the official BOE lookup.';
    return;
  }
  note.textContent='Loading official October 2026 NYC '+(kind==='early'?'early-voting':'Election Day')+' sites…';
  try{
    let sites=pollCache.get(kind);
    if(!sites){sites=await fetchNYCPollSites(kind);pollCache.set(kind,sites);}
    if(token!==pollRequest||ui['poll-sites'].value!==kind)return;
    const group=L.layerGroup();
    const color=kind==='early'?'#FF3B9D':'#00D9FF';
    for(const site of sites){
      const marker=L.circleMarker([site.lat,site.lng],{
        radius:5,color:'#241039',weight:1.5,fillColor:color,fillOpacity:.96,
        pane:'markerPane',bubblingMouseEvents:false
      });
      const root=document.createElement('div');
      root.className='poll-site-popup';
      const heading=document.createElement('strong');
      heading.textContent=site.name;
      const addr=document.createElement('p');
      addr.textContent=[site.address,site.city,site.zip].filter(Boolean).join(', ');
      const type=document.createElement('p');
      type.textContent=kind==='early'?'Early-voting location · October 24–November 1, 2026':'Election Day location · November 3, 2026';
      const warning=document.createElement('p');
      warning.className='poll-site-warning';
      warning.textContent='Showing a polling-site location does not mean you are assigned here. Locations can change. Confirm your address with NYC BOE.';
      const link=document.createElement('a');
      link.href=OFFICIAL_POLL_LOOKUP;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Check my assigned polling site';
      root.append(heading,addr,type,warning,link);
      marker.bindPopup(root,{maxWidth:300});
      group.addLayer(marker);
    }
    pollLayer=group.addTo(map);
    note.textContent=sites.length.toLocaleString()+' official '+(kind==='early'?'early-voting':'Election Day')+' locations mapped (October 2026 snapshot). Zoom in to inspect sites; verify your assigned site by address.';
    status('Showing '+sites.length.toLocaleString()+' official NYC polling locations. This layer does not determine your assigned site.');
  }catch(error){
    if(token!==pollRequest)return;
    console.warn('Polling locations could not be loaded:',error);
    note.textContent='Polling location map temporarily unavailable. Use the official BOE address lookup to confirm your assigned site.';
    status('Polling-site location feed unavailable. Use the NYC BOE link.',true);
  }
}
function wire(){
  civicExplorer=createCivicExplorer({
    map,
    getData:()=>({records,ntaSpatialIndex,communityBoards,communitySpatialIndex,
      schoolDistricts,schoolDistrictSpatialIndex,legislativeLookup,legislativeOfficials,schoolMarkers}),
    getPoint:()=>selectedMapPoint,
    onPoint:(latlng,neighborhood)=>identifyCommunityAtPoint(latlng,neighborhood),
    onBaseMode:mode=>{
      if(ui['civic-layer'].value===mode)return;
      ui['civic-layer'].value=mode;
      selected=null;selectedCommunity=null;selectedCouncil=null;
      selectedSchool=null;selectedSchoolDistrict=null;
      render();
    },
    onStatus:message=>status(message)
  });
  for(const b of BOROUGHS){const o=document.createElement('option');o.value=b;o.textContent=b;ui.borough.append(o);}
  for(const id of ['borough','map-detail','neighborhood','search-button','reset'])ui[id].disabled=false;
  ui['map-detail'].addEventListener('change',()=>setMapDetail(ui['map-detail'].value));
  ui['poll-sites'].addEventListener('change',()=>{void setPollingSites(ui['poll-sites'].value);});
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
  ui['council-picker'].addEventListener('change',()=>{
    if(!councilLayer||!legislativeLookup.council)return;
    const selectedCode=Number(ui['council-picker'].value);
    const entry=legislativeLookup.council.records.find(x=>x.code===selectedCode);
    resetMapPointLookup();
    if(!entry){
      selectedCouncil=null;showCouncilOverview();
      fitNYCBounds(councilLayer.getBounds(),{padding:[35,35],animate:false});
      return;
    }
    selectCouncilDistrict(entry,null);
    const layer=councilLayer.getLayers().find(x=>Number(x.feature.properties.district)===entry.code);
    if(layer){layer.bringToFront();fitNYCBounds(layer.getBounds(),{padding:[40,40],maxZoom:13,animate:false});}
  });
  ui['political-metric'].addEventListener('change',()=>{
    if(!enrollmentReady||!councilLayer)return;
    updatePartyLegend();
    councilLayer.eachLayer(layer=>{
      const entry=legislativeLookup.council.records.find(x=>x.code===Number(layer.feature.properties.district));
      if(entry)layer.setStyle(councilStyle(entry));
    });
    if(selectedCouncil)showCouncilProfile(selectedCouncil);
    status('Showing '+PARTY_OPTIONS[ui['political-metric'].value]+'. Source: active registration by City Council district as of February 20, 2026; not votes cast.');
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
    selected=null;selectedCommunity=null;selectedCouncil=null;ui.neighborhood.value='';
    const mode=ui['civic-layer'].value;
    if(mode==='enrollment')ui.borough.value='all';
    render();
    status(mode==='enrollment'?'Showing official February 2026 party enrollment by City Council district, not neighborhood election results.':
      mode==='boards'?'Showing official NYC community boards (2026).':
      mode==='schooldistricts'?'Showing the 32 NYC geographic school districts, not attendance zones.':
      mode==='schools'?'Showing NYSED K–12 school locations. Zoom in for pins or search by school name.':
      'Showing official NYC 2020 Neighborhood Tabulation Areas.');
  });
  ui.borough.addEventListener('change',()=>switchBorough(ui.borough.value));
  ui['search-button'].addEventListener('click',search);
  ui.neighborhood.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  ui.reset.addEventListener('click',()=>{
    // Restore the public-facing default view, not just the borough filter.
    resetMapPointLookup();
    selected=null;selectedCommunity=null;selectedSchoolDistrict=null;
    selectedSchool=null;selectedCouncil=null;
    ui['civic-layer'].value='nta';
    ui['demographic-layer'].value='borough';
    ui['political-metric'].value='democrat';
    ui['map-detail'].value='streets';
    ui['poll-sites'].value='off';
    void setPollingSites('off');
    ui['school-type'].value='all';
    ui['school-search'].value='';
    ui['community-board'].value='';
    ui['education-picker'].value='';
    ui['council-picker'].value='';
    ui.borough.value='all';
    ui.neighborhood.value='';
    setMapDetail('streets');
    civicExplorer?.clear();
    render();
    fitNYCBounds(NYC_BOUNDS,{padding:[35,35],animate:false});
    status('Map reset: all five boroughs, neighborhood colors, street grid and default filters.');
  });
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
        if(ui.borough.value!==r.borough)switchBorough(r.borough);
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
    ntaSpatialIndex=indexCommunityDistricts(records);
    initializeStreetMap(records.map(r=>r.feature));
    wire();render();
    setMapDetail(ui['map-detail'].value);
    void loadCommunityGeography();
    void loadEducationGeography();
    void loadACSGeography();
    void loadBoroughIncome2025();
    void loadBoroughRace2025();
    void loadLegislativeDistricts();
    void loadCouncilEnrollment();
    // Certified June 2026 primary results are rendered directly from the verified BOE recap.
    if(geoLayer.getLayers().length !== records.length || !plausibleNYCBounds(geoLayer.getBounds())) {
      throw new Error("NTA polygons could not be placed within the expected New York City map extent. Check the GeoJSON coordinate reference system.");
    }
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
