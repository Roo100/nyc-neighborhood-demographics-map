// BetaNYC-style category browser for NYC POP!. Locally mapped categories
// use already validated pinned boundaries; other categories are references only.
import {CIVIC_CATEGORY_GROUPS,getCivicCategory} from './civic-categories.js';
import {parseBoroCd,lookupCommunityDistrict,lookupPolygonAtPoint} from './civic.js';
import {identifyLegislators,officialForDistrict} from './representation.js';
import {EXTRA_CIVIC_SOURCES,fetchOfficialExtraCivic} from './extra-civic.js';

export function createCivicExplorer({map,getData,getPoint,onPoint,onBaseMode,onStatus}){
  const L=window.L;
  const host=document.getElementById('civic-category-groups');
  const result=document.getElementById('civic-category-result');
  const clearButton=document.getElementById('civic-explorer-clear');
  if(!host||!result||!clearButton||!L)throw new Error('NYC civic explorer controls unavailable');
  let selected=null, overlay=null;
  const officialExtra=new Map(),pendingExtra=new Map(),extraErrors=new Map();

  function recordsFor(category,data){
    if(category&&EXTRA_CIVIC_SOURCES[category.id])return officialExtra.get(category.id)?.records||[];
    switch(category?.native){
      case 'community':return data.communityBoards||[];
      case 'schooldistricts':return data.schoolDistricts||[];
      case 'nta':return data.records||[];
      case 'council':case 'senate':case 'assembly':case 'congress':
        return data.legislativeLookup?.[category.native]?.records||[];
      default:return [];
    }
  }
  function pointResult(category,point,data){
    if(!point)return 'Click a location on the map to identify the selected district.';
    if(category.native==='schoolsites')return 'K–12 schools are individual sites, not attendance-zone boundaries.';
    const lat=point.lat,lng=point.lng;
    let hit;
    if(EXTRA_CIVIC_SOURCES[category.id]){
      hit=lookupPolygonAtPoint(officialExtra.get(category.id)?.index,lat,lng);
      if(hit.status==='match')return hit.record.name;
    }else if(category.native==='community'){
      hit=lookupCommunityDistrict(data.communitySpatialIndex,lat,lng);
      if(hit.status==='board')return hit.record.name;
      if(hit.status==='joint_interest')return 'Joint Interest Area — no ordinary community board';
    }else if(category.native==='schooldistricts'){
      hit=lookupPolygonAtPoint(data.schoolDistrictSpatialIndex,lat,lng);
      if(hit.status==='match')return 'Geographic School District '+hit.record.code+' (not a school attendance zone)';
    }else if(category.native==='nta'){
      hit=lookupPolygonAtPoint(data.ntaSpatialIndex,lat,lng);
      if(hit.status==='match')return hit.record.name;
    }else if(['council','senate','assembly','congress'].includes(category.native)){
      hit=identifyLegislators(data.legislativeLookup||{},lat,lng)[category.native];
      if(hit?.status==='match'){
        const name=officialForDistrict(data.legislativeOfficials,category.native,hit.record.code);
        return 'District '+hit.record.code+(name?' · '+name:' · verify current representative with official directory');
      }
    }
    if(hit?.status==='boundary')return 'District boundary — confirm the exact address';
    if(hit?.status==='unavailable')return 'Boundary source still loading or unavailable';
    return 'No matching mapped district at this location';
  }
  function renderStatus(){
    result.replaceChildren();
    const category=getCivicCategory(selected);
    if(!category){
      result.textContent='Choose a category above. Verified boundaries appear on the NYC map. Additional categories open the BetaNYC reference while local data are reviewed.';
      return;
    }
    const title=document.createElement('strong');
    title.textContent=category.emoji+' '+category.label;
    result.append(title);
    const info=document.createElement('p');
    const data=getData();
    if(!category.native){
      info.textContent='This boundary category has not yet been verified for mapping inside NYC POP!.';
    }else if(category.native==='schoolsites'){
      info.textContent=data.schoolMarkers?
        'K–12 school locations are available in the map’s School locations layer. Zoom in for school pins.':
        'The K–12 school-location layer is still loading or temporarily unavailable.';
    }else{
      const count=recordsFor(category,data).length;
      if(EXTRA_CIVIC_SOURCES[category.id]&&pendingExtra.has(category.id)){
        info.textContent='Loading official NYC Open Data boundaries for this category…';
      }else if(EXTRA_CIVIC_SOURCES[category.id]&&extraErrors.has(category.id)){
        info.textContent='The official boundaries could not be loaded or did not pass validation. Select the category again to retry. No substitute districts are shown.';
      }else{
        info.textContent=count?
          count.toLocaleString()+' verified district features · '+pointResult(category,getPoint(),data):
          'Verified geographic data are loading or temporarily unavailable.';
      }
    }
    result.append(info);
    const description=document.createElement('p');
    description.className='civic-category-description';
    description.textContent=category.description;
    result.append(description);
    if(!category.native||category.native==='schoolsites'||EXTRA_CIVIC_SOURCES[category.id]){
      const link=document.createElement('a');
      link.href=category.native==='schoolsites'?'https://schoolsearch.schools.nyc/':
        EXTRA_CIVIC_SOURCES[category.id]?.source||category.source;
      link.target='_blank';link.rel='noopener noreferrer';
      link.textContent=category.native==='schoolsites'?'Check school zoning by address · NYCPS':
        EXTRA_CIVIC_SOURCES[category.id]?'View official NYC Open Data source':'Explore this category on BetaNYC';
      result.append(link);
    }
  }
  function updateButtons(){
    host.querySelectorAll('button[data-civic-category]').forEach(button=>{
      const active=button.dataset.civicCategory===selected;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function clearOverlay(){
    if(overlay&&map.hasLayer(overlay))map.removeLayer(overlay);
    overlay=null;
  }
  function clear(){
    clearOverlay();selected=null;updateButtons();renderStatus();
  }
  function select(id){
    const category=getCivicCategory(id);
    if(!category)return;
    clearOverlay();selected=id;updateButtons();
    const source=EXTRA_CIVIC_SOURCES[id];
    if(source&&!officialExtra.has(id)){
      if(!pendingExtra.has(id)){
        extraErrors.delete(id);
        const request=fetchOfficialExtraCivic(id);
        pendingExtra.set(id,request);
        request.then(validated=>{
          officialExtra.set(id,validated);
          pendingExtra.delete(id);
          extraErrors.delete(id);
          if(selected===id)select(id);
        }).catch(error=>{
          pendingExtra.delete(id);
          extraErrors.set(id,error?.message||'Unknown geometry error');
          console.warn('Official '+id+' boundaries unavailable:',error);
          if(selected===id){
            renderStatus();
            onStatus(source.title+' boundaries could not be verified; source link remains available.');
          }
        });
      }
      renderStatus();
      onStatus('Loading '+source.title+' polygons from official NYC Open Data…');
      return;
    }
    const data=getData();
    if(category.native==='schoolsites'){
      if(data.schoolMarkers){
        onBaseMode('schools');
        onStatus('Viewing official K–12 school sites; school attendance zones require address-based verification.');
      }
      renderStatus();
      return;
    }
    const items=recordsFor(category,data);
    if(!category.native||!items.length){renderStatus();return;}
    onBaseMode('nta');
    // GeoJSON Feature objects correspond directly to these verified local
    // records. Do not infer that boundary categories share the same geometry.
    const byFeature=new Map(items.map(item=>[item.feature,item]));
    overlay=L.geoJSON({type:'FeatureCollection',features:items.map(item=>item.feature)},{
      bubblingMouseEvents:false,
      style:()=>({color:'#241039',weight:2.6,opacity:1,fillColor:'#00D9FF',fillOpacity:.08}),
      onEachFeature:(feature,layer)=>{
        const item=byFeature.get(feature);
        let title=item?.name;
        if(!title&&category.native==='community')title=parseBoroCd(feature)?.name;
        if(!title&&category.native==='schooldistricts')title='School District '+feature.properties?.district;
        if(!title&&item?.code)title='District '+item.code;
        layer.bindTooltip(title||category.label,{sticky:true,direction:'top'});
        layer.on('click',event=>{
          if(event.originalEvent)L.DomEvent.stopPropagation(event.originalEvent);
          const current=getData();
          const nta=lookupPolygonAtPoint(current.ntaSpatialIndex,event.latlng.lat,event.latlng.lng);
          onPoint(event.latlng,nta.status==='match'?nta.record:null);
        });
      }
    }).addTo(map);
    overlay.bringToFront();
    renderStatus();
    onStatus('Showing '+category.label+' boundaries. Click an area to identify this district and the surrounding civic geography.');
  }
  function refreshData(){
    const category=getCivicCategory(selected);
    if(category?.native&&!overlay&&category.native!=='schoolsites'&&recordsFor(category,getData()).length){
      select(category.id);
    }else renderStatus();
  }
  function refreshPoint(){renderStatus();}
  function bringToFront(){if(overlay&&map.hasLayer(overlay))overlay.bringToFront();}

  host.replaceChildren();
  for(const group of CIVIC_CATEGORY_GROUPS){
    const details=document.createElement('details');
    details.className='civic-category-group';
    details.open=group.id==='representation'||group.id==='schools';
    const summary=document.createElement('summary');
    summary.textContent=group.label+' ('+group.items.length+')';
    details.append(summary);
    const controls=document.createElement('div');
    controls.className='civic-category-buttons';
    for(const cat of group.items){
      const button=document.createElement('button');
      button.type='button';
      button.className='civic-category-button';
      button.dataset.civicCategory=cat.id;
      button.setAttribute('aria-pressed','false');
      const label=document.createElement('span');
      label.textContent=cat.emoji+' '+cat.label;
      const meta=document.createElement('small');
      meta.textContent=EXTRA_CIVIC_SOURCES[cat.id]?'NYC Open Data layer':cat.native?'Map available':'Reference';
      button.append(label,meta);controls.append(button);
    }
    details.append(controls);host.append(details);
  }
  host.addEventListener('click',event=>{
    const target=event.target.closest('button[data-civic-category]');
    if(target)select(target.dataset.civicCategory);
  });
  clearButton.addEventListener('click',clear);
  renderStatus();
  function selectedBoundaryAt(point){
    const category=getCivicCategory(selected);
    if(!category?.native||!point||category.native==='schoolsites')return null;
    return {label:category.label,value:pointResult(category,point,getData())};
  }
  return {clear,select,refreshData,refreshPoint,bringToFront,selectedBoundaryAt};
}
