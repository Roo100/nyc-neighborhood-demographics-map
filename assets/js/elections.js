// Official 2025 NYC BOE mayoral election results: CITYWIDE only.
// No district-to-NTA/election-district geographic inference or turnout claims.
export const MAYOR_2025_CITYWIDE='data/elections/mayor_2025_verified_citywide.json';
export const BOE_2025_RESULTS='https://www.vote.nyc/page/election-results-summary-2025';
export const REQUIRED_CANDIDATES=[
  'Zohran Kwame Mamdani','Andrew M. Cuomo','Curtis A. Sliwa',
  'Eric L. Adams','Scattered write-in votes','Irene Estrada','Jim Walden','Joseph Hernandez'
];
export function validateCitywideMayoralResult(data){
  if(data?.status!=='VERIFIED_OFFICIAL_2025_MAYOR_CITYWIDE_ONLY'
      ||data.election_date!=='2025-11-04'||data.geographic_resolution!=='CITYWIDE_ONLY'
      ||data.total_ballots!==2218647||data.total_candidate_and_write_in_votes!==2194204
      ||data.unrecorded_ballots!==24443
      ||!Array.isArray(data.candidates)||data.candidates.length!==REQUIRED_CANDIDATES.length
      ||typeof data.source_ed_csv_sha256!=='string'||!/^[a-f0-9]{64}$/.test(data.source_ed_csv_sha256)
      ||typeof data.source_certified_recap_sha256!=='string'
      ||!/^[a-f0-9]{64}$/.test(data.source_certified_recap_sha256)){
    throw new Error('Official BOE 2025 citywide result source/denominator validation failed');
  }
  const actual=data.candidates.map(r=>r.name);
  if(JSON.stringify(actual)!==JSON.stringify(REQUIRED_CANDIDATES))
    throw new Error('Unexpected or unsorted candidate names in BOE 2025 election summary');
  let sum=0,last=Infinity;
  for(const candidate of data.candidates){
    if(!Number.isInteger(candidate.votes)||candidate.votes<0||candidate.votes>last
       ||!Number.isFinite(candidate.vote_share_pct) ||
       Math.abs(candidate.vote_share_pct-100*candidate.votes/data.total_candidate_and_write_in_votes)>.006)
       throw new Error('Malformed 2025 mayoral candidate count or vote share');
    sum+=candidate.votes;
    last=candidate.votes;
  }
  if(sum!==data.total_candidate_and_write_in_votes
      ||data.total_candidate_and_write_in_votes+data.unrecorded_ballots!==data.total_ballots
      ||!Array.isArray(data.counties)||data.counties.length!==5
      ||data.counties.reduce((n,c)=>n+c.ballots,0)!==data.total_ballots)
    throw new Error('2025 mayor certified citywide election totals do not reconcile');
  return data;
}
