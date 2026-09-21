const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const PLANT_FOODS=Object.freeze(['staple_grains','pulses','fruit_vegetables']);

export const CHEMICAL_PEST_CONTROL_TECH_ID='chemical_pest_control';

// Early mineral/chemical crop protection: sulfur- and copper-based preparations.
// One abstract treatment unit is enough for roughly 150 cultivated hectares for
// a full year's ordinary programme. It is intentionally material-consuming and
// useful mainly when abnormal pest pressure exists; it is not a flat yield buff.
const HECTARES_PER_TREATMENT_UNIT=150;
const SULFUR_PER_UNIT=.65;
const COPPER_PER_UNIT=.24;
const RESERVE_YEARS=.25;
const MAX_FIRST_GEN_CONTROL=.62;

export function ensureAgriculturalPesticides(region){
  region.agriculturalPesticides||={};
  const s=region.agriculturalPesticides;
  for(const [k,v] of Object.entries({productionExperience:0,applicationExperience:0,lastProduced:0,lastApplied:0,applicationCoverage:0,resistance:0,residueLoad:0,ecologicalPressure:0,productionCapability:0,sulfurUsed:0,copperUsed:0}))if(!Number.isFinite(s[k]))s[k]=v;
  s.controlByCategory||={};
  for(const id of PLANT_FOODS)if(!Number.isFinite(s.controlByCategory[id]))s.controlByCategory[id]=0;
  return s;
}

function cultivatedHa(region){
  const cultivated=nonNegative(region.agriculturalLand?.cultivatedHa);
  if(cultivated>0)return cultivated;
  return nonNegative(region.agriculturalLand?.availableArableHa)*clamp(region.agriculturalLand?.cultivationShare||0);
}

function outbreakSignal(region){
  const pests=region.agriculturalPests||{};
  let weighted=0,total=0;
  const mix=region.foodDiversity?.productionMix||{};
  for(const id of PLANT_FOODS){
    const w=Math.max(.05,nonNegative(mix[id]));
    const severity=clamp(pests.outbreakSeverity?.[id]||0);
    weighted+=severity*w;total+=w;
  }
  return total>0?clamp(weighted/total):0;
}

function industrialReadiness(region){
  const manufacture=clamp(region.structuralTransformation?.capability?.manufacture||0);
  const machining=clamp(region.industrialSupply?.capability?.precision_machining||0);
  const factory=clamp(nonNegative(region.industrialPlants?.factoryCapacity)/35);
  return clamp(manufacture*.46+machining*.22+factory*.32);
}

export function pesticideProductionCapability(region){
  if(!region.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID))return 0;
  const s=ensureAgriculturalPesticides(region);
  return clamp(industrialReadiness(region)*.82+s.productionExperience*.18);
}

function annualFullTreatmentDemand(region){
  if(!region.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID))return 0;
  return cultivatedHa(region)/HECTARES_PER_TREATMENT_UNIT;
}

function producePesticide(region,wanted,elapsedDays){
  const s=ensureAgriculturalPesticides(region);
  if(!region.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID)||wanted<=0)return 0;
  region.stockpile||={};
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const capability=pesticideProductionCapability(region);
  const factory=nonNegative(region.industrialPlants?.factoryCapacity);
  const capacity=factory*Math.max(.05,.12+.30*capability)*years;
  const sulfur=nonNegative(region.stockpile.sulfur),copper=nonNegative(region.stockpile.copper);
  const output=Math.min(wanted,capacity,sulfur/SULFUR_PER_UNIT,copper/COPPER_PER_UNIT);
  if(output<=0)return 0;
  s.sulfurUsed=output*SULFUR_PER_UNIT;s.copperUsed=output*COPPER_PER_UNIT;
  region.stockpile.sulfur=Math.max(0,sulfur-s.sulfurUsed);
  region.stockpile.copper=Math.max(0,copper-s.copperUsed);
  region.stockpile.pesticide=nonNegative(region.stockpile.pesticide)+output;
  s.lastProduced=output;
  s.productionExperience=clamp(s.productionExperience+.006*clamp(output/Math.max(.001,capacity))*(1-s.productionExperience));
  return output;
}

function applyPesticide(region,elapsedDays){
  const s=ensureAgriculturalPesticides(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  for(const id of PLANT_FOODS)s.controlByCategory[id]=0;
  if(!region.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID)){s.lastApplied=0;s.applicationCoverage=0;return 0;}
  const signal=outbreakSignal(region),annual=annualFullTreatmentDemand(region);
  // Farmers do not spray at full intensity in a normal year. Severe outbreaks
  // create treatment demand; a small preventive programme remains at low pressure.
  const intensity=clamp(.08+signal*.92,.08,1);
  const needed=annual*years*intensity;
  const available=nonNegative(region.stockpile?.pesticide);
  const applied=Math.min(available,needed);
  if(region.stockpile)region.stockpile.pesticide=Math.max(0,available-applied);
  s.lastApplied=applied;s.applicationCoverage=needed>0?clamp(applied/needed):0;
  const effectivePotency=MAX_FIRST_GEN_CONTROL*(1-s.resistance*.78);
  const baseControl=clamp(s.applicationCoverage*effectivePotency);
  const pests=region.agriculturalPests||{};
  for(const id of PLANT_FOODS){
    const categorySeverity=clamp(pests.outbreakSeverity?.[id]||0);
    // Treatment is directed toward crops that are actually under pressure.
    const targeting=clamp(.35+categorySeverity*.85,.35,1);
    s.controlByCategory[id]=clamp(baseControl*targeting,0,MAX_FIRST_GEN_CONTROL);
  }
  if(applied>0){
    s.applicationExperience=clamp(s.applicationExperience+.008*s.applicationCoverage*(1-s.applicationExperience));
    // Repeated selection pressure accumulates resistance. It recedes only slowly
    // when treatment pressure is absent, preventing permanent free suppression.
    s.resistance=clamp(s.resistance+years*(.035+.16*s.applicationCoverage)*(1-s.resistance));
  }else{
    s.resistance=clamp(s.resistance*Math.exp(-.045*years));
  }
  const decay=1-Math.pow(.70,years);
  s.residueLoad=Math.max(0,s.residueLoad*(1-decay)+applied*(.055+.09*s.applicationCoverage));
  s.ecologicalPressure=clamp(s.residueLoad/Math.max(1,cultivatedHa(region)/180)*.18,0,.30);
  return applied;
}

export function pesticideControlForCategory(region,category){
  return clamp(ensureAgriculturalPesticides(region).controlByCategory?.[category]||0,0,MAX_FIRST_GEN_CONTROL);
}

export function tickAgriculturalPesticides(region,elapsedDays=7){
  const s=ensureAgriculturalPesticides(region);
  s.lastProduced=0;s.lastApplied=0;s.sulfurUsed=0;s.copperUsed=0;
  if(region.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID)){
    const annual=annualFullTreatmentDemand(region),stock=nonNegative(region.stockpile?.pesticide);
    const target=annual*RESERVE_YEARS;
    producePesticide(region,Math.max(0,target-stock),elapsedDays);
  }
  applyPesticide(region,elapsedDays);
  s.productionCapability=pesticideProductionCapability(region);
  region.report||={};
  region.report.agriculturalPesticides={workers:0,produced:s.lastProduced,applied:s.lastApplied,applicationCoverage:s.applicationCoverage,controlByCategory:{...s.controlByCategory},resistance:s.resistance,residueLoad:s.residueLoad,ecologicalPressure:s.ecologicalPressure,productionCapability:s.productionCapability,sulfurUsed:s.sulfurUsed,copperUsed:s.copperUsed};
  return s;
}

export function pesticideBreakthroughChance(region,byId){
  const tech=region.unlockedTechIds||new Set();
  if(tech.has(CHEMICAL_PEST_CONTROL_TECH_ID))return 0;
  const industry=industrialReadiness(region);
  const sulfur=nonNegative(region.stockpile?.sulfur),copper=nonNegative(region.stockpile?.copper);
  const inputs=clamp((Math.log1p(sulfur)+Math.log1p(copper))/10);
  const pressure=clamp(outbreakSignal(region)+Number(region.agriculturalPests?.monocultureRisk||0)*.35);
  const hasFactory=nonNegative(region.industrialPlants?.factoryCapacity)>0;
  if(!hasFactory||industry<.12||inputs<.05)return 0;
  const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[])]);
  if(region.recentTradePartners instanceof Map)for(const id of region.recentTradePartners.keys())ids.add(id);
  const informed=[...ids].filter(id=>byId.get(id)?.unlockedTechIds?.has?.(CHEMICAL_PEST_CONTROL_TECH_ID)).length;
  const diffusion=1-Math.pow(1-.00018,informed);
  return clamp(industry*(.42+.23*inputs+.35*pressure)*.000007+diffusion*(.30+.70*industry));
}
