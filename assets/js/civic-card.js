// Point-based NYC civic card data. Do not infer a district from an NTA,
// a nearby school, a borough label, or demographics.
import {OFFICIAL_LEGISLATIVE_DIRS,officialForDistrict} from './representation.js';
import {DOE_MYSCHOOLS,DOE_ZONING_INFO} from './education.js';

export const SCHOOL_ZONE_FINDER='https://schoolsearch.schools.nyc/';
export const BOARD_DIRECTORY='https://www.nyc.gov/site/communityboards/index.page';

function districtValue(match,kind,officials){
  if(match?.status==='match'){
    const code=match.record?.code;
    if(!Number.isInteger(code))return 'District not verified';
    const official=officialForDistrict(officials,kind,code);
    return official?official+' · District '+code:'District '+code+' · representative name not verified';
  }
  if(match?.status==='boundary')return 'District boundary · verify exact address';
  if(match?.status==='unavailable')return 'District data loading / unavailable';
  return 'No district identified at this point';
}
export function buildCivicCard({neighborhood,boardMatch,schoolMatch,legislators,officials,boroughPresidents}){
  const borough=neighborhood?.borough||boardMatch?.record?.borough||null;
  let board;
  switch(boardMatch?.status){
    case 'board':board=boardMatch.record.name;break;
    case 'joint_interest':board='Joint Interest Area · not a regular community board';break;
    case 'boundary':board='Community board boundary · verify exact address';break;
    case 'unavailable':board='Community board data loading / unavailable';break;
    default:board='No community board identified at this point';
  }
  let school;
  if(schoolMatch?.status==='match')school='Geographic School District '+schoolMatch.record.code;
  else if(schoolMatch?.status==='boundary')school='District boundary · verify address';
  else if(schoolMatch?.status==='unavailable')school='School district data loading / unavailable';
  else school='No geographic district identified';
  return {
    title:neighborhood?.name||'Selected NYC location',
    borough:borough||'NYC',
    board,
    school,
    officials:[
      ['Borough president',borough&&boroughPresidents?.[borough]||'Borough not verified'],
      ['City Council',districtValue(legislators?.council,'council',officials)],
      ['NY State Senate',districtValue(legislators?.senate,'senate',officials)],
      ['NY State Assembly',districtValue(legislators?.assembly,'assembly',officials)],
      ['U.S. House',districtValue(legislators?.congress,'congress',officials)]
    ],
    schoolZoneNotice:'Elementary and middle school attendance zones are address- and grade-specific. This geographic district is NOT a school zone. Verify a home address and grade with NYC Public Schools. High-school admissions are generally not assigned by this district.',
    schoolFinder:SCHOOL_ZONE_FINDER,
    links:[
      ['Community board contacts',BOARD_DIRECTORY],
      ['Council directory',OFFICIAL_LEGISLATIVE_DIRS.council],
      ['Senate directory',OFFICIAL_LEGISLATIVE_DIRS.senate],
      ['Assembly directory',OFFICIAL_LEGISLATIVE_DIRS.assembly],
      ['House directory',OFFICIAL_LEGISLATIVE_DIRS.congress],
      ['School admissions',DOE_MYSCHOOLS],
      ['School zoning guidance',DOE_ZONING_INFO]
    ]
  };
}
