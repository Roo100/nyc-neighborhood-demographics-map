import {BOROUGHS,validNtas,filterNtas,findNta} from './nta.js';
const LOCAL_GEOJSON = 'data/nta2020.geojson';
const OFFICIAL_GEOJSON = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson?$limit=5000';
const NYC_BOUNDS = [[40.49,-74.27],[40.94,-73.68]];
// A bad or differently projected polygon must not zoom the map out to the world.
function plausibleNYCBounds(bounds){
  return bounds?.isValid() && bounds.getSouth() >= 40.30 && bounds.getNorth() <= 41.10 &&
    bounds.getWest() >= -74.60 && bounds.getEast() <= -73.40;
}
function fitNYCBounds(bounds, options={padding:[22,22]}){
  map.fitBounds(plausibleNYCBounds(bounds) ? bounds : NYC_BOUNDS, options);
}
const ui = Object.fromEntries(['borough','neighborhood','nta-options','search-button','reset','status','detail-name','detail-intro','detail-meta','feature-count'].map(id=>[id,document.getElementById(id)]));
let records=[], map, geoLayer, selected=null, byCode=new Map();
function status(message,error=false){ui.status.textContent=message;ui.status.classList.toggle('error',error);}
function startMap(){
  if(!window.L) throw new Error('Leaflet failed to load. Check your network connection.');
  map=L.map('map',{zoomControl:true,scrollWheelZoom:true,minZoom:8}).fitBounds(NYC_BOUNDS);
  // OpenStreetMap Standard does not require a commercial API key. See https://operations.osmfoundation.org/policies/tiles/
  // Keep the boundary vectors usable even if the background tile provider is unavailable.
  const basemap = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom:19
  }).addTo(map);
  let tileErrors = 0;
  basemap.on('tileerror', () => {
    if (++tileErrors === 4) {
      map.removeLayer(basemap);
      status('Background map tiles are unavailable. Official neighborhood polygons remain interactive on the plain map.', true);
    }
  });
}
async function download(url){const response=await fetch(url);if(!response.ok) throw new Error(`HTTP ${response.status}`);return response.json();}
async function loadGeography(){
  try { const source=await download(LOCAL_GEOJSON);return {source,location:'versioned local snapshot'}; }
  catch (_){ const source=await download(OFFICIAL_GEOJSON);return {source,location:'NYC Open Data (live development fallback)'}; }
}
function baseStyle(record){return {color:'#ffffff',weight:1,opacity:1,fillColor:record.special?'#c9cbd8':'#827ca9',fillOpacity:record.special?.48:.56};}
function display(record){
  selected=record;
  ui['detail-name'].textContent=record.name;
  ui['detail-intro'].textContent=record.special?'Official special-purpose geographic area; may have limited or no residential population.':'Official 2020 Neighborhood Tabulation Area. Demographic and election results have not been attached.';
  ui['detail-meta'].replaceChildren();
  for(const [label,value] of [['Borough',record.borough],['2020 NTA code',record.code],['Area classification',record.special?'Special purpose':'Residential'],['NTA type code',record.ntaType||'Not provided']]){
    const dt=document.createElement('dt');dt.textContent=label;const dd=document.createElement('dd');dd.textContent=value;ui['detail-meta'].append(dt,dd);
  }
  geoLayer.eachLayer(layer => {const r=byCode.get(layer.feature.properties.__ntaCode);layer.setStyle(r===record?{color:'#f4b943',weight:3,fillColor:'#39437d',fillOpacity:.9}:baseStyle(r));});
  const layer=geoLayer.getLayers().find(x=>x.feature.properties.__ntaCode===record.code);
  if(layer){layer.bringToFront();fitNYCBounds(layer.getBounds(),{padding:[35,35],maxZoom:14});}
}
function render(){
  const borough=ui.borough.value;
  const visible=filterNtas(records,borough);
  geoLayer.clearLayers();
  const collection={type:'FeatureCollection',features:visible.map(r=>r.feature)};
  geoLayer.addData(collection);
  ui['feature-count'].textContent=visible.length.toLocaleString();
  ui['nta-options'].replaceChildren();
  for(const r of visible.slice().sort((a,b)=>a.name.localeCompare(b.name))){const option=document.createElement('option');option.value=`${r.name} (${r.code})`;ui['nta-options'].append(option);}
  if(selected && !visible.includes(selected)){selected=null;ui['detail-name'].textContent='Select a neighborhood';ui['detail-intro'].textContent='Click a polygon or search for a 2020 NTA.';ui['detail-meta'].replaceChildren();}
  if(visible.length) fitNYCBounds(geoLayer.getBounds());
}
function search(){const found=findNta(records,ui.neighborhood.value,ui.borough.value);if(found){display(found);status(`Selected ${found.name} (${found.code}), ${found.borough}.`);}else{status('No matching NTA in the selected borough. Try another spelling or clear the borough filter.',true);}}
function wire(){
  for(const b of BOROUGHS){const o=document.createElement('option');o.value=b;o.textContent=b;ui.borough.append(o);}
  for(const id of ['borough','neighborhood','search-button','reset']) ui[id].disabled=false;
  ui.borough.addEventListener('change',()=>{ui.neighborhood.value='';render();status(`Showing ${ui['feature-count'].textContent} NTAs in ${ui.borough.value==='all'?'all five boroughs':ui.borough.value}.`);});
  ui['search-button'].addEventListener('click',search);
  ui.neighborhood.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();search();}});
  ui.reset.addEventListener('click',()=>{ui.borough.value='all';ui.neighborhood.value='';selected=null;ui['detail-name'].textContent='Select a neighborhood';ui['detail-intro'].textContent='Click a polygon or search for a 2020 NTA.';ui['detail-meta'].replaceChildren();render();status('Showing all five boroughs.');});
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
      layer.on('click',()=>{display(r);status(`Selected ${r.name} (${r.code}), ${r.borough}.`);});
      layer.on('mouseover',()=>{if(selected!==r)layer.setStyle({weight:2,color:'#2d315a'});});
      layer.on('mouseout',()=>{if(selected!==r)layer.setStyle(baseStyle(r));});
    }}).addTo(map);
    wire();render();
    if(records.length===262)status(`Loaded ${records.length} official 2020 NTA polygons from ${location}. Geographic-only milestone; no demographic data inferred.`);
  }catch(error){console.error(error);status(`Unable to load the map: ${error.message}. Check connectivity and the GeoJSON source.`,true);}
}
init();
