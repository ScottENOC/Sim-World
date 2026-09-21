import { DIET_FOOD_IDS } from './foodDiversity.js?v=20260921-food-diversity1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const DAYS_PER_YEAR=365.2425;

function ensureState(region){
  region.agriculturalPests||={};
  const s=region.agriculturalPests;
  s.baselinePressure=clamp(Number.isFinite(s.baselinePressure)?s.baselinePressure:0.18,0.05,0.45);
  s.currentPressure=clamp(Number.isFinite(s.currentPressure)?s.currentPressure:s.baselinePressure,0,1);
  s.outbreakSeverity=clamp(s.outbreakSeverity||0,0,1);
  s.cropDiseasePressure=clamp(Number.isFinite(s.cropDiseasePressure)?s.cropDiseasePressure:s.baselinePressure*0.7,0,1);
  s.pestDiversity=clamp(Number.isFinite(s.pestDiversity)?s.pestDiversity:0.35,0,1);
  s.yieldMultiplier=clamp(Number.isFinite(s.yieldMultiplier)?s.yieldMultiplier:1,0.45,1);
  s.categoryYieldMultiplier||={};
  s.history ||= [];
  return s;
}

function cropConcentration(region){
  const mix=region.foodDiversity?.productionMix||{};
  const shares=DIET_FOOD_IDS.map(id=>clamp(mix[id]||0));
  const max=Math.max(...shares,0.25);
  const hhi=shares.reduce((sum,v)=>sum+v*v,0);
  return clamp((max-0.25)/0.50*0.55 + (hhi-0.25)/0.35*0.45);
}

function weatherRisk(region){
  const index=Number(region.weather?.index)||0;
  const warm=clamp(1-Math.abs(Number(region.centroid?.[1])||0)/65);
  const wet=clamp((index+0.1)/1.2);
  const drought=clamp((-index-0.2)/1.4);
  return clamp(warm*wet*0.72 + drought*0.38 + Math.max(0,(region.climate?.temperatureAnomalyC||0))*0.05);
}

function tradeExposure(region){
  const imports=region.tradeEconomy?.weeklyImportsByResource||{};
  let importedPlantFood=0;
  for(const id of ['staple_grains','pulses','fruit_vegetables']) importedPlantFood+=Math.max(0,Number(imports[id])||0);
  const demand=Math.max(1,['staple_grains','pulses','fruit_vegetables'].reduce((sum,id)=>sum+Math.max(0,Number(region.marketDemand?.[id])||0),0));
  const partnerSignal=clamp((region.recentTradePartners?.size||0)/8);
  return clamp(Math.log1p(importedPlantFood/demand)/1.8*0.75 + partnerSignal*0.25);
}

function categorySusceptibility(region,id){
  const own=clamp(region.foodDiversity?.productionMix?.[id]||0);
  const concentration=cropConcentration(region);
  if(id==='animal_foods') return clamp(0.10+own*0.20);
  if(id==='fruit_vegetables') return clamp(0.45+own*0.35+concentration*0.15);
  if(id==='pulses') return clamp(0.38+own*0.30+concentration*0.12);
  return clamp(0.42+own*0.38+concentration*0.18);
}

export function pestYieldMultiplier(region){return ensureState(region).yieldMultiplier;}

export function tickAgriculturalPests(region,elapsedDays=7,rng=Math.random){
  const s=ensureState(region);
  const years=Math.max(0.001,(Number(elapsedDays)||0)/DAYS_PER_YEAR);
  const concentration=cropConcentration(region);
  const weather=weatherRisk(region);
  const exposure=tradeExposure(region);
  const agriculturalScale=clamp((region.agriculturalLand?.cultivatedHa||0)/Math.max(1,(region.areaSqKm||1)*100*0.25));
  const annualTrigger=clamp(0.012 + concentration*0.055 + weather*0.065 + exposure*0.12 + agriculturalScale*0.012,0,0.28);
  const triggerChance=1-Math.pow(1-annualTrigger,years);
  let outbreak=s.outbreakSeverity;
  if(rng()<triggerChance){
    const shock=0.15 + rng()*0.28 + concentration*0.16 + weather*0.12 + exposure*0.10;
    outbreak=clamp(Math.max(outbreak,shock));
  }
  const persistence=0.55 + concentration*0.16 + weather*0.12;
  const annualRecovery=clamp(0.60-persistence*0.35,0.20,0.50);
  outbreak*=Math.exp(-annualRecovery*years);
  const pressure=clamp(s.baselinePressure + outbreak*0.72 + weather*0.08 + exposure*0.10);
  const abnormalLoss=clamp(outbreak*(0.18+concentration*0.17+weather*0.10),0,0.48);
  const category={};
  for(const id of DIET_FOOD_IDS) category[id]=clamp(1-abnormalLoss*categorySusceptibility(region,id),0.45,1);

  s.outbreakSeverity=outbreak;
  s.currentPressure=pressure;
  s.cropDiseasePressure=clamp(s.baselinePressure*0.65+outbreak*(0.32+weather*0.28));
  s.pestDiversity=clamp(s.pestDiversity + (exposure*0.02+concentration*0.004-s.pestDiversity*0.001)*years);
  s.yieldMultiplier=clamp(1-abnormalLoss,0.52,1);
  s.categoryYieldMultiplier=category;
  s.weatherRisk=weather;s.monocultureRisk=concentration;s.externalExposure=exposure;
  if(outbreak>0.35 && (s.history.at(-1)?.active!==true)) s.history.push({active:true,severity:outbreak});
  if(outbreak<0.08 && s.history.at(-1)?.active===true) s.history.push({active:false,severity:outbreak});
  if(s.history.length>20)s.history.splice(0,s.history.length-20);
  region.report ||= {};
  region.report.agriculturalPests={baselinePressure:s.baselinePressure,currentPressure:s.currentPressure,outbreakSeverity:s.outbreakSeverity,yieldMultiplier:s.yieldMultiplier,weatherRisk:weather,monocultureRisk:concentration,externalExposure:exposure,categoryYieldMultiplier:{...category}};
  return region.report.agriculturalPests;
}
