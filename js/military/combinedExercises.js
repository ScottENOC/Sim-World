import { recordMaritimePractice, maritimeSkillLevel, MARITIME_SKILLS } from '../technology/seamanship.js?v=20260906-maritime1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.polityId||r?.id||null;
const ALLIANCE_TYPES=new Set(['military_support','joint_operation','war_commitment','alliance','defensive_alliance','air_basing']);
let nextExerciseId=1;

export const EXERCISE_MISSIONS=Object.freeze({
  GENERAL_WAR:{id:'general_war',label:'General war',provocation:.55,land:true,naval:true},
  DEFENCE:{id:'defence',label:'Defence',provocation:.30,land:true,naval:true},
  COASTAL_ASSAULT:{id:'coastal_assault',label:'Coastal assault',provocation:1.0,land:true,naval:true,requiresCoast:true},
});

function ensureRelations(region){if(!(region.relations instanceof Map))region.relations=new Map();return region.relations;}
function attitude(region,otherId){return ensureRelations(region).get(otherId)?.attitude||0;}
function adjustAttitude(region,otherId,amount,cause,currentTick){
  const map=ensureRelations(region);const rel=map.get(otherId)||{attitude:0,lastCause:null,lastChangedTick:null};
  rel.attitude=clamp(rel.attitude+amount,-1,1);rel.lastCause=cause;rel.lastChangedTick=currentTick;map.set(otherId,rel);return rel.attitude;
}
function isSea(region){return Boolean(region?.isSea||region?.type==='sea'||region?.kind==='sea'||region?.terrain==='sea'||region?.biome==='sea');}
function isCoastal(region){return isSea(region)||Boolean(region?.isCoastal||(region?.adjacentSeaIds||[]).length);}
function relatedByAgreement(a,b,agreements){
  const aIds=new Set([a.id,actorId(a)]),bIds=new Set([b.id,actorId(b)]);
  return (agreements||[]).some(x=>x?.active&&ALLIANCE_TYPES.has(x.type)&&
    ((aIds.has(x.fromId)&&bIds.has(x.toId))||(aIds.has(x.toId)&&bIds.has(x.fromId))||
     (aIds.has(x.fromActorId)&&bIds.has(x.toActorId))||(aIds.has(x.toActorId)&&bIds.has(x.fromActorId))));
}
export function areExerciseAllies(a,b,agreements=[]){
  if(!a||!b)return false;if(a.id===b.id)return true;const aa=actorId(a),bb=actorId(b);if(aa&&bb&&aa===bb)return true;return relatedByAgreement(a,b,agreements);
}

export function ensureCombinedTraining(region){
  region.combinedTraining ||= {version:1,skills:{general_war:0,defence:0,coastal_assault:0},interoperability:{},exerciseWeeks:0,lastExerciseTick:null};
  const s=region.combinedTraining;s.skills ||= {};s.interoperability ||= {};
  for(const id of Object.keys(EXERCISE_MISSIONS))if(!Number.isFinite(s.skills[id]))s.skills[id]=0;
  return s;
}

function modernAdaptation(region){const t=region?.modernTactics||{};return clamp((t.dispersion||0)*.24+(t.fireAndMovement||0)*.24+(t.suppression||0)*.18+(t.artilleryCoordination||0)*.18+(t.juniorInitiative||0)*.16);}
export function exerciseMissionCompetence(region,missionType){
  const exp=region?.militaryExperience||{},field=clamp(exp.field),institutional=clamp(exp.institutional),t=region?.modernTactics||{},combined=ensureCombinedTraining(region).skills[missionType]||0;
  if(missionType==='defence')return clamp(field*.24+institutional*.24+clamp(t.defensiveFireDiscipline)*.30+modernAdaptation(region)*.10+combined*.12);
  if(missionType==='coastal_assault')return clamp(field*.16+institutional*.18+maritimeSkillLevel(region,MARITIME_SKILLS.COMBAT)*.32+clamp(t.artilleryCoordination)*.12+combined*.22);
  return clamp(field*.30+institutional*.30+modernAdaptation(region)*.24+combined*.16);
}

export function interoperabilityWith(region,other){const key=typeof other==='string'?other:actorId(other);return clamp(ensureCombinedTraining(region).interoperability[key]||0);}
export function alliedCoordinationMultiplier(region,other){return 1+interoperabilityWith(region,other)*.14;}

function hostNearRegion(host,region){
  if(!host||!region)return false;if(host.id===region.id)return true;
  if(isSea(host))return (region.adjacentSeaIds||[]).includes(host.id);
  if((host.neighbors||[]).includes(region.id)||(region.neighbors||[]).includes(host.id))return true;
  return (host.adjacentSeaIds||[]).some(id=>(region.adjacentSeaIds||[]).includes(id));
}
function availableShipsFor(region,fleets){return (fleets||[]).filter(f=>f.ownerRegionId===region.id).flatMap(f=>f.ships||[]).filter(s=>!s.damageState?.sinking&&!s.exerciseDeploymentId);}
function participantCommitment(region,host,mission,scale,fleets,exerciseId){
  const wantsLand=!isSea(host)||mission.id==='coastal_assault';const wantsNaval=isSea(host)||mission.id==='coastal_assault';
  let landPersonnel=0;if(wantsLand){const available=Math.max(0,region.army?.personnel||0);landPersonnel=Math.floor(Math.min(available*.45,Math.max(0,available*scale)));if(landPersonnel>0){region.army.personnel-=landPersonnel;region.army.away=(region.army.away||0)+landPersonnel;}}
  const ships=[];if(wantsNaval){const available=availableShipsFor(region,fleets);const count=Math.min(available.length,Math.max(available.length?1:0,Math.ceil(available.length*scale)));for(const ship of available.slice(0,count)){ship.exerciseDeploymentId=exerciseId;ship.exerciseHostRegionId=host.id;ships.push(ship.id);}}
  return{regionId:region.id,actorId:actorId(region),landPersonnel,shipIds:ships,initialCompetence:exerciseMissionCompetence(region,mission.id)};
}
function releaseCommitment(region,p,fleets){
  if(region&&p.landPersonnel>0){region.army.personnel=(region.army.personnel||0)+p.landPersonnel;region.army.away=Math.max(0,(region.army.away||0)-p.landPersonnel);}
  const ids=new Set(p.shipIds||[]);for(const f of fleets||[])for(const ship of f.ships||[])if(ids.has(ship.id)&&ship.exerciseDeploymentId){delete ship.exerciseDeploymentId;delete ship.exerciseHostRegionId;}
}

export function eligibleExerciseAllies(organiser,regions,agreements=[]){const own=actorId(organiser);const seen=new Set();return (regions||[]).filter(r=>r.id!==organiser?.id&&actorId(r)!==own&&areExerciseAllies(organiser,r,agreements)).filter(r=>{const id=actorId(r);if(!id||seen.has(id))return false;seen.add(id);return true;});}

export function startCombinedExercise({organiserRegionId,hostRegionId,participantRegionIds=[],missionType='general_war',durationWeeks=12,scale=.2}={},regions=[],seaRegions=[],agreements=[],currentTick=0,fleets=[]){
  const byId=new Map([...(regions||[]),...(seaRegions||[])].map(r=>[r.id,r])),organiser=byId.get(organiserRegionId),host=byId.get(hostRegionId),mission=EXERCISE_MISSIONS[String(missionType||'').toUpperCase()]||Object.values(EXERCISE_MISSIONS).find(x=>x.id===missionType);
  if(!organiser)return{started:false,reason:'unknown_organiser'};if(!host)return{started:false,reason:'unknown_host'};if(!mission)return{started:false,reason:'unknown_mission'};if(mission.requiresCoast&&!isCoastal(host))return{started:false,reason:'coastal_host_required'};
  const ids=[organiser.id,...participantRegionIds.filter(id=>id!==organiser.id)],participants=[];
  for(const id of ids){const r=byId.get(id);if(!r||isSea(r))continue;if(r.id!==organiser.id&&!areExerciseAllies(organiser,r,agreements))continue;participants.push(r);}
  if(participants.length<2)return{started:false,reason:'no_allied_participants'};
  const existing=new Set([...(regions||[]),...(seaRegions||[])].flatMap(r=>(r.combinedExercises||[]).map(x=>x.id)));let id;do{id=`exercise-${currentTick}-${organiser.id}-${nextExerciseId++}`;}while(existing.has(id));const exercise={id,organiserRegionId:organiser.id,hostRegionId:host.id,missionType:mission.id,startTick:currentTick,durationWeeks:Math.max(2,Math.min(52,Number(durationWeeks)||12)),elapsedWeeks:0,scale:clamp(scale,.05,.5),active:true,participants:[],lastDiplomaticTick:null};
  for(const r of participants)exercise.participants.push(participantCommitment(r,host,mission,exercise.scale,fleets,id));
  host.combinedExercises ||= [];host.combinedExercises.push(exercise);
  return{started:true,exercise};
}

function applyMissionLearning(region,mission,expert,weekScale,commitment){
  const s=ensureCombinedTraining(region),own=exerciseMissionCompetence(region,mission.id),gap=Math.max(0,expert-own),commitmentScale=clamp((commitment.landPersonnel||0)/Math.max(50,(region.army?.personnel||0)+(commitment.landPersonnel||0))+(commitment.shipIds?.length||0)*.03,0.08,1);
  const gain=weekScale*(.0015+gap*.010)*(.55+commitmentScale*.45)*(1-s.skills[mission.id]*.65);s.skills[mission.id]=clamp(s.skills[mission.id]+gain);s.exerciseWeeks+=weekScale;
  region.militaryExperience ||= {field:0,institutional:0,lastFieldTick:0,engagementWeeks:0,trainingYears:0};region.militaryExperience.institutional=clamp((region.militaryExperience.institutional||0)+gain*.24);
  region.modernTactics ||= {};
  if(mission.id==='defence')region.modernTactics.defensiveFireDiscipline=clamp((region.modernTactics.defensiveFireDiscipline||0)+gain*.42);
  if(mission.id==='general_war'){region.modernTactics.fireAndMovement=clamp((region.modernTactics.fireAndMovement||0)+gain*.18);region.modernTactics.juniorInitiative=clamp((region.modernTactics.juniorInitiative||0)+gain*.14);}
  if(mission.id==='coastal_assault'){region.modernTactics.artilleryCoordination=clamp((region.modernTactics.artilleryCoordination||0)+gain*.24);recordMaritimePractice(region,MARITIME_SKILLS.COMBAT,Math.max(5,(commitment.landPersonnel||0)*.08+(commitment.shipIds?.length||0)*12)*weekScale);}
  return gain;
}
function applyInteroperability(participants,byId,weekScale,scale){for(const a of participants){const ar=byId.get(a.regionId);if(!ar)continue;const state=ensureCombinedTraining(ar);for(const b of participants){if(a===b)continue;const br=byId.get(b.regionId),key=actorId(br);if(!key)continue;state.interoperability[key]=clamp((state.interoperability[key]||0)+weekScale*(.0018+.0032*scale)*(1-(state.interoperability[key]||0)*.55));}}}
function participantDiplomacy(exercise,byId,currentTick,weekScale){for(let i=0;i<exercise.participants.length;i++)for(let j=i+1;j<exercise.participants.length;j++){const a=byId.get(exercise.participants[i].regionId),b=byId.get(exercise.participants[j].regionId);if(!a||!b)continue;const warm=.0012*weekScale*(.5+exercise.scale);adjustAttitude(a,b.id,warm,'combined_military_exercise',currentTick);adjustAttitude(b,a.id,warm,'combined_military_exercise',currentTick);}}
function rivalDiplomacy(exercise,host,regions,byId,currentTick,weekScale){
  const mission=Object.values(EXERCISE_MISSIONS).find(x=>x.id===exercise.missionType),organiser=byId.get(exercise.organiserRegionId);if(!mission||!organiser)return[];const participantIds=new Set(exercise.participants.map(p=>p.regionId)),events=[];
  const scaleSignal=clamp(exercise.scale*1.7+exercise.participants.length*.08,0,1);
  for(const observer of regions||[]){if(participantIds.has(observer.id)||actorId(observer)===actorId(organiser)||!hostNearRegion(host,observer))continue;const current=attitude(observer,organiser.id);if(current>.30)continue;const suspicion=clamp((.35-current*.35)*mission.provocation*scaleSignal);if(suspicion<.04)continue;const delta=-.0035*suspicion*weekScale;adjustAttitude(observer,organiser.id,delta,'nearby_combined_military_exercise',currentTick);if(Math.abs(delta)>.0015)events.push({type:'combined_exercise_diplomatic_concern',exerciseId:exercise.id,observerRegionId:observer.id,organiserRegionId:organiser.id,missionType:mission.id,attitudeChange:delta});
  }
  return events;
}

export function tickCombinedExercises(regions=[],seaRegions=[],fleets=[],agreements=[],currentTick=0,elapsedDays=7){
  const all=[...(regions||[]),...(seaRegions||[])],byId=new Map(all.map(r=>[r.id,r])),weekScale=Math.max(0,Number(elapsedDays)||0)/7,events=[];if(weekScale<=0)return events;
  for(const host of all){for(const exercise of host.combinedExercises||[]){if(!exercise?.active)continue;const mission=Object.values(EXERCISE_MISSIONS).find(x=>x.id===exercise.missionType);if(!mission){exercise.active=false;continue;}
      const active=exercise.participants.filter(p=>byId.get(p.regionId));if(active.length<2){exercise.active=false;for(const p of active)releaseCommitment(byId.get(p.regionId),p,fleets);continue;}
      const expert=Math.max(...active.map(p=>exerciseMissionCompetence(byId.get(p.regionId),mission.id)));for(const p of active){const r=byId.get(p.regionId),gain=applyMissionLearning(r,mission,expert,weekScale,p);r.combinedTraining.lastExerciseTick=currentTick;p.lastLearningGain=gain;}
      applyInteroperability(active,byId,weekScale,exercise.scale);participantDiplomacy(exercise,byId,currentTick,weekScale);events.push(...rivalDiplomacy(exercise,host,regions,byId,currentTick,weekScale));
      const upkeep=weekScale*(active.reduce((s,p)=>s+(p.landPersonnel||0),0)*.0008+active.reduce((s,p)=>s+(p.shipIds?.length||0),0)*.12);const organiser=byId.get(exercise.organiserRegionId);if(organiser)organiser.treasury=Math.max(0,(organiser.treasury||0)-Math.min(organiser.treasury||0,upkeep));
      exercise.elapsedWeeks+=weekScale;if(exercise.elapsedWeeks>=exercise.durationWeeks){exercise.active=false;for(const p of active)releaseCommitment(byId.get(p.regionId),p,fleets);events.push({type:'combined_exercise_completed',exerciseId:exercise.id,organiserRegionId:exercise.organiserRegionId,hostRegionId:exercise.hostRegionId,missionType:exercise.missionType,participantRegionIds:active.map(p=>p.regionId)});}
    }}return events;
}

export function combinedExerciseSummary(region){const s=ensureCombinedTraining(region);return{skills:{...s.skills},interoperability:{...s.interoperability},exerciseWeeks:s.exerciseWeeks,lastExerciseTick:s.lastExerciseTick};}
