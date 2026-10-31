import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
const LOCAL_GEOJSON = 'data/nta2020.geojson';
const OFFICIAL_GEOJSON = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=5000';
const NYC_BOUNDS = [[40.49,-74.27],[40.94,-73.68]];
const BOROUGH_COLORS = {Bronx:'#8bc9bc',Brooklyn:'#edbc84',Manhattan:'#a8bee9',Queens:'#c6b2e2','Staten Island':'#e8a9af'};
const LABEL_COORDS = {Bronx:[40.852,-73.876],Brooklyn:[40.657,-73.947],Manhattan:[40.787,-73.968],Queens:[40.733,-73.798],'Staten Island':[40.579,-74.145]};
// A bad or differently projected polygon must not zoom the map out to the world.
function plausibleNYCBounds(bounds){
  return bounds?.isValid() && bounds.getSouth() >= 40.30 && bounds.getNorth() <= 41.10 &&
    bounds.getWest() >= -74.60 && bounds.getEast() <= -73.40;
}
function fitNYCBounds(bounds, options={padding:[22,22]}){
  map.fitBounds(plausibleNYCBounds(bounds) ? bounds : NYC_BOUNDS, options);
}
const ui = Object.fromEntries(['borough','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count'].map(id=>[id,document.getElementById(id)]));
let records=[], map, geoLayer, boroughLabels, selected=null, byCode=new Map();
function status(message,error=false){ui.status.textContent=message;ui.status.classList.toggle('error',error);}
function startMap(){
  if(!window.L) throw new Error('Leaflet failed to load. Check your network connection.');
  // Borough-first cartography: no street basemap, surrounding jurisdictions or tile dependency.
  map=L.map('map',{zoomControl:true,scrollWheelZoom:false,minZoom:9,maxZoom:16,maxBounds:[[40.40,-74.40],[41.04,-73.50]],maxBoundsViscosity:1,preferCanvas:true}).fitBounds(NYC_BOUNDS);
}
async function download(url){const response=await fetch(url);if(!response.ok) throw new Error(`HTTP ${response.status}`);return response.json();}
async function loadGeography(){
  try { const source=await download(LOCAL_GEOJSON);return {source,location:'versioned local snapshot'}; }
  catch (_){ const source=await download(OFFICIAL_GEOJSON);return {source,location:'NYC Open Data (live development fallback)'}; }
}
function baseStyle(record){
  const fill=BOROUGH_COLORS[record.borough] || '#cbd5dc';
  if(ui.borough.value==='all') return {color:fill,weight:.5,opacity:1,fillColor:fill,fillOpacity:1};
  return {color:'#ffffff',weight:1.2,opacity:1,fillColor:record.special?'#cad4da':fill,fillOpacity:.96};
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
  ui['detail-intro'].textContent='Choose a borough on the map or use the buttons above to explore its neighborhoods. Data layers will be introduced after verification.';
  writeMeta([['Geographic coverage','New York City'],['Boroughs','5'],['2020 NTAs',String(records.length)]]);
}
function boroughProfile(borough){
  const local=filterNtas(records,borough);
  ui['detail-name'].textContent=borough;
  ui['detail-intro'].textContent='Select a neighborhood polygon to open its profile. Light gray polygons identify special-purpose areas.';
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
    layer.setStyle(r===record?{color:'#143752',weight:3,fillColor:'#ffe097',fillOpacity:1}:baseStyle(r));
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
  for(const id of ['borough','neighborhood','search-button','reset'])ui[id].disabled=false;
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
      layer.on('mouseover',()=>{if(ui.borough.value!=='all'&&selected!==r)layer.setStyle({weight:2,color:'#1c4557'});});
      layer.on('mouseout',()=>{if(selected!==r)layer.setStyle(baseStyle(r));});
    }}).addTo(map);
    boroughLabels=L.layerGroup();
    for(const [borough,point] of Object.entries(LABEL_COORDS)){
      const icon=L.divIcon({className:'borough-label',html:'<span>'+borough+'</span>',iconSize:[146,42],iconAnchor:[73,21]});
      L.marker(point,{icon,keyboard:true,title:'Explore '+borough}).on('click',()=>switchBorough(borough)).addTo(boroughLabels);
    }
    wire();render();
    if(geoLayer.getLayers().length !== records.length || !plausibleNYCBounds(geoLayer.getBounds())) {
      throw new Error("NTA polygons could not be placed within the expected New York City map extent. Check the GeoJSON coordinate reference system.");
    }
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
