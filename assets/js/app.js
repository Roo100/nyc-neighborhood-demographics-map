import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
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
const ui = Object.fromEntries(['borough','map-detail','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count'].map(id=>[id,document.getElementById(id)]));
let records=[], map, geoLayer, boroughLabels, landmarkLayer, streetTiles, outsideCityMask, selected=null, byCode=new Map();
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
    fillOpacity:streets?(record.special?.18:.20):.96
  };
}
function styleFor(record){
  if(selected===record) return {color:'#241039',weight:4,fillColor:'#FFFFFF',
    fillOpacity:ui['map-detail'].value==='streets'?.30:1};
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
function overviewProfile(){
  ui['detail-name'].textContent='Explore the five boroughs';
  ui['detail-intro'].textContent='Pick a neon borough, tap a landmark icon, or use the search to explore official NYC neighborhood areas.';
  writeMeta([['Geographic coverage','New York City'],['Boroughs','5'],['2020 NTAs',String(records.length)]]);
}
function boroughProfile(borough){
  const local=filterNtas(records,borough);
  ui['detail-name'].textContent=borough;
  ui['detail-intro'].textContent='Tap any neighborhood for its profile. The landmark icon helps orient your view; gray areas are special-purpose NTAs.';
  writeMeta([['Borough',borough],['2020 NTAs',String(local.length)],['Special-purpose areas',String(local.filter(r=>r.special).length)]]);
}
function switchBorough(borough){
  selected=null;ui.borough.value=borough;ui.neighborhood.value='';
  render();
  status(borough==='all'?'Showing New York City: five boroughs.':'Exploring '+borough+' neighborhoods.');
}
function display(record){
  if(ui.borough.value!==record.borough){ui.borough.value=record.borough;render();}
  selected=record;
  ui['detail-name'].textContent=record.name;
  ui['detail-intro'].textContent=record.special?'Official special-purpose area; it may have limited or no residential population.':'Official 2020 Neighborhood Tabulation Area. Demographic and election results are not yet attached.';
  writeMeta([['Borough',record.borough],['2020 NTA code',record.code],['Area classification',record.special?'Special purpose':'Residential'],['NTA type code',record.ntaType||'Not provided']]);
  geoLayer.eachLayer(layer=>{
    const r=byCode.get(layer.feature.properties.__ntaCode);
    layer.setStyle(styleFor(r));
  });
  const layer=geoLayer.getLayers().find(x=>x.feature.properties.__ntaCode===record.code);
  if(layer){layer.bringToFront();fitNYCBounds(layer.getBounds(),{padding:[48,48],maxZoom:14});}
}
function render(){
  const borough=ui.borough.value;
  const visible=filterNtas(records,borough);
  geoLayer.clearLayers();
  geoLayer.addData({type:'FeatureCollection',features:visible.map(r=>r.feature)});
  ui['feature-count'].textContent=visible.length.toLocaleString();
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
  if(!selected)(borough==='all'?overviewProfile():boroughProfile(borough));
  if(visible.length)fitNYCBounds(geoLayer.getBounds(),{padding:[35,35]});
}
function search(){const found=findNta(records,ui.neighborhood.value,ui.borough.value);if(found){display(found);status(`Selected ${found.name} (${found.code}), ${found.borough}.`);}else{status('No matching NTA in the selected borough. Try another spelling or clear the borough filter.',true);}}
function wire(){
  for(const b of BOROUGHS){const o=document.createElement('option');o.value=b;o.textContent=b;ui.borough.append(o);}
  for(const id of ['borough','map-detail','neighborhood','search-button','reset'])ui[id].disabled=false;
  ui['map-detail'].addEventListener('change',()=>setMapDetail(ui['map-detail'].value));
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
    if(geoLayer.getLayers().length !== records.length || !plausibleNYCBounds(geoLayer.getBounds())) {
      throw new Error("NTA polygons could not be placed within the expected New York City map extent. Check the GeoJSON coordinate reference system.");
    }
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
