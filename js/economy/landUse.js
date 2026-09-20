import { effectiveInfrastructureCount } from './construction.js?v=20260921-land1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const positive=v=>Math.max(0,Number(v)||0);
const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));

function terrainArableFraction(region){
  const t=region?.terrain||{};
  const plains=clamp(t.plains||0),hills=clamp(t.hills||0),mountains=clamp(t.mountains||0),wetland=clamp(t.wetland||0),forest=clamp(t.forest||0);
  const quality=clamp(region?.landUse?.baselineLandQuality??region?.landQuality??.7,0.05,1.5);
  const topography=plains*.72+hills*.34+wetland*.24+forest*.16-mountains*.04;
  return clamp(topography*(.56+quality*.38),.035,.78);
}

export function ensureLandUse(region){
  region.landUse||={};const s=region.landUse;
  if(!Number.isFinite(s.baselineLandQuality))s.baselineLandQuality=clamp(region?.landQuality??.7,.05,1.5);
  if(!Number.isFinite(s.totalLandHa))s.totalLandHa=positive(region?.areaSqKm)*100;
  if(!Number.isFinite(s.potentialArableHa))s.potentialArableHa=s.totalLandHa*terrainArableFraction(region);
  s.potentialArableHa=clamp(s.potentialArableHa,0,s.totalLandHa);
  if(!Number.isFinite(s.degradedArableHa))s.degradedArableHa=0;
  if(!Number.isFinite(s.desertifiedHa))s.desertifiedHa=0;
  if(!Number.isFinite(s.cultivatedHa))s.cultivatedHa=0;
  if(!Number.isFinite(s.soilCondition))s.soilCondition=1;
  if(!Number.isFinite(s.erosion))s.erosion=0;
  if(!Number.isFinite(s.salinity))s.salinity=0;
  if(!Number.isFinite(s.vegetationCover)){
    const forestFraction=s.totalLandHa>0?positive(region?.forest?.currentStock)*100/s.totalLandHa:0;
    s.vegetationCover=clamp(.28+forestFraction*.62,0.08,.92);
  }
  if(!Number.isFinite(s.conservationEffort))s.conservationEffort=0;
  if(!Number.isFinite(s.restorationInvestment))s.restorationInvestment=0;
  if(!Number.isFinite(s.lastNetArableChangeHa))s.lastNetArableChangeHa=0;
  const lost=clamp(s.degradedArableHa+s.desertifiedHa,0,s.potentialArableHa);
  s.effectiveArableHa=Math.max(0,s.potentialArableHa-lost);
  s.cultivatedHa=clamp(s.cultivatedHa,0,s.effectiveArableHa);
  return s;
}

export function productiveLandMultiplier(region){
  const s=ensureLandUse(region);
  const areaFraction=s.potentialArableHa>0?s.effectiveArableHa/s.potentialArableHa:0;
  return clamp(areaFraction*(.45+.55*s.soilCondition),0.04,1);
}

export function prepareAgriculturalLand(region){
  const s=ensureLandUse(region);
  region.landQuality=s.baselineLandQuality*productiveLandMultiplier(region);
  return s;
}

function inferredCultivation(region,s){
  const farmers=positive(region?.report?.farming?.workers??region?.occupations?.farmer);
  // Mirrors the core economy's existing labour-saturation curve. Making the
  // implied acreage explicit preserves historic calibration while giving later
  // mechanisation a physical quantity to expand without inventing more land.
  const k=Math.max(.001,positive(region?.areaSqKm)*1.5);
  const labourFraction=1-Math.exp(-farmers/k);
  return Math.min(s.effectiveArableHa,s.effectiveArableHa*clamp(labourFraction));
}

function aridityPressure(region){
  const rainfall=clamp(region?.climate?.rainfallMultiplier??1,.35,1.6);
  const evaporation=clamp(region?.climate?.evaporationMultiplier??1,.5,2.5);
  const weather=clamp(region?.weather?.yieldMultiplier??1,.35,1.7);
  const climatic=clamp(1-(rainfall/evaporation),0,1);
  const drought=clamp(1-weather,0,1);
  return clamp(climatic*.78+drought*.22);
}

function restorationCapability(region){
  const state=clamp(region?.militaryFinance?.stateCapacity??.45);
  const water=(has(region,'water_management')?.12:0)+(has(region,'hydraulic_engineering')?.18:0);
  const irrigation=clamp(effectiveInfrastructureCount(region,'irrigation')*.12,0,.22);
  const finance=clamp(region?.corporateCapital?.financialDepth||0)*.12;
  return clamp(.12+state*.28+water+irrigation+finance,.08,.88);
}

export function investLandRestoration(region,budget){
  const s=ensureLandUse(region),requested=positive(budget),available=positive(region?.treasury),spent=Math.min(requested,available);
  if(spent<=0)return{spent:0,recoveredHa:0};
  region.treasury=available-spent;
  const cap=restorationCapability(region);
  // Abstract hectares per treasury unit: restoration is deliberately expensive
  // enough that large damaged regions need sustained programmes, not one click.
  const recoverable=s.degradedArableHa+s.desertifiedHa*.18;
  const recovered=Math.min(recoverable,spent*(1.5+cap*5));
  const fromDegraded=Math.min(s.degradedArableHa,recovered);s.degradedArableHa-=fromDegraded;
  const fromDesert=Math.min(s.desertifiedHa,(recovered-fromDegraded)/.18);s.desertifiedHa-=fromDesert;
  s.restorationInvestment+=spent;s.soilCondition=clamp(s.soilCondition+spent/Math.max(1,s.potentialArableHa)*.08);
  return{spent,recoveredHa:fromDegraded+fromDesert};
}

export function tickLandUse(region,elapsedDays=7){
  const s=ensureLandUse(region),years=positive(elapsedDays)/DAYS_PER_YEAR;
  if(years<=0)return landUseReport(region);
  const before=s.effectiveArableHa;
  s.cultivatedHa=inferredCultivation(region,s);
  const cultivation=s.effectiveArableHa>0?s.cultivatedHa/s.effectiveArableHa:0;
  const aridity=aridityPressure(region);
  const forestFraction=s.totalLandHa>0?clamp(positive(region?.forest?.currentStock)*100/s.totalLandHa):0;
  const targetVegetation=clamp(.16+forestFraction*.72+(1-cultivation)*.18,0.05,.9);
  s.vegetationCover=clamp(s.vegetationCover+(targetVegetation-s.vegetationCover)*(1-Math.exp(-years/6)));

  const overuse=clamp((cultivation-.72)/.28,0,1);
  const bare=1-s.vegetationCover;
  const irrigation=clamp(effectiveInfrastructureCount(region,'irrigation')*.16,0,1);
  const drainage=(has(region,'water_management')?.35:0)+(has(region,'hydraulic_engineering')?.35:0);
  const conservation=clamp(s.conservationEffort);
  const erosionGain=years*(aridity*.012+overuse*.009)*bare*(1-conservation*.72);
  const salinityGain=years*irrigation*aridity*.005*(1-clamp(drainage,0,.75));
  s.erosion=clamp(s.erosion+erosionGain-years*conservation*.006);
  s.salinity=clamp(s.salinity+salinityGain-years*conservation*drainage*.003);

  const degradationRate=(aridity*.0045+overuse*.004+s.erosion*.003+s.salinity*.004)*bare*(1-conservation*.68);
  const newlyDegraded=Math.min(s.effectiveArableHa,s.potentialArableHa*degradationRate*years);
  s.degradedArableHa+=newlyDegraded;
  const desertifyRate=clamp((aridity-.32)*.012+s.erosion*.004+s.salinity*.005,0,.025)*(1-conservation*.78);
  const newlyDesertified=Math.min(s.degradedArableHa,s.potentialArableHa*desertifyRate*years);
  s.degradedArableHa-=newlyDesertified;s.desertifiedHa+=newlyDesertified;
  s.soilCondition=clamp(1-s.erosion*.38-s.salinity*.34-(s.degradedArableHa/Math.max(1,s.potentialArableHa))*.28,.18,1);

  // Food stress and visible land loss create endogenous demand for conservation.
  const foodStress=clamp(-(region?.stockpile?.food||0)/Math.max(1,region?._foodNeeded||region?.population||1),0,1);
  const lossShare=(s.degradedArableHa+s.desertifiedHa)/Math.max(1,s.potentialArableHa);
  const desired=clamp(foodStress*.38+lossShare*1.6+aridity*.28);
  s.conservationEffort=clamp(s.conservationEffort+(desired-s.conservationEffort)*(1-Math.exp(-years/4)));
  if(desired>.12&&positive(region?.treasury)>2){
    const annualBudget=Math.min(positive(region.treasury)*.015,Math.max(.25,s.potentialArableHa*.000004)*desired);
    investLandRestoration(region,annualBudget*years);
  }
  ensureLandUse(region);s.lastNetArableChangeHa=s.effectiveArableHa-before;
  // Restore the physical baseline; next economy tick reapplies the productive multiplier.
  region.landQuality=s.baselineLandQuality;
  region.report||={};region.report.landUse=landUseReport(region);
  return region.report.landUse;
}

export function landUseReport(region){
  const s=ensureLandUse(region);
  return{totalLandHa:s.totalLandHa,potentialArableHa:s.potentialArableHa,effectiveArableHa:s.effectiveArableHa,cultivatedHa:s.cultivatedHa,degradedArableHa:s.degradedArableHa,desertifiedHa:s.desertifiedHa,soilCondition:s.soilCondition,erosion:s.erosion,salinity:s.salinity,vegetationCover:s.vegetationCover,conservationEffort:s.conservationEffort,lastNetArableChangeHa:s.lastNetArableChangeHa,productiveMultiplier:productiveLandMultiplier(region)};
}

export function worldLandCapacity(regions){
  const out={totalLandHa:0,potentialArableHa:0,effectiveArableHa:0,cultivatedHa:0,degradedArableHa:0,desertifiedHa:0,population:0};
  for(const r of regions||[]){const s=ensureLandUse(r);for(const k of ['totalLandHa','potentialArableHa','effectiveArableHa','cultivatedHa','degradedArableHa','desertifiedHa'])out[k]+=positive(s[k]);out.population+=positive(r.population);}
  out.populationPerEffectiveArableHa=out.population/Math.max(1,out.effectiveArableHa);return out;
}
