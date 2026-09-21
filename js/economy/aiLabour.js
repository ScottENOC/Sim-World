const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

const AI_TECH_HINTS=Object.freeze({
  early:['machine_learning','expert_systems','artificial_intelligence'],
  advanced:['advanced_artificial_intelligence','general_purpose_ai','advanced_machine_learning'],
});

function techCapability(region){
  const tech=region.unlockedTechIds;
  if(!tech?.has)return 0;
  if(AI_TECH_HINTS.advanced.some(id=>tech.has(id)))return .72;
  if(AI_TECH_HINTS.early.some(id=>tech.has(id)))return .32;
  return 0;
}

export function aiEconomicCapability(region){
  const explicit=Math.max(
    Number(region.aiEconomy?.capability)||0,
    Number(region.artificialIntelligence?.capability)||0,
    Number(region.ai?.capability)||0,
    Number(region.computingIndustry?.aiCapability)||0,
  );
  return clamp(Math.max(explicit,techCapability(region)));
}

export function ensureAiLabourState(region){
  region.aiLabour||={};
  const s=region.aiLabour;
  for(const [key,value] of Object.entries({
    capability:0,adoption:0,productivityGain:0,substitutionPressure:0,complementarity:0,
    workerPower:0.35,employerPower:0.35,outputShare:0,leisureShare:0,labourSheddingShare:0,
    wageShare:0,profitShare:0,priceShare:0,standardWeeklyHours:40,effectiveWeeklyHours:40,
    automationDisplacementRate:0,employmentPreservation:1,aiDemandBoost:0,
  }))if(!Number.isFinite(s[key]))s[key]=value;
  return s;
}

function bargainingPolicyScore(region){
  const p=region.labourRelations?.policy?.collectiveBargaining;
  return p==='recognised'?1:p==='tolerated'?.55:.12;
}

function workerPower(region){
  const l=region.labourRelations||{},e=region.employment||{};
  const bargaining=bargainingPolicyScore(region);
  const union=clamp(l.unionDensity||0);
  const standards=clamp(region.economicRegulation?.labourStandards||0);
  const safety=clamp(region.economicRegulation?.workerSafety||standards);
  const protection=clamp(region.socialProtection?.coverage||region.socialProtectionReport?.coverage||0);
  const trust=clamp(l.bargainingTrust??.5);
  const unemployment=clamp(e.unemploymentRate||0);
  const repression=clamp(l.repressionMemory||0);
  return clamp(.08+union*.28+bargaining*.22+standards*.14+safety*.06+protection*.12+trust*.10-unemployment*.28-repression*.16);
}

function employerPower(region,workers){
  const e=region.employment||{};
  const finance=clamp(region.corporateCapital?.financialDepth||0);
  const unemployment=clamp(e.unemploymentRate||0);
  const failures=clamp(region.corporateCapital?.failedFirmPressure||0);
  const protection=clamp(region.socialProtection?.coverage||region.socialProtectionReport?.coverage||0);
  return clamp(.16+finance*.24+unemployment*.34+(1-workers)*.22+failures*.08-protection*.12);
}

function adoptionPotential(region,capability){
  const electricity=clamp(region.electricity?.industrialService||0);
  const computers=clamp(Math.log1p(Math.max(0,region.stockpile?.computers||0))/5);
  const digital=clamp(region.computingIndustry?.capability||0);
  const human=clamp(region.publicEducation?.technicalHumanCapital||region.publicEducation?.literacy||0);
  return clamp(capability*(.28+electricity*.24+computers*.18+digital*.16+human*.14));
}

function demandAbsorption(region){
  const demand=clamp(region.householdDemandMultiplier??1,0,1.05)/1.05;
  const exports=clamp(Math.log1p(Math.max(0,region.tradeEconomy?.weeklyExports||0))/9);
  const industrial=clamp((region.structuralTransformation?.industrialShare||0)+(region.structuralTransformation?.serviceShare||0));
  return clamp(.30+demand*.38+exports*.18+industrial*.14);
}

function ownershipBroadness(region){
  const o=region.economicOwnership||region.ownership||{};
  return clamp(Math.max(
    Number(o.householdShare)||0,
    Number(o.workerShare)||0,
    Number(o.publicShare)||0,
    Number(region.socialProtection?.coverage)||0*.35,
  ));
}

export function tickAiLabour(region,elapsedDays=7){
  const s=ensureAiLabourState(region);
  const capability=aiEconomicCapability(region);
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  const targetAdoption=adoptionPotential(region,capability);
  s.capability=capability;
  s.adoption+= (targetAdoption-s.adoption)*Math.min(1,years*1.4);
  const adoption=clamp(s.adoption);
  const workers=workerPower(region),employers=employerPower(region,workers);
  s.workerPower=workers;s.employerPower=employers;

  // Capability creates a potential labour-productivity dividend, while substitution
  // is deliberately lower at first. Later AI generations can automate whole tasks.
  const productivityGain=clamp(adoption*(.10+capability*.42),0,.52);
  const substitution=clamp(adoption*Math.max(0,capability-.18)*.46,0,.34);
  const complementarity=clamp(adoption*(.08+capability*.13),0,.18);
  s.productivityGain=productivityGain;s.substitutionPressure=substitution;s.complementarity=complementarity;

  const demand=demandAbsorption(region);
  const powerTotal=Math.max(.05,workers+employers);
  const workerBargain=workers/powerTotal,employerBargain=employers/powerTotal;
  const leisureClaim=clamp(workerBargain*(.20+.50*productivityGain)*(1-clamp(region.warEconomy?.defendingCampaigns||0)));
  const sheddingClaim=clamp(substitution*(.35+.65*employerBargain)*(1-demand*.45));
  const growthClaim=clamp(productivityGain*(.30+.70*demand)*(1-sheddingClaim*.55));
  const allocationTotal=Math.max(.001,leisureClaim+sheddingClaim+growthClaim);
  s.leisureShare=clamp(leisureClaim/allocationTotal);
  s.labourSheddingShare=clamp(sheddingClaim/allocationTotal);
  s.outputShare=clamp(growthClaim/allocationTotal);

  const broadOwnership=ownershipBroadness(region);
  const surplus=Math.max(0,productivityGain*(1-s.outputShare*.55));
  s.wageShare=clamp(surplus*(.18+.58*workerBargain));
  s.profitShare=clamp(surplus*(.20+.58*employerBargain)*(1-broadOwnership*.18));
  s.priceShare=clamp(Math.max(0,surplus-s.wageShare-s.profitShare));

  const hoursFloor=28;
  const desiredHours=40-productivityGain*s.leisureShare*30;
  // In insecure labour markets, the employed can work longer even while total labour
  // demand falls: overtime becomes preferable to joining the displaced workforce.
  const insecurity=clamp(region.employment?.unemploymentRate||0);
  const insecurityOvertime=clamp(insecurity*(1-workers)*10,0,8);
  s.standardWeeklyHours=clamp(desiredHours,hoursFloor,48);
  s.effectiveWeeklyHours=clamp(s.standardWeeklyHours+insecurityOvertime,hoursFloor,56);

  s.automationDisplacementRate=clamp(sheddingClaim*(1-workers*.55)-complementarity*demand*.45,0,.28);
  s.employmentPreservation=clamp(1-s.automationDisplacementRate);
  s.aiDemandBoost=clamp(growthClaim+complementarity*demand,0,.45);

  region.labourProductivityMultiplier=Math.max(1,Number(region.labourProductivityMultiplier)||1,1+productivityGain*s.outputShare);
  region.report||={};
  region.report.aiLabour=aiLabourSummary(region);
  return s;
}

export function aiLabourSummary(region){
  const s=ensureAiLabourState(region);
  return {
    capability:s.capability,adoption:s.adoption,productivityGain:s.productivityGain,
    substitutionPressure:s.substitutionPressure,complementarity:s.complementarity,
    workerPower:s.workerPower,employerPower:s.employerPower,
    dividend:{output:s.outputShare,leisure:s.leisureShare,labourShedding:s.labourSheddingShare,wages:s.wageShare,profits:s.profitShare,prices:s.priceShare},
    standardWeeklyHours:s.standardWeeklyHours,effectiveWeeklyHours:s.effectiveWeeklyHours,
    automationDisplacementRate:s.automationDisplacementRate,employmentPreservation:s.employmentPreservation,
    aiDemandBoost:s.aiDemandBoost,
  };
}
