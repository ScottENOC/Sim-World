import { nuclearDeterrentStatus } from './nuclearWeaponisation.js?v=20260920-nuclear-use1';
import { strategicForceReadiness } from './strategicDelivery.js?v=20260920-nuclear-use1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const NUCLEAR_RELEASE_DOCTRINES=Object.freeze({
  RETALIATORY_ONLY:'retaliatory_only',
  EXISTENTIAL_FIRST_USE:'existential_first_use',
  AMBIGUOUS:'ambiguous'
});
export const NUCLEAR_WARNING_STATES=Object.freeze({
  UNCORROBORATED:'uncorroborated',AMBIGUOUS:'ambiguous',HIGH_CONFIDENCE:'high_confidence',CONFIRMED_ATTACK:'confirmed_attack',FALSE_ALARM:'false_alarm'
});
export const NUCLEAR_TARGET_CATEGORIES=Object.freeze({
  MILITARY:'military',STRATEGIC_FORCES:'strategic_forces',INFRASTRUCTURE:'infrastructure',URBAN:'urban',CAPITAL:'capital'
});
export const NUCLEAR_USE_SCALES=Object.freeze({DEMONSTRATION:'demonstration',LIMITED:'limited',MAJOR:'major'});

export function ensureNuclearUseState(region){
  region.nuclearUse ||= {};
  const s=region.nuclearUse;
  s.policy ||= {doctrine:NUCLEAR_RELEASE_DOCTRINES.RETALIATORY_ONLY,requireCivilianAuthority:true,requireIndependentConfirmation:true,retaliatoryThreshold:.90,firstUseThreshold:.985,ambiguityTolerance:.16};
  s.command ||= {civilianAuthority:1,militaryCommand:1,communications:1,succession:.58};
  s.warnings ||= {};
  s.authorizations ||= {};
  s.history ||= [];
  s.impact ||= {infrastructureShock:0,economicShock:0,governanceShock:0,displacementShock:0,contaminationBurden:0,militaryShock:0};
  s.globalShock ||= {firstUseObserved:false,strategicAlarm:0,lastUseTick:null};
  return s;
}

export function setNuclearReleasePolicy(region,patch={}){
  const p=ensureNuclearUseState(region).policy;
  if(Object.values(NUCLEAR_RELEASE_DOCTRINES).includes(patch.doctrine))p.doctrine=patch.doctrine;
  for(const k of ['retaliatoryThreshold','firstUseThreshold','ambiguityTolerance'])if(Number.isFinite(patch[k]))p[k]=clamp(patch[k],.5,.999);
  for(const k of ['requireCivilianAuthority','requireIndependentConfirmation'])if(typeof patch[k]==='boolean')p[k]=patch[k];
  return {...p};
}

export function setNuclearCommandContinuity(region,patch={}){
  const c=ensureNuclearUseState(region).command;
  for(const k of ['civilianAuthority','militaryCommand','communications','succession'])if(Number.isFinite(patch[k]))c[k]=clamp(patch[k]);
  return {...c};
}

export function submitStrategicWarning(region,{id=null,confidence=.35,corroboration=.2,sourceDiversity=.25,attackType='unknown',confirmedDetonation=false,currentTick=null}={}){
  const s=ensureNuclearUseState(region),raw=clamp(confidence)*.48+clamp(corroboration)*.32+clamp(sourceDiversity)*.20;
  let state=NUCLEAR_WARNING_STATES.UNCORROBORATED;
  if(confirmedDetonation)state=NUCLEAR_WARNING_STATES.CONFIRMED_ATTACK;
  else if(raw>=.84)state=NUCLEAR_WARNING_STATES.HIGH_CONFIDENCE;
  else if(raw>=.48)state=NUCLEAR_WARNING_STATES.AMBIGUOUS;
  else if(raw<.22)state=NUCLEAR_WARNING_STATES.FALSE_ALARM;
  const warning={id:id||`strategic-warning-${region.id}-${currentTick??'now'}-${Object.keys(s.warnings).length+1}`,confidence:clamp(confidence),corroboration:clamp(corroboration),sourceDiversity:clamp(sourceDiversity),attackType,confirmedDetonation:Boolean(confirmedDetonation),assessmentConfidence:clamp(raw),state,createdTick:currentTick,status:'active'};
  s.warnings[warning.id]=warning;s.history.push({tick:currentTick,type:'strategic_warning_received',warningId:warning.id,state});
  return structuredClone(warning);
}

export function resolveStrategicWarning(region,warningId,{falseAlarm=false,currentTick=null}={}){
  const w=ensureNuclearUseState(region).warnings[warningId];if(!w)return null;
  w.status='resolved';w.resolvedTick=currentTick;if(falseAlarm){w.state=NUCLEAR_WARNING_STATES.FALSE_ALARM;w.confirmedDetonation=false;}
  return structuredClone(w);
}

export function nuclearCommandContinuity(region){
  const s=ensureNuclearUseState(region),force=strategicForceReadiness(region,{fleets:region.fleets||[]}),c=s.command;
  const civilian=clamp(c.civilianAuthority),military=clamp(c.militaryCommand),communications=clamp(c.communications*.55+force.commandResilience*.45),succession=clamp(c.succession);
  const score=clamp(civilian*.30+military*.24+communications*.28+succession*.18);
  return{civilian,military,communications,succession,score,authorityIntact:civilian>=.45&&military>=.45&&communications>=.38};
}

export function evaluateNuclearReleaseDecision(region,target,{warningId=null,trigger='retaliation',crisisLevel=0,redLineCrossed=false,existentialThreat=false,playerControlled=false}={}){
  const s=ensureNuclearUseState(region),warning=warningId?s.warnings[warningId]:null,command=nuclearCommandContinuity(region),force=strategicForceReadiness(region,{fleets:region.fleets||[]});
  const demonstrated=nuclearDeterrentStatus(region)==='demonstrated_device_capability';
  const retaliatory=trigger==='retaliation';
  const confirmed=Boolean(warning?.confirmedDetonation||warning?.state===NUCLEAR_WARNING_STATES.CONFIRMED_ATTACK);
  const warningConfidence=clamp(warning?.assessmentConfidence||0);
  const ambiguous=warning&&!confirmed&&warningConfidence<.84;
  const reasons=[];
  if(!demonstrated)reasons.push('no_demonstrated_nuclear_capability');
  if(force.legsAvailable<1)reasons.push('no_available_delivery_leg');
  if(!command.authorityIntact)reasons.push('command_authority_not_intact');
  if(s.policy.requireCivilianAuthority&&command.civilian<.55)reasons.push('civilian_authority_unavailable');
  if(retaliatory&&s.policy.requireIndependentConfirmation&&!confirmed&&warningConfidence<.84)reasons.push('attack_not_independently_confirmed');
  if(!retaliatory&&s.policy.doctrine===NUCLEAR_RELEASE_DOCTRINES.RETALIATORY_ONLY)reasons.push('doctrine_forbids_first_use');
  if(!retaliatory&&!existentialThreat)reasons.push('first_use_not_existential');
  if(ambiguous&&warningConfidence<s.policy.ambiguityTolerance)reasons.push('warning_too_ambiguous');
  const crisis=clamp(Number(crisisLevel)||0,0,5)/5;
  const score=clamp((retaliatory?(confirmed?.62:warningConfidence*.42):0)+(existentialThreat?.22:0)+(redLineCrossed?.10:0)+crisis*.08+force.retaliationConfidence*.08+command.score*.08-(ambiguous?.12:0));
  const threshold=retaliatory?s.policy.retaliatoryThreshold:s.policy.firstUseThreshold;
  const eligible=reasons.length===0&&score>=threshold;
  return{eligible,score,threshold,reasons,retaliatory,confirmedAttack:confirmed,warningConfidence,command,deliveryReadiness:force.retaliationConfidence,requiresPlayerConfirmation:Boolean(eligible&&playerControlled)};
}

export function requestNuclearAuthorization(region,target,options={}){
  const s=ensureNuclearUseState(region),assessment=evaluateNuclearReleaseDecision(region,target,options);
  if(!assessment.eligible)return{authorized:false,assessment};
  const id=`nuclear-authorization-${region.id}-${target?.id||'target'}-${Object.keys(s.authorizations).length+1}`;
  const playerControlled=Boolean(options.playerControlled);
  const auth={id,targetRegionId:target?.id||null,targetActorId:actorId(target),status:playerControlled?'awaiting_player_confirmation':'authorized',createdTick:options.currentTick??null,assessment,playerConfirmationRequired:playerControlled,playerConfirmed:false,executed:false};
  s.authorizations[id]=auth;s.history.push({tick:options.currentTick??null,type:'nuclear_authorization_created',authorizationId:id,targetRegionId:target?.id||null,status:auth.status});
  return{authorized:!playerControlled,authorization:structuredClone(auth),assessment};
}

export function confirmPlayerNuclearAuthorization(region,authorizationId,{confirmed=false,currentTick=null}={}){
  const a=ensureNuclearUseState(region).authorizations[authorizationId];if(!a||a.status!=='awaiting_player_confirmation')return null;
  a.playerConfirmed=Boolean(confirmed);a.status=confirmed?'authorized':'cancelled';a.confirmedTick=currentTick;return structuredClone(a);
}

export function npcNuclearReleaseDecision(region,target,options={}){
  const assessment=evaluateNuclearReleaseDecision(region,target,{...options,playerControlled:false});
  const warning=options.warningId?ensureNuclearUseState(region).warnings[options.warningId]:null;
  const confirmedRetaliation=assessment.retaliatory&&assessment.confirmedAttack;
  const extraordinaryFirstUse=!assessment.retaliatory&&options.existentialThreat&&options.redLineCrossed&&assessment.score>=.995&&ensureNuclearUseState(region).policy.doctrine!==NUCLEAR_RELEASE_DOCTRINES.RETALIATORY_ONLY;
  return{authorize:Boolean(assessment.eligible&&(confirmedRetaliation||extraordinaryFirstUse)&&warning?.state!==NUCLEAR_WARNING_STATES.FALSE_ALARM),assessment};
}

function impactProfile(category,scale){
  const scaleFactor={demonstration:.18,limited:.55,major:1}[scale]??.55;
  const base={
    military:{infrastructure:.22,economic:.08,governance:.04,displacement:.05,contamination:.12,military:.62},
    strategic_forces:{infrastructure:.26,economic:.10,governance:.08,displacement:.07,contamination:.13,military:.78},
    infrastructure:{infrastructure:.58,economic:.45,governance:.14,displacement:.20,contamination:.18,military:.22},
    urban:{infrastructure:.64,economic:.58,governance:.30,displacement:.72,contamination:.34,military:.16},
    capital:{infrastructure:.70,economic:.62,governance:.78,displacement:.66,contamination:.32,military:.20}
  }[category]||null;
  if(!base)return null;
  return Object.fromEntries(Object.entries(base).map(([k,v])=>[k,clamp(v*scaleFactor)]));
}

export function assessGovernmentContinuity(region,{capitalHit=false}={}){
  const impact=ensureNuclearUseState(region).impact,g=region.governance||{};
  const admin=clamp((Number.isFinite(g.administrativeControl)?g.administrativeControl:.58)*(1-impact.governanceShock*.72));
  const leadership=clamp((Number.isFinite(g.leadershipContinuity)?g.leadershipContinuity:.62)*(1-impact.governanceShock*(capitalHit?.92:.55)));
  const communications=clamp(nuclearCommandContinuity(region).communications*(1-impact.infrastructureShock*.48));
  const succession=clamp(ensureNuclearUseState(region).command.succession*(1-impact.governanceShock*.45));
  const economic=clamp(1-impact.economicShock*.72);
  const score=clamp(leadership*.28+admin*.24+communications*.20+succession*.16+economic*.12);
  const status=score<.22?'collapsed':score<.42?'severely_degraded':score<.62?'degraded':'intact';
  region.stateContinuity={score,status,lastAssessmentReason:capitalHit?'nuclear_capital_strike':'nuclear_strike'};
  region.governmentContinuityCollapsed=status==='collapsed';
  return{score,status,collapsed:status==='collapsed'};
}

export function applyGlobalFirstUseShock(regions,attacker,target,{currentTick=null}={}){
  const events=[];
  for(const r of regions||[]){const s=ensureNuclearUseState(r);s.globalShock.firstUseObserved=true;s.globalShock.strategicAlarm=clamp(Math.max(s.globalShock.strategicAlarm,.72));s.globalShock.lastUseTick=currentTick;
    if(r.nuclearArmsControl?.armsRace)r.nuclearArmsControl.armsRace.threatPressure=clamp(Math.max(r.nuclearArmsControl.armsRace.threatPressure||0,.55));
    if(r.nuclearDeterrence)r.nuclearDeterrence.signalDiscipline=clamp((r.nuclearDeterrence.signalDiscipline??.55)+.08);
    events.push({type:'global_nuclear_first_use_shock',regionId:r.id,attackerRegionId:attacker?.id||null,targetRegionId:target?.id||null,tick:currentTick});}
  return events;
}

export function executeAuthorizedNuclearUse(attacker,target,{authorizationId,targetCategory=NUCLEAR_TARGET_CATEGORIES.MILITARY,scale=NUCLEAR_USE_SCALES.LIMITED,currentTick=null,worldRegions=[]}={}){
  const as=ensureNuclearUseState(attacker),auth=as.authorizations[authorizationId];
  if(!auth||auth.status!=='authorized'||auth.executed)return{executed:false,reason:'valid_authorization_required'};
  if(auth.targetRegionId&&target?.id!==auth.targetRegionId)return{executed:false,reason:'authorization_target_mismatch'};
  if(!Object.values(NUCLEAR_TARGET_CATEGORIES).includes(targetCategory)||!Object.values(NUCLEAR_USE_SCALES).includes(scale))return{executed:false,reason:'invalid_abstract_strike_parameters'};
  const profile=impactProfile(targetCategory,scale);if(!profile)return{executed:false,reason:'invalid_target_category'};
  const ts=ensureNuclearUseState(target),i=ts.impact;
  i.infrastructureShock=clamp(i.infrastructureShock+profile.infrastructure*(1-i.infrastructureShock*.55));
  i.economicShock=clamp(i.economicShock+profile.economic*(1-i.economicShock*.5));
  i.governanceShock=clamp(i.governanceShock+profile.governance*(1-i.governanceShock*.45));
  i.displacementShock=clamp(i.displacementShock+profile.displacement*(1-i.displacementShock*.35));
  i.contaminationBurden=clamp(i.contaminationBurden+profile.contamination*(1-i.contaminationBurden*.35));
  i.militaryShock=clamp(i.militaryShock+profile.military*(1-i.militaryShock*.5));
  if(Number.isFinite(target.governance?.administrativeControl))target.governance.administrativeControl=clamp(target.governance.administrativeControl*(1-profile.governance*.55));
  if(Number.isFinite(target.treasury))target.treasury=Math.max(0,target.treasury*(1-profile.economic*.30));
  const continuity=assessGovernmentContinuity(target,{capitalHit:targetCategory===NUCLEAR_TARGET_CATEGORIES.CAPITAL});
  auth.executed=true;auth.status='executed';auth.executedTick=currentTick;auth.targetCategory=targetCategory;auth.scale=scale;
  as.history.push({tick:currentTick,type:'nuclear_use_executed',authorizationId,targetRegionId:target.id,targetCategory,scale});
  ts.history.push({tick:currentTick,type:'nuclear_strike_received',attackerRegionId:attacker.id,targetCategory,scale,continuityStatus:continuity.status});
  const firstUseAlready=(worldRegions||[]).some(r=>ensureNuclearUseState(r).globalShock.firstUseObserved);
  const globalEvents=firstUseAlready?[]:applyGlobalFirstUseShock(worldRegions,attacker,target,{currentTick});
  return{executed:true,impact:{...i},continuity,gameOverEligible:Boolean(continuity.collapsed),globalFirstUseShock:!firstUseAlready,events:globalEvents};
}

export function tickNuclearUse(regions,currentTick,elapsedDays=7){
  const events=[],decay=Math.max(0,Number(elapsedDays)||0)/365.2425;
  for(const r of regions||[]){const s=ensureNuclearUseState(r);
    s.globalShock.strategicAlarm=clamp(s.globalShock.strategicAlarm-decay*.055);
    for(const w of Object.values(s.warnings))if(w.status==='active'&&Number.isFinite(w.createdTick)&&currentTick-w.createdTick>30&&!w.confirmedDetonation){w.status='expired';events.push({type:'strategic_warning_expired',regionId:r.id,warningId:w.id,tick:currentTick});}
  }
  return events;
}
