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

export function ensureAgriculturalPollinators(region){
  region.agriculturalPollinators||={};
  const s=region.agriculturalPollinators;
  for(const [k,v] of Object.entries({wildHealth:REFERENCE_HEALTH,habitatQuality:.65,floralDiversity:.55,pesticideStress:0,weatherStress:0,serviceLevel:1,aggregateYieldMultiplier:1}))if(!Number.isFinite(s[k]))s[k]=v;
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
  s.serviceLevel=clamp(s.wildHealth/REFERENCE_HEALTH,0,1);
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
  region.report.agriculturalPollinators={workers:0,wildHealth:s.wildHealth,habitatQuality:s.habitatQuality,floralDiversity:s.floralDiversity,pesticideStress:s.pesticideStress,weatherStress:s.weatherStress,serviceLevel:s.serviceLevel,yieldMultiplierByCategory:{...s.yieldMultiplierByCategory},aggregateYieldMultiplier:s.aggregateYieldMultiplier};
  return s;
}

export function pollinatorCategoryYieldMultiplier(region,category){
  return clamp(ensureAgriculturalPollinators(region).yieldMultiplierByCategory?.[category]??1,.25,1);
}

export function pollinatorAggregateYieldMultiplier(region){
  return clamp(ensureAgriculturalPollinators(region).aggregateYieldMultiplier,.55,1);
}
