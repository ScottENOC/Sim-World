const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
let nextOrganisationId=1,nextMotionId=1;

export const ORGANISATION_LEVELS=Object.freeze({
  conference:{id:'conference',label:'Conference system',capacity:.20},
  secretariat:{id:'secretariat',label:'Permanent secretariat',capacity:.38},
  assembly:{id:'assembly',label:'International assembly',capacity:.58},
  treaty:{id:'treaty',label:'Treaty organisation',capacity:.72},
  collective_security:{id:'collective_security',label:'Collective-security organisation',capacity:.86},
  global:{id:'global',label:'Global institution',capacity:1},
});
export const MOTION_TYPES=Object.freeze({
  condemn_war:{id:'condemn_war',label:'Condemn a war',difficulty:.25},
  mediate_peace:{id:'mediate_peace',label:'Mediate a peace',difficulty:.38},
  sanctions:{id:'sanctions',label:'Coordinate sanctions',difficulty:.52},
  arms_limits:{id:'arms_limits',label:'Arms limitation treaty',difficulty:.55},
  pandemic_coordination:{id:'pandemic_coordination',label:'Pandemic coordination',difficulty:.34},
  climate_action:{id:'climate_action',label:'Climate action accord',difficulty:.58},
  pollution_control:{id:'pollution_control',label:'Global pollution controls',difficulty:.52},
  scientific_monitoring:{id:'scientific_monitoring',label:'International scientific monitoring',difficulty:.28},
});
function polityId(r){return r?.governance?.sovereignPolityId||r?.polityId||null;}
function territories(polity,regions){return (regions||[]).filter(r=>polityId(r)===polity.id);}
function weighted(rs,fn){let s=0,w=0;for(const r of rs){const p=Math.max(1,Number(r.population)||1);s+=clamp(fn(r))*p;w+=p;}return w?s/w:0;}
function literacy(r){return clamp(r.massEducation?.literacy??r.publicEducation?.literacy??r.educationLevel??0);}
function hasTech(r,id){return Boolean(r.unlockedTechIds?.has?.(id));}
function comms(r){return clamp((hasTech(r,'electrical_telegraphy')?.25:0)+(hasTech(r,'telephone_networks')?.16:0)+(hasTech(r,'radio_broadcasting')?.18:0)+(hasTech(r,'printing_press')?.12:0)+(r.communicationState?.messengerExperience||0)/800);}
function admin(polity,rs){return clamp((polity.administration?.officialdom||0)*.3+(polity.administration?.recordKeeping||0)*.25+(polity.administration?.communications||0)*.2+weighted(rs,r=>r.governance?.administrativeControl??.25)*.25);}
function economicWeight(polity,rs){return rs.reduce((n,r)=>n+Math.max(0,Number(r.wallet)||0)+Math.max(0,Number(r.treasury)||0)+Math.max(0,Number(r.population)||0)*.002,0);}
function militaryWeight(polity,rs){return rs.reduce((n,r)=>n+(Number(r.army?.personnel)||0)+(Number(r.navy?.personnel)||0)*1.6,0);}
export function powerScore(polity,regions){const rs=territories(polity,regions);return Math.sqrt(Math.max(1,economicWeight(polity,rs)))*.48+Math.sqrt(Math.max(1,militaryWeight(polity,rs)))*.36+Math.sqrt(Math.max(1,rs.reduce((n,r)=>n+(r.population||0),0)))*.16;}
export function identifyMajorPowers(polities,regions,count=5){return [...(polities||[])].sort((a,b)=>powerScore(b,regions)-powerScore(a,regions)).slice(0,Math.max(1,count)).map(p=>p.id);}

export function worldInstitutionReadiness(polities,regions,activeWars=[]){
  const rs=regions||[];const connectivity=weighted(rs,r=>comms(r)*.65+literacy(r)*.35);const administration=(polities||[]).length?polities.reduce((n,p)=>n+admin(p,territories(p,rs)),0)/(polities.length||1):0;
  const diplomaticDensity=clamp(rs.reduce((n,r)=>n+(r.relations instanceof Map?r.relations.size:0),0)/Math.max(1,rs.length*Math.max(2,Math.sqrt(rs.length))));
  const warTrauma=(polities||[]).length?polities.reduce((n,p)=>n+clamp(p.warSociety?.warWeariness||0)*.45+clamp(p.warSociety?.combatTraumaBurden||0)*.25+clamp(p.warSociety?.publicWarKnowledge||0)*.30,0)/polities.length:0;
  const majorWar=clamp((activeWars||[]).filter(w=>w.active!==false).reduce((n,w)=>n+Math.min(1,(w.participantPolityIds?.length||2)/6),0)/2);
  const sharedProblem=clamp(rs.reduce((n,r)=>n+(hasTech(r,'anthropogenic_climate_change')?1:0),0)/Math.max(1,rs.length)*.65 + rs.reduce((n,r)=>n+(r.externalities?.knowledge?.ozone_depletion?.recognised?1:0),0)/Math.max(1,rs.length)*.35);
  const demand=clamp(warTrauma*.45+majorWar*.30+sharedProblem*.25);
  const readiness=clamp(connectivity*.28+administration*.22+diplomaticDensity*.18+demand*.32);
  return{connectivity,administration,diplomaticDensity,warTrauma,majorWar,sharedProblem,demand,readiness};
}

export function charterMetrics(charter={},majorPowerIds=[]){
  const permanent=new Set(charter.permanentMemberIds||[]);const veto=new Set(charter.vetoMemberIds||[]);const weightedVoting=clamp(charter.weightedVoting||0);const hostConcentration=clamp(charter.hostConcentration??.35);const agendaPrivilege=clamp(charter.agendaPrivilege||0);const enforcementPrivilege=clamp(charter.enforcementPrivilege||0);
  const major=Math.max(1,majorPowerIds.length);const permanentConcentration=clamp(permanent.size/major);const vetoConcentration=clamp(veto.size/major);
  const control=clamp(permanentConcentration*.20+vetoConcentration*.30+weightedVoting*.18+hostConcentration*.10+agendaPrivilege*.11+enforcementPrivilege*.11);
  const impartiality=clamp(1-control*.82-(veto.size>0?.05:0));
  const greatPowerBuyIn=clamp(.30+permanentConcentration*.20+vetoConcentration*.30+weightedVoting*.10+agendaPrivilege*.06+enforcementPrivilege*.04);
  const legitimacy=clamp(impartiality*.66+greatPowerBuyIn*.18+(1-hostConcentration)*.10+(charter.universalMembership?0.06:0));
  return{control,impartiality,greatPowerBuyIn,legitimacy};
}

export function proposeInternationalOrganisation({proposerPolityId,name='International Organisation',level='secretariat',charter={},hostPolityId=null},world,currentTick=0){
  const {polities,regions,activeWars=[]}=world;const readiness=worldInstitutionReadiness(polities,regions,activeWars);if(readiness.readiness<.38)return{formed:false,reason:'world_not_ready',readiness};
  const majors=identifyMajorPowers(polities,regions,Math.min(5,Math.max(2,Math.round(Math.sqrt(polities.length||1)))));const metrics=charterMetrics(charter,majors);const members=[];
  for(const p of polities){const isMajor=majors.includes(p.id);const rs=territories(p,regions);const connectivity=weighted(rs,comms);const acceptance=clamp((isMajor?metrics.legitimacy*.34+metrics.greatPowerBuyIn*.30:metrics.legitimacy*.60)+readiness.demand*.18+connectivity*.10+admin(p,rs)*.08+(isMajor?0:.04));if(acceptance>(isMajor?.44:.40))members.push(p.id);}
  const populationTotal=regions.reduce((n,r)=>n+(r.population||0),0);const memberPop=regions.filter(r=>members.includes(polityId(r))).reduce((n,r)=>n+(r.population||0),0);const rawAcceptance=clamp((members.length/Math.max(1,polities.length))*.55+(memberPop/Math.max(1,populationTotal))*.45);const acceptance=clamp(rawAcceptance*(.48+.52*metrics.legitimacy));
  if(members.length<3||acceptance<.30)return{formed:false,reason:'insufficient_international_acceptance',acceptance,metrics,majors};
  const org={id:`intl-org-${nextOrganisationId++}`,name,level:ORGANISATION_LEVELS[level]?level:'secretariat',foundedTick:currentTick,founderPolityId:proposerPolityId,hostPolityId:hostPolityId||proposerPolityId,charter:{...charter},majorPowerIds:majors,memberPolityIds:members,metrics:{...metrics,acceptance},motions:[],active:true};world.internationalOrganisations||=[];world.internationalOrganisations.push(org);return{formed:true,organisation:org,readiness};
}

function memberSupport(org,polity,motion,world){const rs=territories(polity,world.regions);const legitimacy=org.metrics?.legitimacy||0;const capacity=admin(polity,rs);let interest=.45;
  if(motion.type==='climate_action')interest=rs.some(r=>hasTech(r,'anthropogenic_climate_change'))?.72:.24;
  if(motion.type==='pollution_control')interest=rs.some(r=>Object.values(r.externalities?.knowledge||{}).some(k=>k?.recognised))?.68:.28;
  if(motion.type==='scientific_monitoring')interest=.72;
  if(motion.type==='mediate_peace'||motion.type==='condemn_war')interest=clamp(.42+(polity.warSociety?.warWeariness||0)*.38);
  return clamp(interest*.48+legitimacy*.30+capacity*.12+(org.memberPolityIds.includes(polity.id)?.10:0));}
export function submitInternationalMotion(org,{proposerPolityId,type,strength=.5,targetPolityId=null},world,currentTick=0){if(!org?.active||!org.memberPolityIds.includes(proposerPolityId)||!MOTION_TYPES[type])return{submitted:false,reason:'invalid_motion'};const spec=MOTION_TYPES[type];const votes=[];let yes=0,total=0;for(const id of org.memberPolityIds){const p=world.polities.find(x=>x.id===id);if(!p)continue;const weight=1+(org.charter?.weightedVoting||0)*(org.majorPowerIds.includes(id)?1.5:0);const support=memberSupport(org,p,{type,strength,targetPolityId},world);const veto=org.charter?.vetoMemberIds?.includes?.(id)&&support<.42;votes.push({polityId:id,support,weight,veto});total+=weight;if(support>=spec.difficulty)yes+=weight;if(veto){const motion={id:`motion-${nextMotionId++}`,type,status:'vetoed',proposerPolityId,targetPolityId,strength,votes,currentTick};org.motions.push(motion);return{submitted:true,passed:false,motion};}}
  const threshold=.5+(org.charter?.supermajority||0)*.25;const passed=yes/Math.max(1,total)>=threshold;const motion={id:`motion-${nextMotionId++}`,type,status:passed?'passed':'failed',proposerPolityId,targetPolityId,strength,votes,currentTick};org.motions.push(motion);if(passed)applyMotion(org,motion,world);return{submitted:true,passed,motion};}
function applyMotion(org,motion,world){const compliance=clamp((org.metrics?.legitimacy||0)*.58+(org.metrics?.acceptance||0)*.24+ORGANISATION_LEVELS[org.level].capacity*.18);motion.compliance=compliance;
  if(motion.type==='climate_action'||motion.type==='pollution_control'){for(const r of world.regions){if(!org.memberPolityIds.includes(polityId(r)))continue;r.internationalPolicy||={};if(motion.type==='climate_action')r.internationalPolicy.climateCommitment=Math.max(r.internationalPolicy.climateCommitment||0,motion.strength*compliance);else r.internationalPolicy.pollutionCommitment=Math.max(r.internationalPolicy.pollutionCommitment||0,motion.strength*compliance);}}
  if(motion.type==='scientific_monitoring')org.scientificMonitoring=Math.max(org.scientificMonitoring||0,motion.strength*compliance);
}
export function tickInternationalOrganisations(world,currentTick=0,elapsedDays=30){const events=[];for(const org of world.internationalOrganisations||[]){if(!org.active)continue;const metrics=charterMetrics(org.charter,org.majorPowerIds);org.metrics.control=metrics.control;org.metrics.impartiality=metrics.impartiality;org.metrics.greatPowerBuyIn=metrics.greatPowerBuyIn;org.metrics.legitimacy=metrics.legitimacy;org.metrics.acceptance=clamp(org.metrics.acceptance*.985+metrics.legitimacy*.015);if(org.metrics.acceptance<.18)events.push({type:'international_organisation_legitimacy_crisis',organisationId:org.id,acceptance:org.metrics.acceptance});}return events;}
export function internationalOrganisationSummary(org){return{id:org.id,name:org.name,level:org.level,members:org.memberPolityIds.length,majorPowers:org.majorPowerIds.length,hostPolityId:org.hostPolityId,control:org.metrics.control,impartiality:org.metrics.impartiality,legitimacy:org.metrics.legitimacy,acceptance:org.metrics.acceptance,motions:org.motions.slice(-8)};}
