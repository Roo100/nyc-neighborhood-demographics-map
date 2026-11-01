// Civic category catalog informed by BetaNYC Boundaries' public navigation.
// Only entries with a pinned and validated NYC POP! dataset are mapped here.
// Other entries link to BetaNYC; do not fabricate geographic assignments.
const BETA='https://boundaries.beta.nyc/';
const linked=code=>code?BETA+'?map='+code:BETA;
export const CIVIC_CATEGORY_GROUPS=[
  {id:'representation',label:'Representation & community',items:[
    {id:'community',label:'Community districts',emoji:'💬',native:'community',code:'cd',description:'Official 2026 community board districts and their overlapping boundaries.'},
    {id:'council',label:'City Council districts',emoji:'🍎',native:'council',code:'cc',description:'NYC City Council legislative district boundaries (2026). Party registration is a separate measure.'},
    {id:'assembly',label:'State Assembly districts',emoji:'🧑‍⚖️',native:'assembly',code:'sa',description:'2026 New York State Assembly districts intersecting NYC.'},
    {id:'senate',label:'State Senate districts',emoji:'⚖️',native:'senate',code:'ss',description:'2026 New York State Senate districts intersecting NYC.'},
    {id:'congress',label:'Congressional districts',emoji:'🇺🇸',native:'congress',code:'nycongress',description:'2026 U.S. House districts intersecting New York City.'}
  ]},
  {id:'schools',label:'Schools & education',items:[
    {id:'schooldistricts',label:'School districts',emoji:'🎓',native:'schooldistricts',code:'sd',description:'The 32 NYC geographic school districts. These are not elementary/middle school attendance zones.'},
    {id:'schoolsites',label:'K–12 school locations',emoji:'🏫',native:'schoolsites',description:'Mapped NYSED school locations, not school attendance-zone assignments.'}
  ]},
  {id:'services',label:'Safety & city services',items:[
    {id:'precincts',label:'Police precincts',emoji:'🚔',code:'pp'},
    {id:'policesectors',label:'Police sectors',emoji:'🚨'},
    {id:'sanitation',label:'Sanitation districts',emoji:'🗑️',code:'dsny'},
    {id:'fire',label:'Fire battalions',emoji:'🔥',code:'fb'},
    {id:'health',label:'Health center districts',emoji:'🩺',code:'hc'},
    {id:'uhf',label:'UHF 42 neighborhoods',emoji:'🏥'}
  ]},
  {id:'planning',label:'Neighborhoods & planning',items:[
    {id:'nta',label:'Neighborhood tabulation areas',emoji:'🏘️',native:'nta',code:'nta',description:'Official 2020 Neighborhood Tabulation Areas, not exact everyday neighborhood boundaries.'},
    {id:'historic',label:'Historic districts',emoji:'🗝️',code:'hd'},
    {id:'bid',label:'Business improvement districts',emoji:'💸',code:'bid'},
    {id:'nda',label:'Neighborhood development areas',emoji:'🏗️'},
    {id:'ibz',label:'Industrial business zones',emoji:'🏭',code:'ibz'},
    {id:'puma',label:'Public Use Microdata Areas',emoji:'📋'},
    {id:'cdta',label:'Citywide district tabulation areas',emoji:'📊'},
    {id:'zip',label:'ZIP codes',emoji:'📫'}
  ]},
  {id:'elections',label:'Voting & courts',items:[
    {id:'election',label:'Election districts',emoji:'🗳️'},
    {id:'court',label:'Municipal court districts',emoji:'⚖️'}
  ]}
];
export const CIVIC_CATEGORIES=CIVIC_CATEGORY_GROUPS.flatMap(group=>group.items.map(item=>({
  ...item,group:group.id,source:linked(item.code),
  description:item.description||'This boundary category is not yet verified and mapped locally in NYC POP!.'
})));
export function getCivicCategory(id){return CIVIC_CATEGORIES.find(item=>item.id===id)||null;}
export function civicCategoryIsMapped(item){return !!item?.native;}
