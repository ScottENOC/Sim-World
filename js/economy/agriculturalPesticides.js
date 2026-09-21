import { PETROLEUM_CRACKING_TECH_ID } from '../technology/petroleum.js?v=20260921-synth-pesticides1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
const PLANT_FOODS=Object.freeze(['staple_grains','pulses','fruit_vegetables']);

export const CHEMICAL_PEST_CONTROL_TECH_ID='chemical_pest_control';
export const SYNTHETIC_PESTICIDES_TECH_ID='synthetic_pesticides';

const HECTARES_PER_TREATMENT_UNIT=150;
const SULFUR_PER_UNIT=.65;
const COPPER_PER_UNIT=.24;
const RESERVE_YEARS=.25;
const MAX_FIRST_GEN_CONTROL=.62;
const MAX_SYNTHETIC_CONTROL=.88;
const PETROL_FEEDSTOCK_PER_UNIT=.72;
const SULFUR_SYNTHETIC_PER_UNIT=.18;

export function ensureAgriculturalPesticides(region){
  region.agriculturalPesticides||={};
  const s=region.agriculturalPesticides;
  for(const [k,v] of Object.entries({productionExperience:0,syntheticProductionExperience:0,applicationExperience:0,lastProduced:0,lastSyntheticProduced:0,lastApplied:0,lastSyntheticApplied:0,applicationCoverage:0,syntheticCoverage:0,resistance:0,syntheticResistance:0,residueLoad:0,ecologicalPressure:0,toxicityPressure:0,productionCapability:0,sulfurUsed:0,copperUsed:0,petroleumFeedstockUsed:0}))if(!Number.isFinite(s[k]))s[k]=v;
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
  for(const id of PLANT_FOODS){const w=Math.max(.05,nonNegative(mix[id]));const severity=clamp(pests.outbreakSeverity?.[id]||0);weighted+=severity*w;total+=w;}
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

function syntheticProductionCapability(region){
  if(!region.unlockedTechIds?.has?.(SYNTHETIC_PESTICIDES_TECH_ID))return 0;
  const s=ensureAgriculturalPesticides(region);
  return clamp(industrialReadiness(region)*.70+s.productionExperience*.10+s.syntheticProductionExperience*.20);
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
  s.sulfurUsed+=output*SULFUR_PER_UNIT;s.copperUsed=output*COPPER_PER_UNIT;
  region.stockpile.sulfur=Math.max(0,sulfur-output*SULFUR_PER_UNIT);
  region.stockpile.copper=Math.max(0,copper-output*COPPER_PER_UNIT);
  region.stockpile.pesticide=nonNegative(region.stockpile.pesticide)+output;
  s.lastProduced=output;
  s.productionExperience=clamp(s.productionExperience+.006*clamp(output/Math.max(.001,capacity))*(1-s.productionExperience));
  return output;
}

function produceSyntheticPesticide(region,wanted,elapsedDays){
  const s=ensureAgriculturalPesticides(region),tech=region.unlockedTechIds||new Set();
  if(!tech.has(SYNTHETIC_PESTICIDES_TECH_ID)||!tech.has(PETROLEUM_CRACKING_TECH_ID)||wanted<=0)return 0;
  region.stockpile||={};
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const capability=syntheticProductionCapability(region),factory=nonNegative(region.industrialPlants?.factoryCapacity);
  const capacity=factory*Math.max(.04,.10+.34*capability)*years;
  const petrol=nonNegative(region.stockpile.petrol),sulfur=nonNegative(region.stockpile.sulfur);
  const output=Math.min(wanted,capacity,petrol/PETROL_FEEDSTOCK_PER_UNIT,sulfur/SULFUR_SYNTHETIC_PER_UNIT);
  if(output<=0)return 0;
  s.petroleumFeedstockUsed=output*PETROL_FEEDSTOCK_PER_UNIT;s.sulfurUsed+=output*SULFUR_SYNTHETIC_PER_UNIT;
  region.stockpile.petrol=Math.max(0,petrol-s.petroleumFeedstockUsed);
  region.stockpile.sulfur=Math.max(0,sulfur-output*SULFUR_SYNTHETIC_PER_UNIT);
  region.stockpile.synthetic_pesticide=nonNegative(region.stockpile.synthetic_pesticide)+output;
  s.lastSyntheticProduced=output;
  s.syntheticProductionExperience=clamp(s.syntheticProductionExperience+.007*clamp(output/Math.max(.001,capacity))*(1-s.syntheticProductionExperience));
  return output;
}

function applyPesticides(region,elapsedDays){
  const s=ensureAgriculturalPesticides(region),years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR,tech=region.unlockedTechIds||new Set();
  for(const id of PLANT_FOODS)s.controlByCategory[id]=0;
  if(!tech.has(CHEMICAL_PEST_CONTROL_TECH_ID)){s.lastApplied=0;s.lastSyntheticApplied=0;s.applicationCoverage=0;s.syntheticCoverage=0;return 0;}
  const signal=outbreakSignal(region),annual=annualFullTreatmentDemand(region),intensity=clamp(.08+signal*.92,.08,1),needed=annual*years*intensity;
  const syntheticPreferred=tech.has(SYNTHETIC_PESTICIDES_TECH_ID)&&signal>.18;
  const syntheticAvailable=nonNegative(region.stockpile?.synthetic_pesticide);
  const syntheticNeed=syntheticPreferred?needed:0;
  const syntheticApplied=Math.min(syntheticAvailable,syntheticNeed);
  if(region.stockpile)region.stockpile.synthetic_pesticide=Math.max(0,syntheticAvailable-syntheticApplied);
  const residualNeed=Math.max(0,needed-syntheticApplied);
  const mineralAvailable=nonNegative(region.stockpile?.pesticide),mineralApplied=Math.min(mineralAvailable,residualNeed);
  if(region.stockpile)region.stockpile.pesticide=Math.max(0,mineralAvailable-mineralApplied);
  s.lastApplied=mineralApplied;s.lastSyntheticApplied=syntheticApplied;
  s.syntheticCoverage=needed>0?clamp(syntheticApplied/needed):0;
  s.applicationCoverage=needed>0?clamp((syntheticApplied+mineralApplied)/needed):0;
  const mineralPotency=MAX_FIRST_GEN_CONTROL*(1-s.resistance*.78);
  const syntheticPotency=MAX_SYNTHETIC_CONTROL*(1-s.syntheticResistance*.72);
  const pests=region.agriculturalPests||{};
  for(const id of PLANT_FOODS){
    const categorySeverity=clamp(pests.outbreakSeverity?.[id]||0),targeting=clamp(.35+categorySeverity*.85,.35,1);
    const mineralControl=(mineralApplied/Math.max(.0001,needed))*mineralPotency;
    const syntheticControl=s.syntheticCoverage*syntheticPotency;
    s.controlByCategory[id]=clamp((mineralControl+syntheticControl)*targeting,0,MAX_SYNTHETIC_CONTROL);
  }
  if(mineralApplied>0)s.resistance=clamp(s.resistance+years*(.035+.16*clamp(mineralApplied/Math.max(.001,needed)))*(1-s.resistance));
  else s.resistance=clamp(s.resistance*Math.exp(-.045*years));
  if(syntheticApplied>0)s.syntheticResistance=clamp(s.syntheticResistance+years*(.08+.30*s.syntheticCoverage)*(1-s.syntheticResistance));
  else s.syntheticResistance=clamp(s.syntheticResistance*Math.exp(-.025*years));
  if(mineralApplied+syntheticApplied>0)s.applicationExperience=clamp(s.applicationExperience+.008*s.applicationCoverage*(1-s.applicationExperience));
  const decay=1-Math.pow(.70,years);
  s.residueLoad=Math.max(0,s.residueLoad*(1-decay)+mineralApplied*(.055+.09*s.applicationCoverage)+syntheticApplied*(.16+.22*s.syntheticCoverage));
  s.ecologicalPressure=clamp(s.residueLoad/Math.max(1,cultivatedHa(region)/180)*.18,0,.48);
  s.toxicityPressure=clamp(s.toxicityPressure*Math.exp(-.20*years)+syntheticApplied/Math.max(1,annual)*.22,0,.55);
  return mineralApplied+syntheticApplied;
}

export function pesticideControlForCategory(region,category){return clamp(ensureAgriculturalPesticides(region).controlByCategory?.[category]||0,0,MAX_SYNTHETIC_CONTROL);}

export function tickAgriculturalPesticides(region,elapsedDays=7){
  const s=ensureAgriculturalPesticides(region),tech=region.unlockedTechIds||new Set();
  s.lastProduced=0;s.lastSyntheticProduced=0;s.lastApplied=0;s.lastSyntheticApplied=0;s.sulfurUsed=0;s.copperUsed=0;s.petroleumFeedstockUsed=0;
  if(tech.has(CHEMICAL_PEST_CONTROL_TECH_ID)){
    const annual=annualFullTreatmentDemand(region);
    if(tech.has(SYNTHETIC_PESTICIDES_TECH_ID)){
      const stock=nonNegative(region.stockpile?.synthetic_pesticide),target=annual*RESERVE_YEARS;
      produceSyntheticPesticide(region,Math.max(0,target-stock),elapsedDays);
    }
    const stock=nonNegative(region.stockpile?.pesticide),target=annual*(tech.has(SYNTHETIC_PESTICIDES_TECH_ID)?.10:RESERVE_YEARS);
    producePesticide(region,Math.max(0,target-stock),elapsedDays);
  }
  applyPesticides(region,elapsedDays);
  s.productionCapability=Math.max(pesticideProductionCapability(region),syntheticProductionCapability(region));
  region.report||={};
  region.report.agriculturalPesticides={workers:0,produced:s.lastProduced,syntheticProduced:s.lastSyntheticProduced,applied:s.lastApplied,syntheticApplied:s.lastSyntheticApplied,applicationCoverage:s.applicationCoverage,syntheticCoverage:s.syntheticCoverage,controlByCategory:{...s.controlByCategory},resistance:s.resistance,syntheticResistance:s.syntheticResistance,residueLoad:s.residueLoad,ecologicalPressure:s.ecologicalPressure,toxicityPressure:s.toxicityPressure,productionCapability:s.productionCapability,sulfurUsed:s.sulfurUsed,copperUsed:s.copperUsed,petroleumFeedstockUsed:s.petroleumFeedstockUsed};
  return s;
}

function contactCount(region,byId,techId){const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[])]);if(region.recentTradePartners instanceof Map)for(const id of region.recentTradePartners.keys())ids.add(id);return [...ids].filter(id=>byId.get(id)?.unlockedTechIds?.has?.(techId)).length;}

export function pesticideBreakthroughChances(region,byId){
  const tech=region.unlockedTechIds||new Set(),industry=industrialReadiness(region),pressure=clamp(outbreakSignal(region)+Number(region.agriculturalPests?.monocultureRisk||0)*.35);
  const sulfur=nonNegative(region.stockpile?.sulfur),copper=nonNegative(region.stockpile?.copper),inputs=clamp((Math.log1p(sulfur)+Math.log1p(copper))/10),hasFactory=nonNegative(region.industrialPlants?.factoryCapacity)>0;
  const firstDiff=1-Math.pow(1-.00018,contactCount(region,byId,CHEMICAL_PEST_CONTROL_TECH_ID));
  const first=tech.has(CHEMICAL_PEST_CONTROL_TECH_ID)||!hasFactory||industry<.12||inputs<.05?0:clamp(industry*(.42+.23*inputs+.35*pressure)*.000007+firstDiff*(.30+.70*industry));
  const petrol=nonNegative(region.stockpile?.petrol),petroleum=clamp(Math.log1p(petrol)/6),resistance=clamp(ensureAgriculturalPesticides(region).resistance);
  const synthDiff=1-Math.pow(1-.00012,contactCount(region,byId,SYNTHETIC_PESTICIDES_TECH_ID));
  const synthetic=tech.has(SYNTHETIC_PESTICIDES_TECH_ID)||!tech.has(CHEMICAL_PEST_CONTROL_TECH_ID)||!tech.has(PETROLEUM_CRACKING_TECH_ID)||industry<.28||petroleum<.06?0:clamp(industry*(.30+.18*petroleum+.24*pressure+.28*resistance)*.0000045+synthDiff*(.25+.75*industry));
  return {first,synthetic};
}

export function pesticideBreakthroughChance(region,byId){return pesticideBreakthroughChances(region,byId).first;}
