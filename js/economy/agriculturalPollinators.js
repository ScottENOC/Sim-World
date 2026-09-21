const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);

export const POLLINATOR_DEPENDENCE=Object.freeze({
  staple_grains:.04,
  pulses:.28,
  fruit_vegetables:.72,
  animal_foods:.02,
});
const REFERENCE_HEALTH=.78;
const MANAGED_HECTARES_PER_COLONY=28;
const HIVE_WOOD_PER_COLONY=.0025;
const BEEKEEPER_COLONIES_PER_WORKER=85;

export function ensureAgriculturalPollinators(region){
  region.agriculturalPollinators||={};
  const s=region.agriculturalPollinators;
  for(const [k,v] of Object.entries({wildHealth:REFERENCE_HEALTH,habitatQuality:.65,floralDiversity:.55,pesticideStress:0,weatherStress:0,managedColonies:0,serviceableManagedColonies:0,managedHealth:.82,managedService:0,managedCoverage:0,managedWorkers:0,hiveMaintenance:.85,transportableColonies:0,serviceLevel:1,aggregateYieldMultiplier:1}))if(!Number.isFinite(s[k]))s[k]=v;
  s.yieldMultiplierByCategory||={};
  for(const id of Object.keys(POLLINATOR_DEPENDENCE))if(!Number.isFinite(s.yieldMultiplierByCategory[id]))s.yieldMultiplierByCategory[id]=1;
  return s;
}

function habitatQuality(region){
  const land=region.agriculturalLand||{};
  const total=Math.max(1,nonNegative(land.totalLandHa)||nonNegative(region.areaSqKm)*100);
  const forest=clamp(nonNegative(land.forestHa)/total);
  const other=clamp(nonNegative(land.otherHa)/total);
  const cultivation=clamp(nonNegative(land.cultivatedHa)/Math.max(1,nonNegative(land.availableArableHa)));
  const urban=clamp(nonNegative(land.urbanHa)/total);
  return clamp(.22+forest*.70+other*.24+(1-cultivation)*.22-urban*.85,.08,1);
}

function floralDiversity(region){
  const mix=region.foodDiversity?.productionMix||{};
  const plant=['staple_grains','pulses','fruit_vegetables'].map(id=>nonNegative(mix[id]));
  const total=plant.reduce((a,b)=>a+b,0)||1;
  const hhi=plant.reduce((sum,v)=>{const p=v/total;return sum+p*p;},0);
  const cropDiversity=clamp((1-hhi)/(1-1/3));
  const habitat=habitatQuality(region);
  return clamp(cropDiversity*.62+habitat*.38);
}

function pesticideStress(region){
  const p=region.agriculturalPesticides||{};
  return clamp(nonNegative(p.ecologicalPressure)*.55+nonNegative(p.toxicityPressure)*.90,0,.80);
}

function weatherStress(region){
  const anomaly=Math.abs(Number(region.climate?.temperatureAnomalyC)||0);
  const weather=Math.abs(Number(region.weather?.index)||0);
  return clamp(anomaly*.055+Math.max(0,weather-1)*.10,0,.35);
}

function pollinationDependentArea(region){
  const cultivated=nonNegative(region.agriculturalLand?.cultivatedHa);
  const mix=region.foodDiversity?.productionMix||{};
  let dependence=0,total=0;
  for(const [id,d] of Object.entries(POLLINATOR_DEPENDENCE)){
    if(id==='animal_foods')continue;
    const w=nonNegative(mix[id]);dependence+=w*d;total+=w;
  }
  return cultivated*(total>0?dependence/total:.20);
}

function managedColonyTarget(region){
  return pollinationDependentArea(region)/MANAGED_HECTARES_PER_COLONY;
}

function farmerLabourCapacity(region){
  const farmers=nonNegative(region.occupations?.farmer);
  if(farmers<=0)return Infinity;
  return farmers*BEEKEEPER_COLONIES_PER_WORKER;
}

function tickManagedBeekeeping(region,s,years){
  region.stockpile||={};
  const target=managedColonyTarget(region);
  const labourCap=farmerLabourCapacity(region);
  const desired=Math.min(target,labourCap);
  // Colonies expand biologically, but additional hives still require durable boxes,
  // frames and upkeep. Wood is a deliberately simple pre-industrial material input.
  const gap=Math.max(0,desired-s.managedColonies);
  const naturalExpansionCap=Math.max(1,s.managedColonies*.22)*years;
  const wood=nonNegative(region.stockpile.wood);
  const added=Math.min(gap,naturalExpansionCap,wood/HIVE_WOOD_PER_COLONY);
  if(added>0){region.stockpile.wood=Math.max(0,wood-added*HIVE_WOOD_PER_COLONY);s.managedColonies+=added;}

  const forage=clamp(s.habitatQuality*.48+s.floralDiversity*.52,.08,1);
  const chemical=clamp(1-s.pesticideStress*.82,.12,1);
  const climate=clamp(1-s.weatherStress*.70,.35,1);
  const carryingHealth=clamp(.22+forage*.58+chemical*.16+climate*.04,.15,1);
  const healthAdjustment=1-Math.exp(-1.05*years);
  s.managedHealth=clamp(s.managedHealth+(carryingHealth-s.managedHealth)*healthAdjustment,0,1);

  // Maintaining boxes and replacing damaged hive material is a small but real cost.
  const maintenanceNeed=s.managedColonies*HIVE_WOOD_PER_COLONY*.16*years;
  const maintenanceWood=Math.min(nonNegative(region.stockpile.wood),maintenanceNeed);
  region.stockpile.wood=Math.max(0,nonNegative(region.stockpile.wood)-maintenanceWood);
  s.hiveMaintenance=maintenanceNeed>0?clamp(.45+.55*maintenanceWood/maintenanceNeed):1;
  const labourSatisfaction=desired>0?clamp(labourCap/desired):1;
  const serviceability=clamp(s.managedHealth*.62+s.hiveMaintenance*.23+labourSatisfaction*.15);
  s.serviceableManagedColonies=s.managedColonies*serviceability;
  s.managedWorkers=s.managedColonies/BEEKEEPER_COLONIES_PER_WORKER;
  s.managedCoverage=target>0?clamp(s.serviceableManagedColonies/target):0;
  // Managed bees can replace much of a missing crop-pollination service but not
  // every wild insect or ecological interaction.
  s.managedService=clamp(s.managedCoverage*.72,0,.72);
  // Reserved for the later trucked-pollination tranche. Local hives exist now,
  // but none are assumed mobile until transport capability explicitly enables it.
  s.transportableColonies=Math.min(s.transportableColonies,s.serviceableManagedColonies);
}

export function tickAgriculturalPollinators(region,elapsedDays=7){
  const s=ensureAgriculturalPollinators(region);
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  s.habitatQuality=habitatQuality(region);
  s.floralDiversity=floralDiversity(region);
  s.pesticideStress=pesticideStress(region);
  s.weatherStress=weatherStress(region);
  const carrying=clamp(.28+s.habitatQuality*.45+s.floralDiversity*.27-s.pesticideStress*.72-s.weatherStress*.40,.04,1);
  const adjustment=1-Math.exp(-.85*years);
  s.wildHealth=clamp(s.wildHealth+(carrying-s.wildHealth)*adjustment,0,1);
  const wildService=clamp(s.wildHealth/REFERENCE_HEALTH,0,1);
  tickManagedBeekeeping(region,s,years);
  s.serviceLevel=clamp(wildService+(1-wildService)*s.managedService,0,1);
  for(const [id,dependence] of Object.entries(POLLINATOR_DEPENDENCE)){
    s.yieldMultiplierByCategory[id]=1-dependence*(1-s.serviceLevel);
  }
  const mix=region.foodDiversity?.productionMix||{};
  let weighted=0,total=0;
  for(const [id,dependence] of Object.entries(POLLINATOR_DEPENDENCE)){
    if(id==='animal_foods')continue;
    const w=nonNegative(mix[id]);
    weighted+=w*(1-dependence*(1-s.serviceLevel));total+=w;
  }
  s.aggregateYieldMultiplier=total>0?clamp(weighted/total,.55,1):1;
  region.report||={};
  region.report.agriculturalPollinators={workers:s.managedWorkers,wildHealth:s.wildHealth,habitatQuality:s.habitatQuality,floralDiversity:s.floralDiversity,pesticideStress:s.pesticideStress,weatherStress:s.weatherStress,managedColonies:s.managedColonies,serviceableManagedColonies:s.serviceableManagedColonies,managedHealth:s.managedHealth,managedCoverage:s.managedCoverage,managedService:s.managedService,hiveMaintenance:s.hiveMaintenance,transportableColonies:s.transportableColonies,serviceLevel:s.serviceLevel,yieldMultiplierByCategory:{...s.yieldMultiplierByCategory},aggregateYieldMultiplier:s.aggregateYieldMultiplier};
  return s;
}

export function pollinatorCategoryYieldMultiplier(region,category){
  return clamp(ensureAgriculturalPollinators(region).yieldMultiplierByCategory?.[category]??1,.25,1);
}

export function pollinatorAggregateYieldMultiplier(region){
  return clamp(ensureAgriculturalPollinators(region).aggregateYieldMultiplier,.55,1);
}

export function managedPollinationProfile(region){
  const s=ensureAgriculturalPollinators(region);
  return {colonies:s.managedColonies,serviceableColonies:s.serviceableManagedColonies,health:s.managedHealth,coverage:s.managedCoverage,service:s.managedService,workers:s.managedWorkers,transportableColonies:s.transportableColonies};
}
