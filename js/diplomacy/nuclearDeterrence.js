import { estimateForeignNuclearWeaponCapability, nuclearDeterrentStatus } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-deterrence1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const NUCLEAR_DOCTRINES=Object.freeze({AMBIGUOUS:'ambiguous',MINIMUM:'minimum_deterrence',ASSURED_RETALIATION:'assured_retaliation'});
export const RED_LINE_CATEGORIES=Object.freeze({HOMELAND_INVASION:'homeland_invasion',CAPITAL_ATTACK:'capital_attack',NUCLEAR_ATTACK:'nuclear_attack',STRATEGIC_FORCES_ATTACK:'strategic_forces_attack',ALLY_EXISTENTIAL_ATTACK:'ally_existential_attack',REGIME_SURVIVAL:'regime_survival'});
export const NUCLEAR_CRISIS_LEVELS=Object.freeze({NORMAL:0,TENSION:1,CRISIS:2,ALERT:3,BRINK:4,RELEASE_CONSIDERATION:5});

export function ensureNuclearDeterrence(region){
  region.nuclearDeterrence ||= {};
  const s=region.nuclearDeterrence;
  s.doctrine ||= NUCLEAR_DOCTRINES.AMBIGUOUS;
  s.redLines ||= [];
  s.crises ||= {};
  s.perceptions ||= {};
  if(!Number.isFinite(s.resolve))s.resolve=.55;
  if(!Number.isFinite(s.riskTolerance))s.riskTolerance=.28;
  if(!Number.isFinite(s.signalDiscipline))s.signalDiscipline=.55;
  return s;
}

export function setNuclearDoctrine(region,doctrine){
  const s=ensureNuclearDeterrence(region);
  if(Object.values(NUCLEAR_DOCTRINES).includes(doctrine))s.doctrine=doctrine;
  return s.doctrine;
}

export function declareNuclearRedLine(region,{id=null,category,severity=.65,publiclyDeclared=true,ambiguity=.25,alliedActorId=null}={}){
  const s=ensureNuclearDeterrence(region);
  if(!Object.values(RED_LINE_CATEGORIES).includes(category))return null;
  const existing=s.redLines.find(r=>r.id===id)||null;
  const line=existing||{id:id||`redline-${s.redLines.length+1}`,category};
  line.severity=clamp(severity,.1,1);
  line.publiclyDeclared=Boolean(publiclyDeclared);
  line.ambiguity=clamp(ambiguity);
  line.alliedActorId=alliedActorId||null;
  line.credibility=clamp(line.credibility??(.55+(publiclyDeclared?.08:0)));
  line.probesTolerated=Math.max(0,line.probesTolerated||0);
  line.lastSignalTick=line.lastSignalTick??null;
  if(!existing)s.redLines.push(line);
  return {...line};
}

export function signalNuclearResolve(region,redLineId,{currentTick=null,intensity=.5}={}){
  const s=ensureNuclearDeterrence(region),line=s.redLines.find(r=>r.id===redLineId);if(!line)return null;
  const disciplined=clamp(.45+s.signalDiscipline*.45);
  line.credibility=clamp(line.credibility+clamp(intensity)*.14*disciplined);
  line.lastSignalTick=currentTick;
  return {...line};
}

function publicLines(target){return ensureNuclearDeterrence(target).redLines.filter(r=>r.publiclyDeclared);}
function categoryMatch(line,action){
  if(line.category===action.category)return 1;
  if(line.category===RED_LINE_CATEGORIES.HOMELAND_INVASION&&action.category==='border_incursion')return .45;
  if(line.category===RED_LINE_CATEGORIES.REGIME_SURVIVAL&&['capital_attack','homeland_invasion'].includes(action.category))return .7;
  return 0;
}

export function estimateRedLineRisk(observer,target,action={}){
  const estimate=estimateForeignNuclearWeaponCapability(observer,target);
  const observed=publicLines(target);
  let best=null;
  for(const line of observed){const match=categoryMatch(line,action);if(match<=0)continue;const severity=clamp(action.severity??.5);const thresholdFit=clamp((severity-line.severity+.35)/.7);const ambiguityPenalty=1-line.ambiguity*.45;const score=match*thresholdFit*line.credibility*ambiguityPenalty;if(!best||score>best.score)best={line,score};}
  const capability=estimate.assessment==='nuclear_capability_demonstrated'?1:estimate.assessment==='probable_nuclear_test'?.82:estimate.assessment==='untested_device_probable'?.62:estimate.assessment==='weaponisation_programme_suspected'?.28:0;
  const deniability=clamp(action.deniability??0),reversible=clamp(action.reversible??0);
  const perceivedRisk=clamp((best?.score||.03)*(.28+.72*capability)*(1-deniability*.34)*(1-reversible*.22));
  return {perceivedRisk,capabilityConfidence:estimate.confidence,matchedRedLineId:best?.line.id||null,publicRedLine:Boolean(best),salamiOpportunity:clamp((1-perceivedRisk)*(.45+.35*deniability+.20*reversible))};
}

export function actualRedLineCrossing(defender,action={}){
  const s=ensureNuclearDeterrence(defender),severity=clamp(action.severity??.5);
  const candidates=s.redLines.filter(l=>categoryMatch(l,action)>0);
  const crossed=candidates.filter(l=>severity>=l.severity);
  return {crossed:crossed.length>0,redLines:crossed.map(l=>l.id),severity};
}

export function recordRedLineProbe(defender,redLineId,{crossed=false,strongResponse=false,currentTick=null}={}){
  const line=ensureNuclearDeterrence(defender).redLines.find(r=>r.id===redLineId);if(!line)return null;
  if(strongResponse){line.credibility=clamp(line.credibility+.12);line.lastSignalTick=currentTick;}
  else if(!crossed){line.probesTolerated++;line.credibility=clamp(line.credibility-.045*(1+Math.min(4,line.probesTolerated)*.12));}
  else line.credibility=clamp(line.credibility-.12);
  return {...line};
}

export function beginOrUpdateNuclearCrisis(defender,challenger,action={},currentTick=null){
  const s=ensureNuclearDeterrence(defender),key=actorId(challenger)||challenger?.id||'unknown';
  const actual=actualRedLineCrossing(defender,action),foreign=estimateForeignNuclearWeaponCapability(challenger,defender);
  const deterrent=nuclearDeterrentStatus(defender);
  const capable=deterrent==='demonstrated_device_capability'?1:deterrent==='untested_device_capability'?.6:0;
  const crisis=s.crises[key]||{opponentActorId:key,level:0,pressure:0,lastTick:null,history:[]};
  const severity=clamp(action.severity??.5);
  const added=severity*.32+(actual.crossed?.34:0)+capable*.16;
  crisis.pressure=clamp(crisis.pressure+added);
  crisis.level=Math.min(NUCLEAR_CRISIS_LEVELS.RELEASE_CONSIDERATION,Math.floor(crisis.pressure*5.2));
  crisis.lastTick=currentTick;
  crisis.history.push({tick:currentTick,category:action.category,severity,redLineCrossed:actual.crossed,level:crisis.level});
  if(crisis.history.length>20)crisis.history.shift();
  s.crises[key]=crisis;
  return {...crisis,actualRedLine:actual,opponentEstimate:foreign};
}

export function coolNuclearCrises(region,elapsedDays=7){
  const s=ensureNuclearDeterrence(region),decay=Math.max(0,Number(elapsedDays)||0)/365.2425*.42;
  for(const crisis of Object.values(s.crises)){crisis.pressure=clamp(crisis.pressure-decay);crisis.level=Math.floor(crisis.pressure*5.2);}
  return s.crises;
}

export function npcNuclearProbeDecision(actor,target,action={}){
  const self=ensureNuclearDeterrence(actor),risk=estimateRedLineRisk(actor,target,action);
  const appetite=clamp(self.riskTolerance+(action.deniability||0)*.20+(action.reversible||0)*.12-risk.perceivedRisk);
  return {attempt:appetite>.25,appetite,...risk};
}

export function nuclearTriadReadiness(region,{fleets=[]}={}){
  const demonstrated=nuclearDeterrentStatus(region)==='demonstrated_device_capability';
  const aircraft=region.aviation?.aircraft||[];
  const bombers=aircraft.filter(a=>a.ownerType==='military'&&a.role==='bomber'&&a.status!=='destroyed').length;
  const tankers=aircraft.filter(a=>a.ownerType==='military'&&a.role==='tanker'&&a.status!=='destroyed').length;
  const ownedFleets=(fleets||[]).filter(f=>f.ownerRegionId===region.id||f.ownerActorId===actorId(region));
  const submarines=ownedFleets.flatMap(f=>f.ships||[]).filter(s=>s.designId==='submarine').length;
  const air={available:demonstrated&&bombers>0,bombers,tankers,refuellingSupported:tankers>0&&region.unlockedTechIds?.has?.('aerial_refuelling')};
  const land={available:false,reason:'strategic_land_missile_system_not_implemented'};
  const sea={available:false,submarines,reason:'ballistic_missile_submarine_system_not_implemented'};
  return {air,land,sea,legsAvailable:[air,land,sea].filter(x=>x.available).length,fullTriad:false};
}

export function tickNuclearDeterrence(regions,currentTick,elapsedDays=7){
  const events=[];
  for(const r of regions||[]){ensureNuclearDeterrence(r);coolNuclearCrises(r,elapsedDays);}
  return events;
}
