import { attitudeToward, changeAttitude, relationToward } from './relations.js?v=20260920-intl-crisis1';
import { ensureAuthorityPolitics, ensurePolityReligiousPolitics } from '../society/medievalReligiousPolitics.js?v=20260920-intl-crisis1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (r) => r?.governance?.sovereignPolityId || r?.polityId || r?.controllingActorId || r?.id || null;

export const INTERNATIONAL_CRISIS_TYPES = Object.freeze({
  WAR: 'war', BLOCKADE: 'blockade', TERRITORIAL: 'territorial_dispute', COUP: 'foreign_backed_coup',
  NUCLEAR_TEST: 'nuclear_test', COVERT: 'covert_incident', ATROCITY: 'atrocity', EMBARGO: 'embargo', ALLIANCE: 'alliance_crisis',
});
export const CRISIS_INTERVENTIONS = Object.freeze({
  BACK_SIDE_A: 'back_side_a', BACK_SIDE_B: 'back_side_b', CONDEMN_A: 'condemn_a', CONDEMN_B: 'condemn_b',
  MEDIATE: 'mediate', URGE_RESTRAINT: 'urge_restraint', SANCTION_A: 'sanction_a', SANCTION_B: 'sanction_b',
});

function capital(polity, regions) {
  return (regions || []).find(r => r.id === polity?.capitalRegionId) || (regions || []).find(r => actorId(r) === polity?.id) || null;
}
function polityById(polities, id) { return (polities || []).find(p => p.id === id) || null; }
function ensureWorld(world) {
  world.internationalCrises ||= [];
  world.nextInternationalCrisisId ||= 1;
  return world.internationalCrises;
}
function crisisByKey(world, key) { return ensureWorld(world).find(c => c.key === key && c.status !== 'closed'); }
function sourceSeverity(type) {
  return ({ war:.72, blockade:.58, territorial_dispute:.48, foreign_backed_coup:.62, nuclear_test:.68, covert_incident:.52, atrocity:.92, embargo:.42, alliance_crisis:.54 })[type] ?? .45;
}

export function registerInternationalCrisis(world, details = {}, currentTick = 0) {
  const crises = ensureWorld(world);
  const key = details.key || `${details.type || 'crisis'}:${details.sideAActorId || 'a'}:${details.sideBActorId || 'b'}:${details.sourceId || currentTick}`;
  const existing = crisisByKey(world, key);
  if (existing) {
    existing.lastObservedTick = currentTick;
    existing.severity = Math.max(existing.severity || 0, clamp(details.severity ?? sourceSeverity(details.type)));
    return existing;
  }
  const crisis = {
    id: `international-crisis-${world.nextInternationalCrisisId++}`, key, type: details.type || 'international_crisis',
    sourceId: details.sourceId || null, sideAActorId: details.sideAActorId || null, sideBActorId: details.sideBActorId || null,
    allegedAggressorActorId: details.allegedAggressorActorId || null, affectedActorId: details.affectedActorId || null,
    title: details.title || null, severity: clamp(details.severity ?? sourceSeverity(details.type)), evidence: clamp(details.evidence ?? .7),
    nuclearRisk: clamp(details.nuclearRisk || 0), humanitarianRisk: clamp(details.humanitarianRisk || 0), createdTick: currentTick,
    lastObservedTick: currentTick, status: 'active', pressureA: 0, pressureB: 0, mediation: 0, restraint: 0,
    interventions: [], bodyPositions: [], history: [], settlement: null,
  };
  crises.push(crisis);
  return crisis;
}

function harvestWars(world, currentTick) {
  const made = [];
  for (const war of world.activeWars || []) {
    if (war.active === false) continue;
    const ids = war.participantPolityIds || war.participants || [];
    const a = war.attackerPolityId || war.attackerActorId || ids[0];
    const b = war.defenderPolityId || war.defenderActorId || ids.find(id => id !== a) || ids[1];
    if (!a || !b) continue;
    made.push(registerInternationalCrisis(world, { key:`war:${war.id}`, type:'war', sourceId:war.id, sideAActorId:a, sideBActorId:b,
      allegedAggressorActorId:a, affectedActorId:b, severity:clamp(.58 + (war.theatres?.length || 0) * .06), humanitarianRisk:clamp((war.casualties || 0) / 100000) }, currentTick));
  }
  return made;
}
function harvestCovert(world, currentTick) {
  const made=[];
  for (const region of world.regions || []) for (const incident of region.covertIncidentEscalation?.incidents || []) {
    if (!incident.attributedActorId || !['responded','absorbed'].includes(incident.status)) continue;
    made.push(registerInternationalCrisis(world,{key:`covert:${incident.id}`,type:'covert_incident',sourceId:incident.id,
      sideAActorId:incident.attributedActorId,sideBActorId:incident.targetActorId,allegedAggressorActorId:incident.attributedActorId,
      affectedActorId:incident.targetActorId,severity:clamp(incident.responseAssessment?.outrage || .5),evidence:clamp(incident.publicAttributionConfidence ?? incident.attributionConfidence ?? .5),
      nuclearRisk:clamp(incident.responseAssessment?.nuclearRisk || 0)},currentTick));
  }
  return made;
}
function harvestNuclearTests(world,currentTick){const made=[];for(const region of world.regions||[]){for(const test of region.nuclearWeapons?.tests||[]){if(!test.completed||(!test.detected&&!test.publiclyDeclared))continue;const source=actorId(region);if(!source)continue;made.push(registerInternationalCrisis(world,{key:`nuclear-test:${source}:${test.tick}`,type:'nuclear_test',sourceId:`${source}:${test.tick}`,sideAActorId:source,allegedAggressorActorId:source,severity:.62,evidence:test.publiclyDeclared?1:.82,nuclearRisk:.72,title:'Nuclear test'},currentTick));}}return made;}
export function harvestInternationalCrises(world,currentTick=0){return [...harvestWars(world,currentTick),...harvestCovert(world,currentTick),...harvestNuclearTests(world,currentTick)];}

function affinity(region, otherActorId) { return clamp((attitudeToward(region, otherActorId) + 1) / 2); }
export function assessCrisisIntervention(thirdPolity, crisis, world) {
  const third = capital(thirdPolity, world.regions); const a = polityById(world.polities, crisis.sideAActorId); const b = polityById(world.polities, crisis.sideBActorId);
  const ar = capital(a, world.regions), br = capital(b, world.regions); if (!third) return null;
  const aAff = ar ? affinity(third, ar.id) : .5, bAff = br ? affinity(third, br.id) : .5;
  const evidence = clamp(crisis.evidence), severity=clamp(crisis.severity), nuclear=clamp(crisis.nuclearRisk), humanitarian=clamp(crisis.humanitarianRisk);
  const neutral = clamp(1-Math.abs(aAff-bAff)); const aggA = crisis.allegedAggressorActorId===crisis.sideAActorId ? 1 : 0; const aggB = crisis.allegedAggressorActorId===crisis.sideBActorId ? 1 : 0;
  const scores={
    back_side_a:clamp(.08+aAff*.42+(aAff-bAff)*.25-evidence*aggA*.22), back_side_b:clamp(.08+bAff*.42+(bAff-aAff)*.25-evidence*aggB*.22),
    condemn_a:clamp(.04+evidence*aggA*.50+severity*.22+(bAff-aAff)*.16+humanitarian*.16), condemn_b:clamp(.04+evidence*aggB*.50+severity*.22+(aAff-bAff)*.16+humanitarian*.16),
    mediate:clamp(.10+neutral*.38+nuclear*.26+severity*.15), urge_restraint:clamp(.12+neutral*.20+nuclear*.40+severity*.18),
    sanction_a:clamp(.01+evidence*aggA*.44+severity*.24+(bAff-aAff)*.16), sanction_b:clamp(.01+evidence*aggB*.44+severity*.24+(aAff-bAff)*.16),
  };
  const ranked=Object.entries(scores).sort((x,y)=>y[1]-x[1]); return {action:ranked[0][0],scores,aAffinity:aAff,bAffinity:bAff,neutrality:neutral};
}
function imposeSanction(fromPolity,targetActorId,world,currentTick,severity){for(const from of (world.regions||[]).filter(r=>actorId(r)===fromPolity.id)){for(const target of (world.regions||[]).filter(r=>actorId(r)===targetActorId)){const rel=relationToward(from,target.id);rel.tradeSanctionSeverity=Math.max(Number(rel.tradeSanctionSeverity)||0,severity);rel.tradeSanctionUntilTick=Math.max(Number(rel.tradeSanctionUntilTick)||0,currentTick+52);}}}
export function applyCrisisIntervention(thirdPolity,crisis,world,currentTick,action){if(!thirdPolity||!crisis)return{applied:false};if(crisis.interventions.some(i=>i.actorId===thirdPolity.id))return{applied:false,reason:'already_intervened'};const assessment=assessCrisisIntervention(thirdPolity,crisis,world);const selected=action||assessment?.action;if(!selected)return{applied:false};const third=capital(thirdPolity,world.regions);const a=capital(polityById(world.polities,crisis.sideAActorId),world.regions);const b=capital(polityById(world.polities,crisis.sideBActorId),world.regions);const rec={actorId:thirdPolity.id,action:selected,tick:currentTick};
  if(selected==='back_side_a')crisis.pressureB=clamp(crisis.pressureB+.12); if(selected==='back_side_b')crisis.pressureA=clamp(crisis.pressureA+.12);
  if(selected==='condemn_a')crisis.pressureA=clamp(crisis.pressureA+.14); if(selected==='condemn_b')crisis.pressureB=clamp(crisis.pressureB+.14);
  if(selected==='mediate'){crisis.mediation=clamp(crisis.mediation+.18);crisis.severity=clamp(crisis.severity-.05);crisis.nuclearRisk=clamp(crisis.nuclearRisk-.08);}
  if(selected==='urge_restraint'){crisis.restraint=clamp(crisis.restraint+.16);crisis.nuclearRisk=clamp(crisis.nuclearRisk-.06);}
  if(selected==='sanction_a'){imposeSanction(thirdPolity,crisis.sideAActorId,world,currentTick,.28);crisis.pressureA=clamp(crisis.pressureA+.16);} if(selected==='sanction_b'){imposeSanction(thirdPolity,crisis.sideBActorId,world,currentTick,.28);crisis.pressureB=clamp(crisis.pressureB+.16);}
  if(third&&a&&['condemn_a','sanction_a'].includes(selected))changeAttitude(a,third.id,-.08,'international_crisis',currentTick); if(third&&b&&['condemn_b','sanction_b'].includes(selected))changeAttitude(b,third.id,-.08,'international_crisis',currentTick);
  crisis.interventions.push(rec);crisis.history.push({...rec,type:'state_intervention'});return{applied:true,action:selected,assessment};}

function followerWeight(authority,polityId,world){let followers=0,pop=0;for(const r of world.regions||[]){if(actorId(r)!==polityId)continue;const p=Math.max(0,r.population||0);pop+=p;followers+=p*Math.max(0,r.religion?.shares?.[authority.religionId]||0);}return pop?followers/pop:0;}
export function religiousAuthorityCrisisAssessment(authority,crisis,world){const aShare=followerWeight(authority,crisis.sideAActorId,world),bShare=followerWeight(authority,crisis.sideBActorId,world);const influence=clamp(authority.diplomaticInfluence||authority.prestige||0);const evidence=clamp(crisis.evidence),severity=clamp(crisis.severity),human=clamp(crisis.humanitarianRisk),nuclear=clamp(crisis.nuclearRisk);const aggA=crisis.allegedAggressorActorId===crisis.sideAActorId,aggB=crisis.allegedAggressorActorId===crisis.sideBActorId;const shared=Math.min(aShare,bShare);const scores={call_peace:clamp(.18+severity*.30+human*.28+nuclear*.25+shared*.18),mediate:clamp(.08+influence*.30+shared*.34+nuclear*.20),condemn_a:clamp(.04+(aggA?evidence*.45:0)+bShare*.22+human*.18),condemn_b:clamp(.04+(aggB?evidence*.45:0)+aShare*.22+human*.18),support_a:clamp(.04+aShare*.40-bShare*.14-(aggA?evidence*.25:0)),support_b:clamp(.04+bShare*.40-aShare*.14-(aggB?evidence*.25:0))};const ranked=Object.entries(scores).sort((x,y)=>y[1]-x[1]);return{position:ranked[0][0],scores,aFollowerShare:aShare,bFollowerShare:bShare,influence};}
export function applyReligiousAuthorityPosition(authority,crisis,world,currentTick,position){if(!authority?.active||crisis.bodyPositions.some(p=>p.bodyType==='religious_authority'&&p.bodyId===authority.id))return{applied:false};const assessment=religiousAuthorityCrisisAssessment(authority,crisis,world);const selected=position||assessment.position;const politics=ensureAuthorityPolitics(authority);const rec={bodyType:'religious_authority',bodyId:authority.id,position:selected,tick:currentTick,assessment};
  if(selected==='call_peace'){politics.peaceCalls.push({tick:currentTick,crisisId:crisis.id,sideAActorId:crisis.sideAActorId,sideBActorId:crisis.sideBActorId});crisis.restraint=clamp(crisis.restraint+.08+.10*assessment.influence);crisis.severity=clamp(crisis.severity-.025);}
  if(selected==='mediate'){politics.mediationHistory.push({tick:currentTick,crisisId:crisis.id});crisis.mediation=clamp(crisis.mediation+.10+.12*assessment.influence);crisis.nuclearRisk=clamp(crisis.nuclearRisk-.04);}
  if(selected==='condemn_a'){crisis.pressureA=clamp(crisis.pressureA+.06+.10*assessment.aFollowerShare);const p=polityById(world.polities,crisis.sideAActorId);if(p){const rp=ensurePolityReligiousPolitics(p);rp.peacePressure[authority.id]=clamp((rp.peacePressure[authority.id]||0)+.08);}}
  if(selected==='condemn_b'){crisis.pressureB=clamp(crisis.pressureB+.06+.10*assessment.bFollowerShare);const p=polityById(world.polities,crisis.sideBActorId);if(p){const rp=ensurePolityReligiousPolitics(p);rp.peacePressure[authority.id]=clamp((rp.peacePressure[authority.id]||0)+.08);}}
  if(selected==='support_a')crisis.pressureB=clamp(crisis.pressureB+.05*assessment.influence);if(selected==='support_b')crisis.pressureA=clamp(crisis.pressureA+.05*assessment.influence);
  crisis.bodyPositions.push(rec);crisis.history.push({...rec,type:'religious_position'});return{applied:true,position:selected,assessment};}

export function tickInternationalCrises(world,currentTick=0,elapsedDays=7,rng=Math.random,options={}){const events=[];harvestInternationalCrises(world,currentTick);for(const crisis of ensureWorld(world)){if(crisis.status!=='active')continue;if(currentTick-(crisis.createdTick||0)<1)continue;
    for(const third of world.polities||[]){if([crisis.sideAActorId,crisis.sideBActorId].includes(third.id)||crisis.interventions.some(i=>i.actorId===third.id))continue;const a=assessCrisisIntervention(third,crisis,world);if(!a||(a.scores[a.action]||0)<.60)continue;if(options.playerPolityId===third.id){events.push({type:'international_crisis_intervention_available',crisisId:crisis.id,actorId:third.id,assessment:a});continue;}if(rng()<.24+(a.scores[a.action]||0)*.45){const result=applyCrisisIntervention(third,crisis,world,currentTick,a.action);if(result.applied)events.push({type:'international_crisis_state_intervention',crisisId:crisis.id,actorId:third.id,action:result.action});}}
    for(const authority of world.religiousWorld?.authorities||[]){if(!authority?.active||crisis.bodyPositions.some(p=>p.bodyType==='religious_authority'&&p.bodyId===authority.id))continue;const a=religiousAuthorityCrisisAssessment(authority,crisis,world);if((a.scores[a.position]||0)<.48)continue;if(rng()<.30+(a.scores[a.position]||0)*.50){const result=applyReligiousAuthorityPosition(authority,crisis,world,currentTick,a.position);if(result.applied)events.push({type:'international_crisis_religious_position',crisisId:crisis.id,authorityId:authority.id,position:result.position});}}
    const age=currentTick-(crisis.lastObservedTick||crisis.createdTick||0);if(age>52&&crisis.severity<.25){crisis.status='closed';crisis.closedTick=currentTick;events.push({type:'international_crisis_closed',crisisId:crisis.id});}}
  return events;}
