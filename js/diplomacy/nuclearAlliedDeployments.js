import { knowledgeLevel } from '../core/knowledge.js?v=20260906-scouting1';
import { nuclearDeterrentStatus } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-alliance1';
import { strategicForceReadiness, STRATEGIC_BOMBER_DELIVERY_TECH_ID, STRATEGIC_MISSILE_TECH_ID, STRATEGIC_MISSILE_SUBMARINE_TECH_ID } from '../military/strategicDelivery.js?v=20260920-nuclear-alliance1';
import { nuclearTreatyConstraints } from './nuclearArmsControl.js?v=20260920-nuclear-diplomacy1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.id||null;
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

export const NUCLEAR_ALLIANCE_TYPES=Object.freeze({
  CONSULTATION:'consultation',
  EXTENDED_DETERRENCE:'extended_deterrence',
  BASING_RIGHTS:'basing_rights',
  NUCLEAR_SHARING:'nuclear_sharing'
});
export const ALLIED_NUCLEAR_ASSETS=Object.freeze({
  BOMBER:'bomber',
  LAND_MISSILE:'land_missile',
  STRATEGIC_SUBMARINE:'strategic_submarine'
});
export const ALLIED_DEPLOYMENT_MODES=Object.freeze({
  EXERCISE:'exercise',TEMPORARY:'temporary',CRISIS:'crisis',PERMANENT:'permanent'
});
export const ALLIED_RED_LINE_CATEGORIES=Object.freeze({
  HOMELAND_INVASION:'homeland_invasion',
  CAPITAL_ATTACK:'capital_attack',
  NUCLEAR_ATTACK:'nuclear_attack',
  STRATEGIC_FORCES_ATTACK:'strategic_forces_attack',
  REGIME_SURVIVAL:'regime_survival'
});

export function ensureNuclearAllianceState(region){
  region.nuclearAlliance ||= {};
  const s=region.nuclearAlliance;
  s.arrangements ||= {};
  s.deployments ||= {};
  s.history ||= [];
  s.coverage ||= [];
  if(!Number.isFinite(s.extendedDeterrenceAssurance))s.extendedDeterrenceAssurance=0;
  if(!Number.isFinite(s.hostAcceptance))s.hostAcceptance=.55;
  return s;
}

function mirrorArrangement(provider,host,a){
  ensureNuclearAllianceState(provider).arrangements[a.id]={...a,role:'provider'};
  ensureNuclearAllianceState(host).arrangements[a.id]={...a,role:'host'};
}

export function establishNuclearSecurityArrangement(provider,host,{id=null,type=NUCLEAR_ALLIANCE_TYPES.CONSULTATION,commitment=.45,publiclyDeclared=true,consultation=true,basingRights=false,peacetimeBasing=false,crisisBasing=true,assetTypes=[ALLIED_NUCLEAR_ASSETS.BOMBER],maxAssets=4,sharedPlanning=false,hostConsent=true,redLineCategories=[],redLineAmbiguity=.25,currentTick=null}={}){
  if(!provider||!host||provider===host||!Object.values(NUCLEAR_ALLIANCE_TYPES).includes(type))return null;
  const arrangement={id:id||`nuclear-arrangement-${provider.id}-${host.id}`,type,providerRegionId:provider.id,providerActorId:actorId(provider),hostRegionId:host.id,hostActorId:actorId(host),commitment:clamp(commitment),publiclyDeclared:Boolean(publiclyDeclared),consultation:Boolean(consultation),basingRights:Boolean(basingRights||type===NUCLEAR_ALLIANCE_TYPES.BASING_RIGHTS||type===NUCLEAR_ALLIANCE_TYPES.NUCLEAR_SHARING),peacetimeBasing:Boolean(peacetimeBasing),crisisBasing:Boolean(crisisBasing),assetTypes:[...new Set(assetTypes)].filter(x=>Object.values(ALLIED_NUCLEAR_ASSETS).includes(x)),maxAssets:Math.max(0,Math.round(maxAssets||0)),sharedPlanning:Boolean(sharedPlanning),hostConsent:Boolean(hostConsent),redLineCategories:[...new Set(redLineCategories)].filter(x=>Object.values(ALLIED_RED_LINE_CATEGORIES).includes(x)),redLineAmbiguity:clamp(redLineAmbiguity),status:'active',createdTick:currentTick};
  mirrorArrangement(provider,host,arrangement);
  ensureNuclearAllianceState(provider).history.push({tick:currentTick,type:'nuclear_arrangement_established',arrangementId:arrangement.id,hostRegionId:host.id});
  ensureNuclearAllianceState(host).history.push({tick:currentTick,type:'nuclear_arrangement_established',arrangementId:arrangement.id,providerRegionId:provider.id});
  return structuredClone(arrangement);
}

export function setAlliedNuclearRedLines(provider,host,arrangementId,{categories=[],commitment=null,ambiguity=null,publiclyDeclared=null,currentTick=null}={}){
  const ps=ensureNuclearAllianceState(provider),hs=ensureNuclearAllianceState(host),pa=ps.arrangements[arrangementId],ha=hs.arrangements[arrangementId];
  if(!pa||!ha)return null;
  const cats=[...new Set(categories)].filter(x=>Object.values(ALLIED_RED_LINE_CATEGORIES).includes(x));
  pa.redLineCategories=cats;ha.redLineCategories=[...cats];
  if(Number.isFinite(commitment)){pa.commitment=clamp(commitment);ha.commitment=pa.commitment;}
  if(Number.isFinite(ambiguity)){pa.redLineAmbiguity=clamp(ambiguity);ha.redLineAmbiguity=pa.redLineAmbiguity;}
  if(typeof publiclyDeclared==='boolean'){pa.publiclyDeclared=publiclyDeclared;ha.publiclyDeclared=publiclyDeclared;}
  ps.history.push({tick:currentTick,type:'allied_nuclear_red_lines_updated',arrangementId,categories:[...cats]});
  hs.history.push({tick:currentTick,type:'allied_nuclear_red_lines_updated',arrangementId,categories:[...cats]});
  return structuredClone(pa);
}

export function setNuclearHostConsent(host,arrangementId,consent,{currentTick=null}={}){
  const s=ensureNuclearAllianceState(host),a=s.arrangements[arrangementId];if(!a||a.role!=='host')return null;
  a.hostConsent=Boolean(consent);s.history.push({tick:currentTick,type:consent?'nuclear_host_consent_granted':'nuclear_host_consent_revoked',arrangementId});return {...a};
}

function providerAssetCapacity(provider,assetType){
  const force=strategicForceReadiness(provider,{fleets:provider.fleets||[]});
  if(assetType===ALLIED_NUCLEAR_ASSETS.BOMBER)return has(provider,STRATEGIC_BOMBER_DELIVERY_TECH_ID)?force.air.bombers:0;
  if(assetType===ALLIED_NUCLEAR_ASSETS.LAND_MISSILE)return has(provider,STRATEGIC_MISSILE_TECH_ID)?force.land.fixedLaunchers+force.land.mobileLaunchers:0;
  if(assetType===ALLIED_NUCLEAR_ASSETS.STRATEGIC_SUBMARINE)return has(provider,STRATEGIC_MISSILE_SUBMARINE_TECH_ID)?force.sea.strategicSubmarines:0;
  return 0;
}
function outboundCount(provider,assetType,ignoreId=null){return Object.values(ensureNuclearAllianceState(provider).deployments).filter(d=>d.role==='provider'&&d.status==='active'&&d.assetType===assetType&&d.id!==ignoreId).reduce((n,d)=>n+d.count,0);}

export function deployNuclearAssetsToAlly(provider,host,{id=null,arrangementId,assetType=ALLIED_NUCLEAR_ASSETS.BOMBER,count=1,mode=ALLIED_DEPLOYMENT_MODES.TEMPORARY,publiclyDeclared=false,startTick=null,endTick=null}={}){
  const ps=ensureNuclearAllianceState(provider),hs=ensureNuclearAllianceState(host),pa=ps.arrangements[arrangementId],ha=hs.arrangements[arrangementId];
  if(!pa||!ha||pa.status!=='active'||ha.status!=='active'||pa.hostRegionId!==host.id)return{deployed:false,reason:'no_active_arrangement'};
  if(!ha.hostConsent)return{deployed:false,reason:'host_consent_required'};
  if(nuclearTreatyConstraints(host).prohibitForeignNuclearBasing)return{deployed:false,reason:'treaty_prohibits_foreign_nuclear_basing'};
  if(!pa.basingRights)return{deployed:false,reason:'no_basing_rights'};
  if(!pa.assetTypes.includes(assetType))return{deployed:false,reason:'asset_type_not_authorised'};
  if(mode===ALLIED_DEPLOYMENT_MODES.PERMANENT&&!pa.peacetimeBasing)return{deployed:false,reason:'peacetime_basing_not_authorised'};
  if(mode===ALLIED_DEPLOYMENT_MODES.CRISIS&&!pa.crisisBasing)return{deployed:false,reason:'crisis_basing_not_authorised'};
  if(nuclearDeterrentStatus(provider)!=='demonstrated_device_capability')return{deployed:false,reason:'no_demonstrated_nuclear_capability'};
  const requested=Math.max(1,Math.round(count||1)),available=Math.max(0,providerAssetCapacity(provider,assetType)-outboundCount(provider,assetType));
  const deployedCount=Math.min(requested,available,pa.maxAssets||requested);if(deployedCount<=0)return{deployed:false,reason:'no_available_strategic_assets'};
  const deployment={id:id||`nuclear-deployment-${provider.id}-${host.id}-${assetType}-${startTick??'now'}`,arrangementId,providerRegionId:provider.id,providerActorId:actorId(provider),hostRegionId:host.id,hostActorId:actorId(host),assetType,count:deployedCount,mode,publiclyDeclared:Boolean(publiclyDeclared),startTick,endTick:Number.isFinite(endTick)?endTick:null,status:'active'};
  ps.deployments[deployment.id]={...deployment,role:'provider'};hs.deployments[deployment.id]={...deployment,role:'host'};
  ps.history.push({tick:startTick,type:'nuclear_assets_forward_deployed',deploymentId:deployment.id,hostRegionId:host.id,assetType,count:deployedCount});
  hs.history.push({tick:startTick,type:'foreign_nuclear_assets_hosted',deploymentId:deployment.id,providerRegionId:provider.id,assetType,count:deployedCount});
  return{deployed:true,deployment:structuredClone(deployment)};
}

export function withdrawAlliedNuclearDeployment(provider,host,deploymentId,{currentTick=null}={}){
  const pd=ensureNuclearAllianceState(provider).deployments[deploymentId],hd=ensureNuclearAllianceState(host).deployments[deploymentId];if(!pd||!hd)return false;
  pd.status='withdrawn';hd.status='withdrawn';pd.withdrawnTick=currentTick;hd.withdrawnTick=currentTick;return true;
}

export function estimateHostedNuclearPresence(observer,host){
  const s=ensureNuclearAllianceState(host),familiarity=observer?.id===host?.id?1:clamp(knowledgeLevel(observer,host?.id));
  const active=Object.values(s.deployments).filter(d=>d.role==='host'&&d.status==='active');
  const evidence=[];let score=0;
  for(const d of active){const visibility=d.publiclyDeclared?1:clamp(.18+familiarity*.55+Math.min(.22,d.count*.04)+(d.mode===ALLIED_DEPLOYMENT_MODES.CRISIS?.12:0));score=Math.max(score,visibility);if(d.publiclyDeclared||visibility>.52)evidence.push({assetType:d.assetType,countKnown:d.publiclyDeclared?d.count:null,confidence:visibility,providerActorId:d.providerActorId});}
  return{suspected:evidence.length>0,confidence:clamp(score),evidence};
}

export function extendedDeterrenceCoverage(host){return ensureNuclearAllianceState(host).coverage||[];}

function redLineMatch(coverage,action={}){
  if(!coverage.redLineCategories?.length)return .55;
  if(coverage.redLineCategories.includes(action.category))return 1;
  if(coverage.redLineCategories.includes(ALLIED_RED_LINE_CATEGORIES.HOMELAND_INVASION)&&action.category==='border_incursion')return .45;
  if(coverage.redLineCategories.includes(ALLIED_RED_LINE_CATEGORIES.REGIME_SURVIVAL)&&['capital_attack','homeland_invasion'].includes(action.category))return .72;
  return 0;
}

export function estimateExtendedDeterrenceForAttack(observer,host,action={}){
  const coverage=extendedDeterrenceCoverage(host);let best=null;
  for(const c of coverage){if(!c.active)continue;const match=redLineMatch(c,action);if(match<=0)continue;const publicFactor=c.publiclyDeclared?1:.45,commitment=clamp(c.commitment),deployed=clamp(c.forwardDeploymentSignal||0),actionSeverity=clamp(action.severity??.5),ambiguityPenalty=1-clamp(c.redLineAmbiguity??.25)*.42;const risk=clamp((commitment*.50+c.providerRetaliationConfidence*.28+deployed*.22)*publicFactor*ambiguityPenalty*match*(.62+.38*actionSeverity));if(!best||risk>best.perceivedRisk)best={perceivedRisk:risk,providerActorId:c.providerActorId,arrangementId:c.arrangementId,forwardDeploymentSignal:deployed,matchedAlliedRedLine:action.category};}
  return best||{perceivedRisk:0,providerActorId:null,arrangementId:null,forwardDeploymentSignal:0,matchedAlliedRedLine:null};
}

export function tickAlliedNuclearDeployments(regions,currentTick,elapsedDays=7){
  const events=[],byId=new Map((regions||[]).map(r=>[r.id,r]));
  for(const r of regions||[]){const s=ensureNuclearAllianceState(r);for(const d of Object.values(s.deployments)){if(d.status==='active'&&Number.isFinite(d.endTick)&&currentTick>=d.endTick){d.status='withdrawn';d.withdrawnTick=currentTick;events.push({type:'allied_nuclear_deployment_ended',regionId:r.id,deploymentId:d.id,tick:currentTick});}}s.coverage=[];s.extendedDeterrenceAssurance=0;}
  for(const provider of regions||[]){const ps=ensureNuclearAllianceState(provider),providerStatus=nuclearDeterrentStatus(provider),force=strategicForceReadiness(provider,{fleets:provider.fleets||[]});for(const a of Object.values(ps.arrangements)){if(a.role!=='provider'||a.status!=='active')continue;const host=byId.get(a.hostRegionId);if(!host)continue;const hostCopy=ensureNuclearAllianceState(host).arrangements[a.id];if(!hostCopy?.hostConsent)continue;const activeDeployments=Object.values(ps.deployments).filter(d=>d.role==='provider'&&d.status==='active'&&d.arrangementId===a.id);const forwardSignal=clamp(activeDeployments.reduce((n,d)=>n+d.count*(d.mode===ALLIED_DEPLOYMENT_MODES.CRISIS?.13:.08),0));const capable=providerStatus==='demonstrated_device_capability';const coverage={arrangementId:a.id,providerRegionId:provider.id,providerActorId:actorId(provider),active:capable&&a.type!==NUCLEAR_ALLIANCE_TYPES.CONSULTATION,commitment:a.commitment,publiclyDeclared:a.publiclyDeclared,consultation:a.consultation,sharedPlanning:a.sharedPlanning,redLineCategories:[...(a.redLineCategories||[])],redLineAmbiguity:a.redLineAmbiguity??.25,providerRetaliationConfidence:force.retaliationConfidence,forwardDeploymentSignal:forwardSignal};const hs=ensureNuclearAllianceState(host);hs.coverage.push(coverage);if(coverage.active)hs.extendedDeterrenceAssurance=Math.max(hs.extendedDeterrenceAssurance,clamp(a.commitment*.62+force.retaliationConfidence*.28+forwardSignal*.10));}}
  return events;
}
