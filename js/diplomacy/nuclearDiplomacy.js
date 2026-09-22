import { nuclearDeterrentStatus } from '../military/nuclearWeaponisation.js?v=20260923-nuclear-hotpath1';
import { secondStrikeAssessment } from '../military/strategicDelivery.js?v=20260920-nuclear-diplomacy1';
import {
  NUCLEAR_TREATY_TYPES, ensureNuclearArmsControl, joinNuclearTreaty,
  nuclearTreatyConstraints, inspectNuclearTreaty, leaveNuclearTreaty
} from './nuclearArmsControl.js?v=20260920-nuclear-diplomacy1';
import {
  NUCLEAR_ALLIANCE_TYPES, establishNuclearSecurityArrangement,
  ALLIED_RED_LINE_CATEGORIES
} from './nuclearAlliedDeployments.js?v=20260920-nuclear-diplomacy1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;

export const NUCLEAR_DIPLOMATIC_RESPONSES=Object.freeze({
  PROTEST:'protest',DEMAND_INSPECTION:'demand_inspection',SANCTIONS:'sanctions',
  SUSPEND_ASSURANCE:'suspend_assurance',WITHDRAW:'withdraw'
});

export function ensureNuclearDiplomacy(region){
  region.nuclearDiplomacy ||= {};
  const s=region.nuclearDiplomacy;
  s.proposals ||= {};
  s.history ||= [];
  if(!Number.isFinite(s.negotiatingSkill))s.negotiatingSkill=clamp(region.governance?.administrativeControl||.35);
  if(!Number.isFinite(s.reputation))s.reputation=.6;
  if(!Number.isFinite(s.lastNpcProposalTick))s.lastNpcProposalTick=-Infinity;
  return s;
}

function relation(region,other){
  const id=actorId(other);
  const r=region.relations?.[id]||region.diplomacy?.relations?.[id]||{};
  return {trust:clamp(r.trust??.5),hostility:clamp(r.hostility??.25)};
}

function forceBurden(region,terms={}){
  const delivery=region.strategicDelivery||{};
  const land=(delivery.land?.fixedLaunchers||0)+(delivery.land?.mobileLaunchers||0);
  const sea=delivery.sea?.platformIds?.length||0;
  const proto=region.nuclearWeapons?.prototypeCount||0;
  let burden=0;
  if(Number.isFinite(terms.maxLandLaunchers)&&land>terms.maxLandLaunchers)burden+=clamp((land-terms.maxLandLaunchers)/Math.max(4,land))*.35;
  if(Number.isFinite(terms.maxStrategicSubmarines)&&sea>terms.maxStrategicSubmarines)burden+=clamp((sea-terms.maxStrategicSubmarines)/Math.max(2,sea))*.25;
  if(Number.isFinite(terms.maxPrototypes)&&proto>terms.maxPrototypes)burden+=clamp((proto-terms.maxPrototypes)/Math.max(1,proto))*.30;
  if(terms.prohibitAcquisition&&proto>0)burden+=.35;
  if(terms.prohibitForeignNuclearBasing&&Object.values(region.nuclearAlliance?.deployments||{}).some(d=>d.role==='host'&&d.status==='active'))burden+=.28;
  return clamp(burden);
}

export function createNuclearDiplomaticProposal(proposer,counterparties,{id=null,name=null,type=NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms={},securityGuarantee=null,verificationOffer=0,economicIncentive=0,expiresTick=null,currentTick=null}={}){
  const targets=(counterparties||[]).filter(Boolean).filter(r=>r!==proposer);
  if(!proposer||!targets.length)return null;
  const proposal={
    id:id||`nuclear-proposal-${proposer.id}-${currentTick??'now'}-${ensureNuclearDiplomacy(proposer).history.length+1}`,
    name:name||'Nuclear agreement proposal',type,terms:{...terms},proposerRegionId:proposer.id,
    targetRegionIds:targets.map(r=>r.id),securityGuarantee:securityGuarantee?{...securityGuarantee}:null,
    verificationOffer:clamp(verificationOffer),economicIncentive:clamp(economicIncentive),createdTick:currentTick,
    expiresTick:Number.isFinite(expiresTick)?expiresTick:null,status:'open',responses:{}
  };
  ensureNuclearDiplomacy(proposer).proposals[proposal.id]=structuredClone(proposal);
  for(const target of targets)ensureNuclearDiplomacy(target).proposals[proposal.id]=structuredClone(proposal);
  ensureNuclearDiplomacy(proposer).history.push({tick:currentTick,type:'nuclear_proposal_made',proposalId:proposal.id,targets:proposal.targetRegionIds});
  return structuredClone(proposal);
}

export function evaluateNuclearDiplomaticProposal(recipient,proposer,proposal){
  if(!recipient||!proposer||!proposal)return{accept:false,score:0};
  const rel=relation(recipient,proposer),arms=ensureNuclearArmsControl(recipient),constraints=nuclearTreatyConstraints(recipient);
  const ownStatus=nuclearDeterrentStatus(recipient),ownStrike=secondStrikeAssessment(recipient,{fleets:recipient.fleets||[]});
  const threat=clamp(arms.armsRace?.threatPressure||0);
  const terms=proposal.terms||{};
  const verification=clamp(terms.verification??proposal.verificationOffer??.5);
  const inspections=clamp(terms.inspectionAccess??.5);
  const assurance=clamp(terms.securityAssurance??proposal.securityGuarantee?.commitment??0);
  const sovereigntyCost=clamp(verification*.16+inspections*.24+(terms.prohibitForeignNuclearBasing?.08:0));
  const forceCost=forceBurden(recipient,terms);
  const reliability=clamp(arms.treatyReliability??.62);
  const securityValue=clamp(assurance*.42+proposal.economicIncentive*.15+verification*.12+(1-threat)*.08);
  const mutuality=clamp(rel.trust*.22+(1-rel.hostility)*.18+ensureNuclearDiplomacy(proposer).reputation*.12);
  const vulnerabilityPressure=ownStatus==='none'?threat*.18:ownStrike.firstStrikeVulnerability*.10;
  const existingAssurance=constraints.securityAssurance||recipient.nuclearAlliance?.extendedDeterrenceAssurance||0;
  const score=clamp(.30+securityValue+mutuality+reliability*.10+existingAssurance*.04-sovereigntyCost-forceCost-vulnerabilityPressure);
  return{accept:score>=.55,score,forceCost,sovereigntyCost,securityValue,mutuality};
}

export function respondToNuclearProposal(recipient,proposer,proposalId,{accept=null,counterTerms=null,currentTick=null}={}){
  const rs=ensureNuclearDiplomacy(recipient),proposal=rs.proposals[proposalId];if(!proposal||proposal.status!=='open')return null;
  const evaluation=evaluateNuclearDiplomaticProposal(recipient,proposer,proposal);
  const accepted=typeof accept==='boolean'?accept:evaluation.accept;
  proposal.responses[recipient.id]={accepted,counterTerms:counterTerms?{...counterTerms}:null,tick:currentTick,score:evaluation.score};
  const ps=ensureNuclearDiplomacy(proposer);if(ps.proposals[proposalId])ps.proposals[proposalId].responses[recipient.id]=structuredClone(proposal.responses[recipient.id]);
  rs.history.push({tick:currentTick,type:accepted?'nuclear_proposal_accepted':'nuclear_proposal_rejected',proposalId,proposerRegionId:proposer.id});
  return{accepted,evaluation,counterTerms};
}

export function concludeNuclearDiplomaticProposal(proposer,participants,proposalId,{currentTick=null}={}){
  const ps=ensureNuclearDiplomacy(proposer),proposal=ps.proposals[proposalId];if(!proposal||proposal.status!=='open')return{concluded:false,reason:'proposal_not_open'};
  const parties=[proposer,...(participants||[]).filter(r=>r&&r!==proposer)];
  const required=parties.filter(r=>r!==proposer);
  if(required.some(r=>proposal.responses?.[r.id]?.accepted!==true))return{concluded:false,reason:'not_all_parties_accepted'};
  const treatyId=`agreement-${proposal.id}`;
  for(const party of parties)joinNuclearTreaty(party,{id:treatyId,name:proposal.name,type:proposal.type,terms:proposal.terms,currentTick});
  if(proposal.securityGuarantee){
    const g=proposal.securityGuarantee;
    for(const host of required)establishNuclearSecurityArrangement(proposer,host,{id:`guarantee-${proposal.id}-${host.id}`,type:NUCLEAR_ALLIANCE_TYPES.EXTENDED_DETERRENCE,commitment:clamp(g.commitment??.65),publiclyDeclared:g.publiclyDeclared!==false,consultation:true,basingRights:Boolean(g.basingRights),peacetimeBasing:Boolean(g.peacetimeBasing),crisisBasing:g.crisisBasing!==false,redLineCategories:g.redLineCategories||[ALLIED_RED_LINE_CATEGORIES.NUCLEAR_ATTACK],currentTick});
  }
  proposal.status='concluded';proposal.concludedTick=currentTick;proposal.treatyId=treatyId;
  for(const party of required){const copy=ensureNuclearDiplomacy(party).proposals[proposalId];if(copy){copy.status='concluded';copy.concludedTick=currentTick;copy.treatyId=treatyId;}}
  ps.history.push({tick:currentTick,type:'nuclear_agreement_concluded',proposalId,treatyId,parties:parties.map(r=>r.id)});
  return{concluded:true,treatyId,parties:parties.map(r=>r.id)};
}

export function establishNuclearWeaponFreeZone(members,{id,name='Nuclear-weapon-free zone',verification=.75,inspectionAccess=.65,withdrawalNoticeDays=365,currentTick=null}={}){
  const parties=(members||[]).filter(Boolean);if(!id||parties.length<2)return null;
  const terms={prohibitAcquisition:true,prohibitTesting:true,safeguards:true,prohibitForeignNuclearBasing:true,maxPrototypes:0,verification:clamp(verification),inspectionAccess:clamp(inspectionAccess),withdrawalNoticeDays};
  for(const party of parties)joinNuclearTreaty(party,{id,name,type:NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms,currentTick});
  for(const party of parties)ensureNuclearDiplomacy(party).history.push({tick:currentTick,type:'nuclear_weapon_free_zone_joined',zoneId:id,members:parties.map(r=>r.id)});
  return{id,name,members:parties.map(r=>r.id),terms};
}

export function respondToDetectedNuclearViolation(observer,subject,treatyId,{response=NUCLEAR_DIPLOMATIC_RESPONSES.PROTEST,currentTick=null,rng=Math.random}={}){
  const inspection=inspectNuclearTreaty(observer,subject,treatyId,{currentTick,rng});
  if(!inspection.performed||!inspection.detected.length)return{acted:false,inspection};
  const od=ensureNuclearDiplomacy(observer),sd=ensureNuclearDiplomacy(subject);
  if(response===NUCLEAR_DIPLOMATIC_RESPONSES.DEMAND_INSPECTION){const m=subject.nuclearArmsControl?.treaties?.[treatyId];if(m){m.terms.inspectionAccess=clamp((m.terms.inspectionAccess||0)+.15);m.suspicion=clamp((m.suspicion||0)+.12);}}
  else if(response===NUCLEAR_DIPLOMATIC_RESPONSES.SANCTIONS){subject.nuclearDiplomaticPressure=clamp((subject.nuclearDiplomaticPressure||0)+.2+inspection.detected.length*.08);}
  else if(response===NUCLEAR_DIPLOMATIC_RESPONSES.SUSPEND_ASSURANCE){for(const a of Object.values(subject.nuclearAlliance?.arrangements||{}))if(a.role==='host'&&a.providerRegionId===observer.id)a.hostConsent=false;}
  else if(response===NUCLEAR_DIPLOMATIC_RESPONSES.WITHDRAW)leaveNuclearTreaty(observer,treatyId,{currentTick});
  sd.reputation=clamp(sd.reputation-.08*inspection.detected.length);od.history.push({tick:currentTick,type:'nuclear_violation_response',subjectRegionId:subject.id,treatyId,response,violations:[...inspection.detected]});
  return{acted:true,response,inspection};
}

export function npcNuclearDiplomacyPreference(region,others=[]){
  const status=nuclearDeterrentStatus(region),arms=ensureNuclearArmsControl(region),threat=clamp(arms.armsRace?.threatPressure||0);
  const nuclearPeers=(others||[]).filter(r=>r!==region&&nuclearDeterrentStatus(r)!=='none');
  if(status!=='none'&&nuclearPeers.length){const own=secondStrikeAssessment(region,{fleets:region.fleets||[]});return{kind:'arms_limitation',priority:clamp(.35+threat*.32+own.firstStrikeVulnerability*.18),targets:nuclearPeers};}
  if(status==='none'&&threat>.35)return{kind:'non_proliferation_for_assurance',priority:clamp(.35+threat*.5),targets:nuclearPeers};
  return{kind:'none',priority:0,targets:[]};
}

export function tickNuclearDiplomacy(regions,currentTick,elapsedDays=7){
  const events=[],world=regions||[];
  // Nuclear peer membership is a world fact for this tick. Compute it once;
  // npcNuclearDiplomacyPreference still runs for every region and applies the
  // same self-exclusion and bargaining rules.
  const nuclearPeers=world.filter(r=>nuclearDeterrentStatus(r)!=='none');
  for(const region of world){
    const s=ensureNuclearDiplomacy(region);
    for(const p of Object.values(s.proposals))if(p.status==='open'&&Number.isFinite(p.expiresTick)&&currentTick>=p.expiresTick){p.status='expired';events.push({type:'nuclear_proposal_expired',regionId:region.id,proposalId:p.id,tick:currentTick});}
    if(currentTick-s.lastNpcProposalTick<180)continue;
    const pref=npcNuclearDiplomacyPreference(region,nuclearPeers);
    if(pref.priority<.62||!pref.targets.length)continue;
    const target=pref.targets[0];
    if(pref.kind==='arms_limitation'){
      const id=`npc-arms-${region.id}-${target.id}-${currentTick}`;
      createNuclearDiplomaticProposal(region,[target],{id,name:'Strategic arms limitation talks',type:NUCLEAR_TREATY_TYPES.ARMS_LIMITATION,terms:{maxLandLaunchers:8,maxStrategicSubmarines:3,verification:.65,inspectionAccess:.45},currentTick,expiresTick:currentTick+365});
      s.lastNpcProposalTick=currentTick;events.push({type:'nuclear_negotiations_opened',regionId:region.id,targetRegionId:target.id,proposalId:id,tick:currentTick});
    }else if(pref.kind==='non_proliferation_for_assurance'){
      const id=`npc-np-${region.id}-${target.id}-${currentTick}`;
      createNuclearDiplomaticProposal(target,[region],{id,name:'Non-proliferation and security assurance',type:NUCLEAR_TREATY_TYPES.NON_PROLIFERATION,terms:{prohibitAcquisition:true,safeguards:true,verification:.7,inspectionAccess:.55,securityAssurance:.65},securityGuarantee:{commitment:.68,publiclyDeclared:true,redLineCategories:[ALLIED_RED_LINE_CATEGORIES.NUCLEAR_ATTACK,ALLIED_RED_LINE_CATEGORIES.HOMELAND_INVASION]},currentTick,expiresTick:currentTick+365});
      s.lastNpcProposalTick=currentTick;events.push({type:'nuclear_negotiations_opened',regionId:region.id,targetRegionId:target.id,proposalId:id,tick:currentTick});
    }
  }
  return events;
}
