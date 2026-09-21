const DAYS_PER_YEAR=365.2425;
const KEYS=['households','agriculture','livestock','industry','controlledEnvironment'];
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);

function hasTech(region,id){return Boolean(region?.unlockedTechIds?.has?.(id));}
function assetCapacity(region,typeId){return (region?.construction?.assets||[]).filter(a=>a?.typeId===typeId&&(a.condition??1)>.05).reduce((sum,a)=>sum+clamp(a.condition??1)*Math.max(.1,positive(a.scale)||1),0);}
function modernWaterCapability(region){return hasTech(region,'industrial_electrification')&&hasTech(region,'germ_theory')&&positive(region?.population)>=18000;}
function administrativeCapacity(region){return clamp(region?.governance?.administrativeControl??region?.administration?.officialdom??region?.massPolitics?.administrativeCapacity??.25);}
function fiscalCapacity(region){
  const pop=Math.max(1,positive(region?.population));
  const liquidPerCapita=positive(region?.wallet)/pop;
  const wealthSignal=clamp(Math.log1p(liquidPerCapita*1500)/6);
  const industrialSignal=clamp(positive(region?.industrialPlants?.factoryCapacity)/70+(region?.electricity?.industrialService||0)*.25);
  return clamp(wealthSignal*.55+industrialSignal*.25+administrativeCapacity(region)*.20);
}

export function ensureWaterGovernance(region){
  region.waterGovernance||={};const s=region.waterGovernance;
  s.policy||={};const p=s.policy;
  const defaults={restrictionSeverity:0,automaticDroughtRestrictions:true,environmentalFlowFloor:.16,groundwaterExtractionCap:1,groundwaterEmergencyBan:false,scarcityPricing:0,industryPriority:.35,householdPriority:.8,agriculturePriority:.55,livestockPriority:.55,controlledEnvironmentPriority:.45,tradableRights:false,playerLocked:false};
  for(const [k,v] of Object.entries(defaults))if(p[k]===undefined)p[k]=v;
  for(const k of ['restrictionSeverity','environmentalFlowFloor','groundwaterExtractionCap','scarcityPricing','industryPriority','householdPriority','agriculturePriority','livestockPriority','controlledEnvironmentPriority'])p[k]=clamp(p[k]);
  const stateDefaults={droughtStage:0,householdRestriction:0,restrictionDurationYears:0,householdHardship:0,necessaryHardship:0,avoidableHardship:0,underinvestment:0,allocationInequity:0,affordabilityBurden:0,grievance:0,migrationPenalty:0,emigrationPush:0,revolutionaryPressure:0,fairness:1,scarcityPricingDemandReduction:0};
  for(const [k,v] of Object.entries(stateDefaults))if(!Number.isFinite(s[k]))s[k]=v;
  return s;
}

export function setWaterGovernancePolicy(region,patch={},options={}){
  const s=ensureWaterGovernance(region),p=s.policy;
  const numeric=['restrictionSeverity','environmentalFlowFloor','groundwaterExtractionCap','scarcityPricing','industryPriority','householdPriority','agriculturePriority','livestockPriority','controlledEnvironmentPriority'];
  for(const k of numeric)if(patch[k]!==undefined)p[k]=clamp(patch[k]);
  for(const k of ['automaticDroughtRestrictions','groundwaterEmergencyBan','tradableRights'])if(patch[k]!==undefined)p[k]=Boolean(patch[k]);
  if(options.playerIssued)p.playerLocked=true;
  return {...p};
}

function automaticPolicy(region){
  const s=ensureWaterGovernance(region),p=s.policy;if(p.playerLocked)return;
  const water=region.waterResources||{};
  const stress=clamp(Math.max(water.stressIndex||0,water.chronicStress||0));
  const aquifer=clamp(water.groundwaterLevel??1);
  s.droughtStage=clamp(stress*.72+(1-aquifer)*.28);
  if(p.automaticDroughtRestrictions)p.restrictionSeverity=clamp((s.droughtStage-.18)/.72);
  if(aquifer<.18)p.groundwaterExtractionCap=Math.min(p.groundwaterExtractionCap,.22);
  else if(aquifer<.35)p.groundwaterExtractionCap=Math.min(p.groundwaterExtractionCap,.55);
}

export function prepareWaterGovernance(region){automaticPolicy(region);return ensureWaterGovernance(region);}

export function waterDemandCaps(region,demand){
  const s=ensureWaterGovernance(region),p=s.policy;
  const restrictionCut=p.restrictionSeverity*(.08+.42*p.householdPriority);
  const priceCut=p.scarcityPricing*(.05+.18*administrativeCapacity(region));
  s.scarcityPricingDemandReduction=clamp(priceCut,0,.24);
  return {households:positive(demand.households)*(1-clamp(restrictionCut+s.scarcityPricingDemandReduction,0,.72)),agriculture:positive(demand.agriculture),livestock:positive(demand.livestock),industry:positive(demand.industry),controlledEnvironment:positive(demand.controlledEnvironment)};
}

export function waterAllocationWeights(region){
  const p=ensureWaterGovernance(region).policy;
  const rightsBonus=p.tradableRights*administrativeCapacity(region)*.08;
  return {households:.7+1.5*p.householdPriority,agriculture:.55+1.05*p.agriculturePriority,livestock:.5+.95*p.livestockPriority,industry:.5+1.25*p.industryPriority+rightsBonus,controlledEnvironment:.45+.9*p.controlledEnvironmentPriority+rightsBonus};
}

export function allocateWaterByPolicy(region,demand,available,existing={}){
  const caps=waterDemandCaps(region,demand),weights=waterAllocationWeights(region),out=Object.fromEntries(KEYS.map(k=>[k,0]));
  let remaining=positive(available);if(remaining<=0)return out;
  for(let pass=0;pass<6&&remaining>1e-9;pass++){
    const open=KEYS.map(k=>({k,need:Math.max(0,caps[k]-positive(existing[k])-out[k]),w:weights[k]})).filter(x=>x.need>1e-9);
    if(!open.length)break;const totalW=open.reduce((n,x)=>n+x.w,0);let used=0;
    for(const x of open){const take=Math.min(x.need,remaining*(x.w/totalW));out[x.k]+=take;used+=take;}
    if(used<=1e-10)break;remaining=Math.max(0,remaining-used);
  }
  return out;
}

export function governedResidualDemand(region,demand,allocation){const caps=waterDemandCaps(region,demand),out={};for(const k of KEYS)out[k]=Math.max(0,caps[k]-positive(allocation[k]));return out;}
export function surfaceWithdrawalPolicyMultiplier(region){return clamp(1-ensureWaterGovernance(region).policy.environmentalFlowFloor,.35,1);}
export function groundwaterPolicyMultiplier(region){const p=ensureWaterGovernance(region).policy;return p.groundwaterEmergencyBan?0:clamp(p.groundwaterExtractionCap);}

function infrastructureUnderinvestment(region){
  if(!modernWaterCapability(region))return 0;
  const water=region.waterResources||{};
  const stress=clamp(Math.max(water.chronicStress||0,water.stressIndex||0));if(stress<.08)return 0;
  const treatment=clamp(assetCapacity(region,'water_treatment_plant')),pump=clamp(assetCapacity(region,'water_pumping_station')),pipeline=clamp(assetCapacity(region,'bulk_water_pipeline'));
  const coastal=Boolean(region?.isCoastal||(region?.seaRegionIds||[]).length||(region?.adjacentSeaRegionIds||[]).length),desal=coastal?clamp(assetCapacity(region,'desalination_plant')):1;
  const gap=clamp((1-treatment)*.18+(1-pump)*.28+(1-pipeline)*.32+(1-desal)*.22);
  const capacityToAct=fiscalCapacity(region);
  return clamp(gap*stress*(.20+.80*capacityToAct));
}

export function finaliseWaterGovernance(region,elapsedDays=7){
  const s=ensureWaterGovernance(region),p=s.policy,w=region.waterResources||{},years=positive(elapsedDays)/DAYS_PER_YEAR;
  const hhSat=clamp(w.householdSatisfaction??1),indSat=clamp(w.industrySatisfaction??1),agSat=clamp(w.irrigationSatisfaction??1);
  const physicalStress=clamp(Math.max(w.stressIndex||0,w.chronicStress||0));
  const climateScarcity=clamp(1-(region?.climate?.rainfallMultiplier??1),0,1);
  const shortage=1-hhSat;
  const protectedIndustry=clamp(Math.max(0,indSat-hhSat)*(.45+.55*p.industryPriority));
  s.underinvestment=infrastructureUnderinvestment(region);
  s.allocationInequity=clamp(protectedIndustry+Math.max(0,agSat-hhSat)*.18);
  const avoidability=clamp(s.allocationInequity*.62+s.underinvestment*.70);
  const necessaryShare=clamp(physicalStress*.72+climateScarcity*.28)*(1-avoidability*.65);
  s.necessaryHardship=clamp(shortage*necessaryShare);
  s.avoidableHardship=clamp(shortage*avoidability+p.restrictionSeverity*(.16+.38*s.underinvestment));
  s.householdRestriction=clamp(Math.max(shortage,p.restrictionSeverity*.5,s.scarcityPricingDemandReduction*.55));
  const restricted=s.householdRestriction>.08;
  s.restrictionDurationYears=restricted?Math.min(20,s.restrictionDurationYears+years):Math.max(0,s.restrictionDurationYears-years*1.8);
  const wealthPerCapita=positive(region?.wallet)/Math.max(1,positive(region?.population));
  const affordabilitySensitivity=clamp(1-Math.log1p(wealthPerCapita*500)/5,.25,1);
  s.affordabilityBurden=clamp(p.scarcityPricing*(.35+.65*s.householdRestriction)*affordabilitySensitivity);
  const chronic=clamp(s.restrictionDurationYears/3);
  const hardshipTarget=clamp(s.necessaryHardship*.48+s.avoidableHardship*.92+s.affordabilityBurden*.48);
  const gain=clamp(years*(hardshipTarget>s.householdHardship?2.4:.8),0,1);s.householdHardship=clamp(s.householdHardship+(hardshipTarget-s.householdHardship)*gain);
  const grievanceTarget=clamp(s.necessaryHardship*.28+s.avoidableHardship*.88+s.allocationInequity*.48+s.underinvestment*.34+s.affordabilityBurden*.45);
  s.grievance=clamp(s.grievance+(grievanceTarget-s.grievance)*clamp(years*(grievanceTarget>s.grievance?2.1:.55),0,1));
  s.migrationPenalty=clamp(s.householdHardship*.52+s.grievance*.28+chronic*.20);
  s.emigrationPush=clamp(s.householdHardship*.42+s.avoidableHardship*.38+chronic*.20);
  s.revolutionaryPressure=clamp(Math.max(0,s.grievance-.28)*1.05*chronic+s.avoidableHardship*.32*chronic);
  s.fairness=clamp(1-s.allocationInequity*.62-s.avoidableHardship*.55);
  region.report||={};region.report.waterGovernance={workers:0,policy:{...p},droughtStage:s.droughtStage,householdRestriction:s.householdRestriction,restrictionDurationYears:s.restrictionDurationYears,householdHardship:s.householdHardship,necessaryHardship:s.necessaryHardship,avoidableHardship:s.avoidableHardship,underinvestment:s.underinvestment,allocationInequity:s.allocationInequity,affordabilityBurden:s.affordabilityBurden,scarcityPricingDemandReduction:s.scarcityPricingDemandReduction,grievance:s.grievance,migrationPenalty:s.migrationPenalty,emigrationPush:s.emigrationPush,revolutionaryPressure:s.revolutionaryPressure,fairness:s.fairness};
  return s;
}

export function waterGovernanceWellbeing(region){const s=ensureWaterGovernance(region);return {prosperityPenalty:clamp(s.householdHardship*.16+s.affordabilityBurden*.10),safetyPenalty:clamp(s.householdHardship*.06+s.grievance*.05),grievance:clamp(s.grievance),revolutionaryPressure:clamp(s.revolutionaryPressure)};}
export function waterMigrationPull(region){return clamp(1-ensureWaterGovernance(region).migrationPenalty*.58,.35,1);}
export function waterEmigrationAnnualRate(region){const s=ensureWaterGovernance(region);return clamp(s.emigrationPush*.035+s.avoidableHardship*.025,0,.055);}
export function waterGovernanceProfile(region){const s=ensureWaterGovernance(region);return {...s,policy:{...s.policy}};}
