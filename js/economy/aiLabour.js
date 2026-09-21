const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

const AI_TECH_HINTS=Object.freeze({
  early:['machine_learning','expert_systems','artificial_intelligence'],
  advanced:['advanced_artificial_intelligence','general_purpose_ai','advanced_machine_learning'],
});

export const AI_LABOUR_SECTORS=Object.freeze({
  agriculture:{label:'Agriculture',weight:'agriculture',augmentation:.34,substitution:.20,complementarity:.12},
  manufacturing:{label:'Manufacturing',weight:'industrial',augmentation:.42,substitution:.46,complementarity:.10},
  services:{label:'Services',weight:'services',augmentation:.48,substitution:.38,complementarity:.18},
  administration:{label:'Administration',weight:'administration',augmentation:.52,substitution:.44,complementarity:.12},
  research:{label:'Research',weight:'research',augmentation:.62,substitution:.16,complementarity:.34},
  healthcare:{label:'Healthcare',weight:'healthcare',augmentation:.58,substitution:.12,complementarity:.30},
  logistics:{label:'Logistics',weight:'logistics',augmentation:.38,substitution:.62,complementarity:.10},
  military:{label:'Military',weight:'military',augmentation:.40,substitution:.28,complementarity:.18},
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
  s.sectors||={};
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
    (Number(region.socialProtection?.coverage)||0)*.35,
  ));
}

function sectorWeights(region){
  const structural=region.structuralTransformation||{};
  const employment=region.employment||{};
  const occupations=region.occupations||{};
  const working=Math.max(1,Number(region.demographics?.workingAge)||Number(employment.labourForce)||region.population||1);
  const agriculture=clamp(structural.agriculturalShare??(Number(occupations.farmer)||0)/working);
  const industrial=clamp(structural.industrialShare??((Number(occupations.smith)||0)+(Number(occupations.miner)||0)+(Number(occupations.lumberjack)||0))/working);
  const services=clamp(structural.serviceShare??Math.max(0,1-agriculture-industrial)*.55);
  const administration=clamp(((Number(occupations.scribe)||0)+(Number(occupations.administrator)||0))/working,0,.30);
  const research=clamp(((Number(occupations.scholar)||0)+(Number(occupations.scientist)||0)+(Number(occupations.engineer)||0))/working,0,.24);
  const healthcare=clamp(((Number(occupations.doctor)||0)+(Number(occupations.nurse)||0)+(Number(occupations.healer)||0))/working,0,.24);
  const logistics=clamp(((Number(occupations.trader)||0)+(Number(occupations.driver)||0)+(Number(occupations.sailor)||0)+(Number(occupations.dockworker)||0))/working,0,.28);
  const military=clamp(((Number(region.armySize)||0)+(Number(region.navyCrew)||0))/working,0,.30);
  const raw={agriculture,industrial,services,administration,research,healthcare,logistics,military};
  const total=Object.values(raw).reduce((a,b)=>a+b,0)||1;
  return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,v/total]));
}

function sectorReadiness(region,key){
  const human=clamp(region.publicEducation?.technicalHumanCapital||region.publicEducation?.literacy||0);
  const electricity=clamp(region.electricity?.industrialService||0);
  const computers=clamp(Math.log1p(Math.max(0,region.stockpile?.computers||0))/5);
  const bureaucracy=clamp(region.governance?.administrativeCapacity||region.governance?.capacity||0);
  const medicine=clamp(region.medicalProgress?.professionalCapacity||region.medicalCapacity||0);
  const logistics=clamp(region.tradeEconomy?.logisticsEfficiency||region.transport?.efficiency||0);
  if(key==='research')return clamp(.35+human*.45+computers*.20);
  if(key==='healthcare')return clamp(.30+human*.30+medicine*.25+computers*.15);
  if(key==='administration')return clamp(.30+bureaucracy*.35+computers*.20+human*.15);
  if(key==='logistics')return clamp(.28+logistics*.32+electricity*.18+computers*.22);
  if(key==='manufacturing')return clamp(.25+electricity*.35+computers*.18+human*.22);
  if(key==='military')return clamp(.25+computers*.28+human*.20+clamp(region.warEconomy?.munitionsOutputValue||0)*.12+electricity*.15);
  if(key==='agriculture')return clamp(.24+electricity*.16+computers*.16+human*.14+clamp(region.agriculturalMachinery?.mechanisation||0)*.30);
  return clamp(.30+computers*.28+human*.24+electricity*.18);
}

function sectorProfile(region,adoption,capability,demand,workers,employers){
  const weights=sectorWeights(region),powerTotal=Math.max(.05,workers+employers),workerBargain=workers/powerTotal,employerBargain=employers/powerTotal;
  const sectors={};let productivity=0,substitution=0,complementarity=0,displacement=0,demandBoost=0;
  for(const [key,def] of Object.entries(AI_LABOUR_SECTORS)){
    const weight=weights[def.weight]||0,readiness=sectorReadiness(region,key);
    const effectiveAdoption=clamp(adoption*(.55+.45*readiness));
    const aug=clamp(effectiveAdoption*def.augmentation*(.35+.65*capability),0,.80);
    const sub=clamp(effectiveAdoption*def.substitution*Math.max(0,capability-.12),0,.72);
    const comp=clamp(effectiveAdoption*def.complementarity*(.45+.55*demand),0,.42);
    const publicDemand=(key==='healthcare'||key==='research')?.12:0;
    const wartimeDemand=(key==='military'&&region.warEconomy?.defendingCampaigns)?.18:0;
    const sectorDemand=clamp(demand+publicDemand+wartimeDemand);
    const leisure=clamp(workerBargain*(.14+.48*aug));
    const shedding=clamp(sub*(.32+.68*employerBargain)*(1-sectorDemand*.48));
    const growth=clamp(aug*(.28+.72*sectorDemand)*(1-shedding*.50)+comp*.35);
    const autoDisp=clamp(shedding*(1-workers*.52)-comp*sectorDemand*.42,0,.45);
    sectors[key]={label:def.label,weight,readiness,adoption:effectiveAdoption,productivityGain:aug,substitutionPressure:sub,complementarity:comp,outputClaim:growth,leisureClaim:leisure,labourSheddingClaim:shedding,automationDisplacementRate:autoDisp};
    productivity+=weight*aug;substitution+=weight*sub;complementarity+=weight*comp;displacement+=weight*autoDisp;demandBoost+=weight*clamp(growth+comp*sectorDemand,0,.65);
  }
  return {sectors,productivityGain:clamp(productivity,0,.65),substitutionPressure:clamp(substitution,0,.55),complementarity:clamp(complementarity,0,.30),automationDisplacementRate:clamp(displacement,0,.34),aiDemandBoost:clamp(demandBoost,0,.55)};
}

export function aiSectorOutputMultiplier(region,sector){
  const s=ensureAiLabourState(region);
  const p=s.sectors?.[sector];
  if(!p)return 1;
  return Math.max(1,1+(Number(p.productivityGain)||0)*(Number(p.outputClaim)||0));
}

export function tickAiLabour(region,elapsedDays=7){
  const s=ensureAiLabourState(region);
  const capability=aiEconomicCapability(region);
  const years=Math.max(0,Number(elapsedDays)||0)/365.2425;
  const targetAdoption=adoptionPotential(region,capability);
  s.capability=capability;
  s.adoption+=(targetAdoption-s.adoption)*Math.min(1,years*1.4);
  const adoption=clamp(s.adoption);
  const workers=workerPower(region),employers=employerPower(region,workers);
  s.workerPower=workers;s.employerPower=employers;

  const demand=demandAbsorption(region);
  const profile=sectorProfile(region,adoption,capability,demand,workers,employers);
  s.sectors=profile.sectors;s.productivityGain=profile.productivityGain;s.substitutionPressure=profile.substitutionPressure;s.complementarity=profile.complementarity;

  const powerTotal=Math.max(.05,workers+employers);
  const workerBargain=workers/powerTotal,employerBargain=employers/powerTotal;
  let leisureClaim=0,sheddingClaim=0,growthClaim=0;
  for(const sector of Object.values(s.sectors)){
    leisureClaim+=sector.weight*sector.leisureClaim;
    sheddingClaim+=sector.weight*sector.labourSheddingClaim;
    growthClaim+=sector.weight*sector.outputClaim;
  }
  const allocationTotal=Math.max(.001,leisureClaim+sheddingClaim+growthClaim);
  s.leisureShare=clamp(leisureClaim/allocationTotal);
  s.labourSheddingShare=clamp(sheddingClaim/allocationTotal);
  s.outputShare=clamp(growthClaim/allocationTotal);

  const broadOwnership=ownershipBroadness(region);
  const surplus=Math.max(0,s.productivityGain*(1-s.outputShare*.55));
  s.wageShare=clamp(surplus*(.18+.58*workerBargain));
  s.profitShare=clamp(surplus*(.20+.58*employerBargain)*(1-broadOwnership*.18));
  s.priceShare=clamp(Math.max(0,surplus-s.wageShare-s.profitShare));

  const hoursFloor=28;
  const desiredHours=40-s.productivityGain*s.leisureShare*30;
  const insecurity=clamp(region.employment?.unemploymentRate||0);
  const insecurityOvertime=clamp(insecurity*(1-workers)*10,0,8);
  s.standardWeeklyHours=clamp(desiredHours,hoursFloor,48);
  s.effectiveWeeklyHours=clamp(s.standardWeeklyHours+insecurityOvertime,hoursFloor,56);

  s.automationDisplacementRate=profile.automationDisplacementRate;
  s.employmentPreservation=clamp(1-s.automationDisplacementRate);
  s.aiDemandBoost=profile.aiDemandBoost;

  region.labourProductivityMultiplier=Math.max(1,Number(region.labourProductivityMultiplier)||1,1+s.productivityGain*s.outputShare);
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
    aiDemandBoost:s.aiDemandBoost,sectors:Object.fromEntries(Object.entries(s.sectors||{}).map(([key,v])=>[key,{...v}])),
  };
}
