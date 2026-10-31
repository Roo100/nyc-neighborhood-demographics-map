import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
import {COMMUNITY_LOCAL,COMMUNITY_REMOTE,BOARD_COUNTS,BOROUGH_PRESIDENTS,parseBoroCd,validateCommunityGeoJSON} from './civic.js';
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
const ui = Object.fromEntries(['civic-layer','board-picker-field','community-board','borough','map-detail','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count','feature-label','profile-kicker','civic-context','borough-president'].map(id=>[id,document.getElementById(id)]));
let records=[], map, geoLayer, boroughLabels, landmarkLayer, streetTiles, outsideCityMask,
  selected=null, selectedCommunity=null, byCode=new Map(), communityBoards=[],
  communityByCode=new Map(), communityLayer=null;
function status(message,error=false){ui.status.textContent=message;ui.status.classList.toggle('error',error);}
function startMap(){
  if(!window.L) throw new Error('Leaflet failed to load. Check your network connection.');
  // Default view includes recognizable street and block grids; mask outside NYC.
  map=L.map('map',{zoomControl:true,scrollWheelZoom:false,zoomSnap:0.1,zoomDelta:0.5,minZoom:9,maxZoom:17,maxBounds:[[40.40,-74.40],[41.04,-73.50]],maxBoundsViscosity:1,preferCanvas:true}).fitBounds(NYC_BOUNDS);
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
  const fill=BOROUGH_COLORS[record.borough] || '#cbd5dc';
  const streets=ui['map-detail'].value==='streets';
  // In street view, transparent neon borough overlays expose actual roads and intersections.
  // Comic-only view restores fully saturated fills while preserving the same true boundaries.
  if(ui.borough.value==='all') return {
    color:'#241039',weight:streets?.8:.72,opacity:streets?.48:.9,
    fillColor:fill,fillOpacity:streets?.27:1
  };
  return {
    color:'#241039',weight:streets?1.5:1.3,opacity:1,
    fillColor:record.special?'#dee6ed':fill,
    fillOpacity:streets?(record.special?.12:.12):.96
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
  selected=null;selectedCommunity=null;ui.borough.value=borough;ui.neighborhood.value='';
  render();
  const layerName=ui['civic-layer'].value==='boards'?'community boards':'neighborhoods';
  status(borough==='all'?'Showing all five NYC boroughs and their '+layerName+'.':'Exploring '+borough+' '+layerName+'.');
}
function display(record){
  if(ui.borough.value!==record.borough){ui.borough.value=record.borough;render();}
  selected=record;
  ui['profile-kicker'].textContent='NEIGHBORHOOD PROFILE';
  ui['detail-name'].textContent=record.name;
  ui['detail-intro'].textContent=record.special?'Official special-purpose area; it may have limited or no residential population.':'Official 2020 Neighborhood Tabulation Area. Demographic and election results are not yet attached.';
  writeMeta([['Borough',record.borough],['2020 NTA code',record.code],['Area classification',record.special?'Special purpose':'Residential'],['NTA type code',record.ntaType||'Not provided']]);
  updateCivicContext(record.borough);
  geoLayer.eachLayer(layer=>{
    const r=byCode.get(layer.feature.properties.__ntaCode);
    layer.setStyle(styleFor(r));
  });
  const layer=geoLayer.getLayers().find(x=>x.feature.properties.__ntaCode===record.code);
  if(layer){layer.bringToFront();fitNYCBounds(layer.getBounds(),{padding:[48,48],maxZoom:14});}
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
  }catch(error){
    console.warn('Community board geography unavailable:',error);
    const option=ui['civic-layer'].querySelector('option[value="boards"]');
    if(option)option.disabled=true;
    ui['civic-layer'].disabled=false;
    document.getElementById('civic-source').textContent='Community board boundary map temporarily unavailable; official civic directories remain accessible.';
  }
}
function render(){
  const borough=ui.borough.value;
  const visible=filterNtas(records,borough);
  const boardMode=ui['civic-layer'].value==='boards'&&!!communityLayer;
  geoLayer.clearLayers();
  geoLayer.addData({type:'FeatureCollection',features:visible.map(r=>r.feature)});
  const visibleBoards=communityBoards.filter(board=>borough==='all'||board.borough===borough);
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
  if(boardMode){
    if(map.hasLayer(geoLayer))map.removeLayer(geoLayer);
    communityLayer.clearLayers();
    communityLayer.addData({type:'FeatureCollection',features:visibleBoards.map(b=>b.feature)});
    if(!map.hasLayer(communityLayer))communityLayer.addTo(map);
  }else{
    if(communityLayer&&map.hasLayer(communityLayer))map.removeLayer(communityLayer);
    if(!map.hasLayer(geoLayer))geoLayer.addTo(map);
  }
  ui['feature-count'].textContent=(boardMode?visibleBoards.length:visible.length).toLocaleString();
  ui['feature-label'].textContent=boardMode?'community boards in selected borough filter':'NTAs in selected borough filter';
  ui.neighborhood.disabled=boardMode;
  ui['search-button'].disabled=boardMode;
  ui.neighborhood.placeholder=boardMode?'Switch to Neighborhoods to search an NTA':'Search e.g. Harlem, Astoria, BX0101';
  ui['nta-options'].replaceChildren();
  for(const r of visible.slice().sort((a,b)=>a.name.localeCompare(b.name))){
    const option=document.createElement('option');option.value=r.name+' ('+r.code+')';ui['nta-options'].append(option);
  }
  if(borough==='all'){
    if(!map.hasLayer(boroughLabels))boroughLabels.addTo(map);
  }else if(map.hasLayer(boroughLabels))map.removeLayer(boroughLabels);
  landmarkLayer.clearLayers();
  for(const landmark of LANDMARKS){
    if(borough!=='all' && borough!==landmark.borough)continue;
    const icon=L.divIcon({
      className:'comic-landmark',
      html:'<span class="comic-landmark-inner" aria-hidden="true">'+landmark.symbol+'</span>',
      iconSize:[42,42],
      iconAnchor:[21,21]
    });
    const marker=L.marker(landmark.coords,{
      icon,keyboard:true,title:landmark.name+', '+landmark.borough,
      alt:landmark.name
    }).addTo(landmarkLayer);
    marker.bindTooltip(landmark.name+' · '+landmark.borough,{direction:'top',offset:[0,-21],className:'comic-tooltip'});
    marker.on('click',()=>{
      if(ui.borough.value==='all')switchBorough(landmark.borough);
      status(landmark.name+' is in '+landmark.borough+'. Select a neighborhood to explore NTA details.');
    });
  }
  for(const button of document.querySelectorAll('[data-borough]')){
    const active=button.dataset.borough===borough;
    button.classList.toggle('active',active);
    button.setAttribute('aria-pressed',String(active));
  }
  if(selected&&!visible.includes(selected))selected=null;
  if(selectedCommunity&&!visibleBoards.includes(selectedCommunity))selectedCommunity=null;
  if(boardMode){
    selectedCommunity?boardProfile(selectedCommunity):boardOverview(borough);
    if(visibleBoards.length){
      const target=selectedCommunity
        ? communityLayer.getLayers().find(layer=>parseBoroCd(layer.feature)?.code===selectedCommunity.code)
        : null;
      if(target)focusCommunityBoard(target.getBounds());
      else fitNYCBounds(communityLayer.getBounds(),{padding:[35,35],animate:false});
    }
  }else{
    if(!selected)(borough==='all'?overviewProfile():boroughProfile(borough));
    if(visible.length)fitNYCBounds(geoLayer.getBounds(),{padding:[35,35]});
  }
}
function search(){const found=findNta(records,ui.neighborhood.value,ui.borough.value);if(found){display(found);status(`Selected ${found.name} (${found.code}), ${found.borough}.`);}else{status('No matching NTA in the selected borough. Try another spelling or clear the borough filter.',true);}}
function wire(){
  for(const b of BOROUGHS){const o=document.createElement('option');o.value=b;o.textContent=b;ui.borough.append(o);}
  for(const id of ['borough','map-detail','neighborhood','search-button','reset'])ui[id].disabled=false;
  ui['map-detail'].addEventListener('change',()=>setMapDetail(ui['map-detail'].value));
  ui['community-board'].addEventListener('change',()=>{
    const found=communityByCode.get(Number(ui['community-board'].value));
    if(found)showCommunityBoard(found);
  });
  ui['civic-layer'].addEventListener('change',()=>{
    selected=null;selectedCommunity=null;ui.neighborhood.value='';
    render();
    status(ui['civic-layer'].value==='boards'
      ? 'Showing official NYC community boards (2026), separate from neighborhood and electoral boundaries.'
      : 'Showing official NYC 2020 Neighborhood Tabulation Areas.');
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
    geoLayer=L.geoJSON(null,{style:feature=>baseStyle(byCode.get(feature.properties.__ntaCode)),onEachFeature:(feature,layer)=>{
      const r=byCode.get(feature.properties.__ntaCode);
      layer.bindTooltip(`${r.name} · ${r.borough}`,{sticky:true,direction:'top'});
      layer.on('click',()=>{
        if(ui.borough.value==='all')switchBorough(r.borough);
        else{display(r);status('Selected '+r.name+' ('+r.code+'), '+r.borough+'.');}
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
    if(geoLayer.getLayers().length !== records.length || !plausibleNYCBounds(geoLayer.getBounds())) {
      throw new Error("NTA polygons could not be placed within the expected New York City map extent. Check the GeoJSON coordinate reference system.");
    }
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
