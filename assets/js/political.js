// Verified NYC Board of Elections voter registration by *City Council district*.
// Not votes cast, not party vote share, and not a 2020 NTA statistic.
export const ENROLLMENT_FILE='data/political/council_enrollment_2026.json';
export const ENROLLMENT_SOURCE='https://www.vote.nyc/sites/default/files/pdf/vote/2026/CityCouncil_Enrollment_Feb2026.pdf';
export const PARTY_OPTIONS={
  democrat:'Democratic enrollment share',
  republican:'Republican enrollment share',
  unaffiliated:'Unaffiliated enrollment share',
  working_families:'Working Families enrollment share',
  dominant:'Largest enrollment category'
};
const PARTIES={
  democrat:'Democratic',republican:'Republican',
  unaffiliated:'Unaffiliated (Blank)',working_families:'Working Families'
};
export const PARTY_PALETTE=['#f5faff','#cfe9ff','#9acaff','#539bdf','#215a9f'];
export const PARTY_DOMINANT_COLORS={
  Democratic:'#338ad1',Republican:'#e35f69',
  Conservative:'#a77524','Working Families':'#b067bc',
  Other:'#7a7195','Unaffiliated (Blank)':'#95a8b4'
};
const CATEGORIES=['Democratic','Republican','Conservative','Working Families','Other','Unaffiliated (Blank)'];
export function validateCouncilEnrollment(data){
  if(data?.status!=='OFFICIAL_BOE_2026_COUNCIL_ENROLLMENT_VERIFIED'||
    data.as_of!=='2026-02-20'||data.district_count!==51||
    data.pdf_pages!==56||data.raw_district_county_sections!==55||
    data.source_url!==ENROLLMENT_SOURCE||
    !Array.isArray(data.districts)||data.districts.length!==51)
    throw new Error('BOE Council enrollment source or version mismatch');
  const records=new Map();
  for(const r of data.districts){
    const code=r?.district;
    if(!Number.isInteger(code)||code<1||code>51||records.has(code))
      throw new Error('Unexpected duplicate NYC Council enrollment district');
    for(const status of ['active','inactive','total']){
      if(!r[status]||!CATEGORIES.every(k=>Number.isInteger(r[status][k])&&r[status][k]>=0)||
        !Number.isInteger(r[status].Total)||
        CATEGORIES.reduce((sum,k)=>sum+r[status][k],0)!==r[status].Total)
        throw new Error('BOE source party columns mismatch for Council District '+code);
    }
    for(const name of [...CATEGORIES,'Total']){
      if(r.active[name]+r.inactive[name]!==r.total[name])
        throw new Error('Active+inactive != total for '+code+' / '+name);
    }
    records.set(code,r);
  }
  if(records.size!==51||![...records.keys()].every(n=>n<=51))
    throw new Error('BOE source missing a Council district');
  const total=[...records.values()].reduce((acc,r)=>acc+r.total.Total,0);
  if(total!==5359345)throw new Error('BOE 2026 source overall total differs from official PDF audit');
  return records;
}
export function largestEnrollmentCategory(row,status='active'){
  if(!row?.[status])return null;
  const entries=CATEGORIES.map(name=>({name,count:row[status][name]}))
    .sort((a,b)=>b.count-a.count);
  const first=entries[0],second=entries[1];
  if(!first||!Number.isFinite(first.count)||first.count<=0)return null;
  if(second?.count===first.count)return {name:'Tie',count:first.count};
  return first;
}
export function enrollmentShare(row,choice='democrat',status='active'){
  if(!row?.[status]||row[status].Total===0)return null;
  const party=PARTIES[choice];
  return party?100*row[status][party]/row[status].Total:null;
}
export function partyFill(row,choice){
  if(!row)return '#cbd5d9';
  if(choice==='dominant'){
    const largest=largestEnrollmentCategory(row);
    return PARTY_DOMINANT_COLORS[largest?.name]||'#cbd5d9';
  }
  const share=enrollmentShare(row,choice);
  if(!Number.isFinite(share))return '#cbd5d9';
  const idx=Math.min(4,Math.floor(share/20));
  return PARTY_PALETTE[idx];
}
export function partyLegend(choice){
  if(choice==='dominant')return {
    title:'Largest enrollment category · Feb 2026',
    entries:Object.entries(PARTY_DOMINANT_COLORS).map(([label,color])=>({label,color}))
  };
  return {
    title:PARTY_OPTIONS[choice]+' · active voters, Feb 2026',
    entries:['Under 20%','20–40%','40–60%','60–80%','80–100%']
      .map((label,i)=>({label,color:PARTY_PALETTE[i]}))
  };
}
export function enrollmentDetails(row,status='active'){
  if(!row?.[status])return null;
  const total=row[status].Total;
  return {district:row.district,total,status,asOf:'2026-02-20',
    parties:CATEGORIES.map(name=>({name,count:row[status][name],
      share:total?100*row[status][name]/total:null})),
    largest:largestEnrollmentCategory(row,status)};
}
