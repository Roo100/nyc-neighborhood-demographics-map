// Polling locations from NYS GIS / NYS and NYC Boards of Elections, October 2026.
// These are site locations, NOT voter-to-polling-place assignments.
const SERVICE='https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Elections_Districts_and_Polling_Locations/FeatureServer';
export const OFFICIAL_POLL_LOOKUP='https://www.vote.nyc/page/find-your-poll-site';
const LAYERS={early:1,day:3};
export async function fetchNYCPollSites(kind){
  if(!(kind in LAYERS))throw new Error('Unknown polling-site category');
  const features=[];
  // The official service limits responses to 1,000 records. Page through it
  // instead of silently omitting NYC sites in the last pages.
  for(let page=0;page<20;page++){
    const params=new URLSearchParams({
      where:'1=1',outFields:'OBJECTID,Poll_Site_Name,Poll_Site_Address,City,ZipCode,County',
      outSR:'4326',returnGeometry:'true',orderByFields:'OBJECTID ASC',
      resultOffset:String(page*1000),resultRecordCount:'1000',f:'geojson'
    });
    const response=await fetch(SERVICE+'/'+LAYERS[kind]+'/query?'+params.toString());
    if(!response.ok)throw new Error('Polling location service returned HTTP '+response.status);
    const data=await response.json();
    if(data.error||data.type!=='FeatureCollection'||!Array.isArray(data.features))
      throw new Error('Official polling location response unavailable or invalid');
    for(const feature of data.features){
      const coordinates=feature.geometry?.coordinates,p=feature.properties||{};
      if(feature.geometry?.type!=='Point'||!Array.isArray(coordinates))continue;
      const [lng,lat]=coordinates;
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<40.45||lat>41.0||lng< -74.3||lng> -73.65)continue;
      if(!p.Poll_Site_Address&&!p.Poll_Site_Name)continue;
      features.push({id:String(p.OBJECTID),lat,lng,name:String(p.Poll_Site_Name||'Polling site'),
        address:String(p.Poll_Site_Address||''),city:String(p.City||''),zip:String(p.ZipCode||''),
        county:String(p.County||'')});
    }
    if(data.features.length<1000)break;
    if(page===19)throw new Error('Polling location results exceeded safety pagination limit');
  }
  if(!features.length)throw new Error('No validated NYC polling locations returned');
  return features;
}
