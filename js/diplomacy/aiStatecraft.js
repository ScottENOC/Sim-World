import { cryptographicCapabilities, ensureInformationIntegrity, recordInformationIncident } from './informationIntegrity.js?v=20260922-info1';
import { ensureCounterIntelligence } from './counterIntelligence.js?v=20260909-counterintel1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const polityId=(r)=>r?.governance?.sovereignPolityId||r?.polityId||r?.controllingActorId||r?.id||null;
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));
let nextAccordId=1;
let nextOperationId=1;

export const AI_GOVERNANCE_MEASURES=Object.freeze({
  INCIDENT_REPORTING:'incident_reporting',
  COMPUTE_REGISTRY:'compute_registry',
  DATACENTRE_REGISTRY:'datacentre_registry',
  FRONTIER_MODEL_NOTIFICATION:'frontier_model_notification',
  EVALUATION_STANDARDS:'evaluation_standards',
  INSPECTION_RIGHTS:'inspection_rights',
  STRATEGIC_AI_LIMITS:'strategic_ai_limits',
  NUCLEAR_AI_RESTRICTIONS:'nuclear_ai_restrictions',
  AUTONOMOUS_WEAPON_LIMITS:'autonomous_weapon_limits',
  EMERGENCY_HOTLINE:'emergency_hotline',
  MODEL_EXPORT_CONTROLS:'model_export_controls',
});

export const AI_STATECRAFT_OPERATIONS=Object.freeze({
  MODEL_KNOWLEDGE:'model_knowledge',
  COMPUTE_MAPPING:'compute_mapping',
  SAFETY_EVALUATIONS:'safety_evaluations',
  GOVERNANCE_INTELLIGENCE:'governance_intelligence',
  DATA_INTEGRITY_ATTACK:'data_integrity_attack',
});

export function ensureAiGovernance(region){
  region.aiGovernance||={};
  const s=region.aiGovernance;
  s.policy||={};
  for(const [k,v] of Object.entries({
    transparency:.45,registryCompliance:.50,inspectionAcceptance:.35,incidentReporting:.45,
    exportControlStrength:.30,strategicRestraint:.55,concealment:.15,
  }))if(!Number.isFinite(s.policy[k]))s.policy[k]=v;
  s.registry||={};
  for(const [k,v] of Object.entries({declaredCompute:0,declaredDatacentres:0,frontierModels:0,lastDeclarationTick:null}))if(s.registry[k]===undefined)s.registry[k]=v;
  s.verification||={};
  for(const [k,v] of Object.entries({confidence:.20,lastInspectionTick:null,inspectionCount:0,detectedDiscrepancies:0}))if(s.verification[k]===undefined)s.verification[k]=v;
  s.intelligence||={};
  for(const [k,v] of Object.entries({foreignModelKnowledge:0,foreignComputeKnowledge:0,foreignSafetyKnowledge:0,foreignGovernanceKnowledge:0}))if(!Number.isFinite(s.intelligence[k]))s.intelligence[k]=v;
  s.operations||=[];
  return s;
}

export function setAiGovernancePolicy(region,patch={}){
  const s=ensureAiGovernance(region);
  for(const k of Object.keys(s.policy))if(Number.isFinite(patch[k]))s.policy[k]=clamp(patch[k]);
  return {...s.policy};
}

function aiCapability(region){return clamp(region?.aiLabour?.capability??region?.aiEconomy?.capability??0);}
function aiAdoption(region){return clamp(region?.aiLabour?.adoption??0);}
function computeCapability(region){return clamp(Math.max(region?.computingIndustry?.capability||0,region?.computingIndustry?.digitalCapability||0,region?.digitalInfrastructure?.coverage||0));}
function governanceCapacity(region){return clamp(region?.governance?.administrativeControl??region?.polityAdministration?.recordKeeping??.3);}
function territories(polityIdValue,regions=[]){return regions.filter(r=>polityId(r)===polityIdValue);}
function weightedCapability(rs=[],fn){let n=0,w=0;for(const r of rs){const p=Math.max(1,Number(r.population)||1);n+=fn(r)*p;w+=p;}return w?n/w:0;}

export function aiGovernanceReadiness(region){
  const crypto=cryptographicCapabilities(region),g=ensureAiGovernance(region);
  const capability=aiCapability(region),compute=computeCapability(region),admin=governanceCapacity(region);
  const monitoring=clamp(region.aiControl?.monitoringMaturity||0),evaluation=clamp(region.aiControl?.evaluationMaturity||0);
  return clamp(capability*.18+compute*.18+admin*.18+monitoring*.16+evaluation*.16+crypto.authentication*.08+g.policy.transparency*.06);
}

export function registerFrontierAi(region,{compute=0,datacentres=0,frontierModels=0,currentTick=null}={}){
  const g=ensureAiGovernance(region),compliance=clamp(g.policy.registryCompliance*(1-g.policy.concealment*.55));
  g.registry.declaredCompute=Math.max(g.registry.declaredCompute,Math.max(0,Number(compute)||0)*compliance);
  g.registry.declaredDatacentres=Math.max(g.registry.declaredDatacentres,Math.max(0,Number(datacentres)||0)*compliance);
  g.registry.frontierModels=Math.max(g.registry.frontierModels,Math.max(0,Number(frontierModels)||0)*compliance);
  g.registry.lastDeclarationTick=currentTick;
  return {...g.registry};
}

export function establishAiGovernanceAccord(world,{name='Frontier AI Accord',memberPolityIds=[],measures=[],verificationStrength=.5,reportingStrength=.5,exportControlCoordination=.25}={},currentTick=0){
  world.aiGovernanceAccords||=[];
  const members=[...new Set(memberPolityIds)].filter(id=>world.polities?.some?.(p=>p.id===id));
  const validMeasures=[...new Set(measures)].filter(m=>Object.values(AI_GOVERNANCE_MEASURES).includes(m));
  if(members.length<2||!validMeasures.length)return{formed:false,reason:'insufficient_members_or_measures'};
  const accord={id:`ai-accord-${nextAccordId++}`,name,foundedTick:currentTick,memberPolityIds:members,measures:validMeasures,verificationStrength:clamp(verificationStrength),reportingStrength:clamp(reportingStrength),exportControlCoordination:clamp(exportControlCoordination),active:true,inspections:[],incidents:[]};
  world.aiGovernanceAccords.push(accord);
  return{formed:true,accord};
}

function accordCoverage(world,polityIdValue,measure){
  return (world.aiGovernanceAccords||[]).filter(a=>a.active&&a.memberPolityIds.includes(polityIdValue)&&a.measures.includes(measure));
}

export function conductAiInspection(world,accord,targetPolityId,currentTick=0,rng=Math.random){
  if(!accord?.active||!accord.memberPolityIds.includes(targetPolityId)||!accord.measures.includes(AI_GOVERNANCE_MEASURES.INSPECTION_RIGHTS))return{inspected:false,reason:'no_inspection_rights'};
  const rs=territories(targetPolityId,world.regions||[]);if(!rs.length)return{inspected:false,reason:'no_target_regions'};
  const targetReadiness=weightedCapability(rs,aiGovernanceReadiness);
  const acceptance=weightedCapability(rs,r=>ensureAiGovernance(r).policy.inspectionAcceptance);
  const concealment=weightedCapability(rs,r=>ensureAiGovernance(r).policy.concealment);
  const cryptoDefence=weightedCapability(rs,r=>cryptographicCapabilities(r).authentication);
  const verification=clamp(accord.verificationStrength*.48+targetReadiness*.22+acceptance*.18+cryptoDefence*.12-concealment*.38);
  const discrepancy=clamp(concealment*(.35+.45*aiCapability(rs[0]))*(1-verification*.55));
  const detected=(rng?.()??Math.random())<clamp(verification*.28+discrepancy*.55);
  for(const r of rs){const g=ensureAiGovernance(r);g.verification.inspectionCount++;g.verification.lastInspectionTick=currentTick;g.verification.confidence=clamp(g.verification.confidence*.65+verification*.35);if(detected)g.verification.detectedDiscrepancies++;}
  const inspection={tick:currentTick,targetPolityId,verificationConfidence:verification,discrepancyDetected:detected};accord.inspections.push(inspection);if(accord.inspections.length>60)accord.inspections.shift();
  return{inspected:true,...inspection};
}

function operationSpec(type){
  return {
    [AI_STATECRAFT_OPERATIONS.MODEL_KNOWLEDGE]:{difficulty:.58,benefit:'foreignModelKnowledge'},
    [AI_STATECRAFT_OPERATIONS.COMPUTE_MAPPING]:{difficulty:.42,benefit:'foreignComputeKnowledge'},
    [AI_STATECRAFT_OPERATIONS.SAFETY_EVALUATIONS]:{difficulty:.50,benefit:'foreignSafetyKnowledge'},
    [AI_STATECRAFT_OPERATIONS.GOVERNANCE_INTELLIGENCE]:{difficulty:.34,benefit:'foreignGovernanceKnowledge'},
    [AI_STATECRAFT_OPERATIONS.DATA_INTEGRITY_ATTACK]:{difficulty:.68,benefit:null},
  }[type]||null;
}

export function launchAiStatecraftOperation(attacker,target,{type=AI_STATECRAFT_OPERATIONS.COMPUTE_MAPPING,intensity=.5}={},currentTick=0,rng=Math.random){
  if(!attacker||!target||polityId(attacker)===polityId(target))return{launched:false,reason:'invalid_target'};
  const spec=operationSpec(type);if(!spec)return{launched:false,reason:'invalid_operation'};
  const a=ensureAiGovernance(attacker),t=ensureAiGovernance(target),aCrypto=cryptographicCapabilities(attacker),tCrypto=cryptographicCapabilities(target),tCi=ensureCounterIntelligence(target);
  const ai=aiCapability(attacker),compute=computeCapability(attacker),tradecraft=clamp(aCrypto.codebreaking*.30+aCrypto.confidentiality*.15+ai*.24+compute*.16+a.intelligence.foreignGovernanceKnowledge*.15);
  const defence=clamp(tCrypto.authentication*.22+tCrypto.publicKeyInfrastructure*.14+tCi.credentialSecurity*.20+tCi.verificationCaution*.14+(target.aiControl?.monitoringMaturity||0)*.18+t.policy.transparency*.05+(1-t.policy.concealment)*.07);
  const successChance=clamp(.18+tradecraft*.66+clamp(intensity)*.18-defence*.52-spec.difficulty*.18,.03,.92);
  const success=(rng?.()??Math.random())<successChance;
  const detectionChance=clamp(.08+defence*.58+clamp(intensity)*.20-tradecraft*.26,.03,.88);
  const detected=(rng?.()??Math.random())<detectionChance;
  const attributionChance=clamp(.05+tCrypto.authentication*.18+(target.aiControl?.monitoringMaturity||0)*.18+tCi.verificationCaution*.12-tradecraft*.16,.02,.72);
  const attributed=detected&&(rng?.()??Math.random())<attributionChance;
  let gain=0;
  if(success){
    gain=clamp(.04+.16*clamp(intensity)+.10*tradecraft);
    if(spec.benefit)a.intelligence[spec.benefit]=clamp(a.intelligence[spec.benefit]+gain);
    if(type===AI_STATECRAFT_OPERATIONS.DATA_INTEGRITY_ATTACK){
      target.aiDataIntegrityPressure=clamp((target.aiDataIntegrityPressure||0)+gain*.75);
      if(target.aiSystemicRisk?.pressures)target.aiSystemicRisk.pressures.objectiveFailure=clamp((target.aiSystemicRisk.pressures.objectiveFailure||0)+gain*.28);
    }
  }
  const operation={id:`ai-op-${nextOperationId++}`,tick:currentTick,type,intensity:clamp(intensity),targetPolityId:polityId(target),success,detected,attributed,successChance,detectionChance,attributionChance,gain};
  a.operations.push(operation);if(a.operations.length>50)a.operations.shift();
  if(detected){
    recordInformationIncident(target,{type:'ai_statecraft_intrusion',headline:`Suspected foreign AI intrusion detected in ${target.name||target.id}`,tick:currentTick,allegedActorId:attributed?polityId(attacker):null,sourceReliability:.66,provenance:.58,corroboration:.42,forensicSupport:.48,attributionEvidence:attributed?.62:.18,evidenceType:'digital',narratives:attributed?[]:[{kind:'alternative_attribution',reach:.32,sourceReliability:.42,evidenceSupport:.18,publishedTick:currentTick}]});
  }
  return{launched:true,...operation};
}

function updateRegionalCompliance(world,region,elapsedDays){
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425,g=ensureAiGovernance(region),id=polityId(region);
  const reporting=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.INCIDENT_REPORTING);
  const registry=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.COMPUTE_REGISTRY).length+accordCoverage(world,id,AI_GOVERNANCE_MEASURES.DATACENTRE_REGISTRY).length;
  const evals=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.EVALUATION_STANDARDS);
  const nuclear=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.NUCLEAR_AI_RESTRICTIONS);
  const strategic=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.STRATEGIC_AI_LIMITS);
  const exportControls=accordCoverage(world,id,AI_GOVERNANCE_MEASURES.MODEL_EXPORT_CONTROLS);
  const reportingTarget=clamp(g.policy.incidentReporting+(reporting.length?Math.max(...reporting.map(a=>a.reportingStrength))*.35:0));
  const registryTarget=clamp(g.policy.registryCompliance+(registry?Math.min(.35,registry*.10):0));
  g.policy.incidentReporting=clamp(g.policy.incidentReporting+(reportingTarget-g.policy.incidentReporting)*Math.min(1,years*.7));
  g.policy.registryCompliance=clamp(g.policy.registryCompliance+(registryTarget-g.policy.registryCompliance)*Math.min(1,years*.7));
  if(evals.length&&region.aiControl)region.aiControl.evaluationMaturity=clamp((region.aiControl.evaluationMaturity||0)+years*.018*(1-region.aiControl.evaluationMaturity));
  if(nuclear.length&&region.strategicAi?.policy)region.strategicAi.policy.nuclearCommandIntegration=clamp((region.strategicAi.policy.nuclearCommandIntegration||0)-years*.045*g.policy.strategicRestraint);
  if(strategic.length)region.aiCompetitionPressure=clamp((region.aiCompetitionPressure||0)-years*.020*g.policy.strategicRestraint);
  if(exportControls.length)region.aiModelExportControl=clamp(Math.max(region.aiModelExportControl||0,g.policy.exportControlStrength*Math.max(...exportControls.map(a=>a.exportControlCoordination))));
}

export function tickInternationalAiStatecraft(world,currentTick=0,elapsedDays=30,rng=Math.random){
  const events=[];
  for(const region of world.regions||[]){
    updateRegionalCompliance(world,region,elapsedDays);
    const g=ensureAiGovernance(region),cap=aiCapability(region),compute=computeCapability(region);
    if(cap>.45||compute>.55){
      registerFrontierAi(region,{compute:compute*100,datacentres:Math.round(compute*8),frontierModels:Math.round(cap*4),currentTick});
      region.report||={};region.report.aiGovernance={policy:{...g.policy},registry:{...g.registry},verification:{...g.verification},intelligence:{...g.intelligence}};
    }
  }
  for(const accord of world.aiGovernanceAccords||[]){
    if(!accord.active)continue;
    if(accord.measures.includes(AI_GOVERNANCE_MEASURES.INSPECTION_RIGHTS)){
      const interval=Math.max(26,Math.round(104-accord.verificationStrength*52));
      if(currentTick>0&&currentTick%interval===0){
        for(const id of accord.memberPolityIds){
          const result=conductAiInspection(world,accord,id,currentTick,rng);
          if(result.inspected&&result.discrepancyDetected)events.push({type:'ai_governance_discrepancy_detected',organisationId:accord.id,accordId:accord.id,polityId:id,targetPolityId:id,playerRelevant:true,verificationConfidence:result.verificationConfidence});
        }
      }
    }
  }
  return events;
}

export function aiGovernanceSummary(region){
  const g=ensureAiGovernance(region);
  return{policy:{...g.policy},registry:{...g.registry},verification:{...g.verification},intelligence:{...g.intelligence},recentOperations:g.operations.slice(-8).map(o=>({...o}))};
}
