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
  const w=region.weather||{};
  const index=Number(w.index)||0;
  const warm=clamp(1-Math.abs(Number(region.centroid?.[1])||0)/65);
  const wet=clamp((index+0.1)/1.2);
  const drought=clamp((-index-0.2)/1.4);
  // Wet/warm seasons favour many insects and fungal diseases; severe dry spells
  // also create outbreak risk for locust-like and drought-stressed systems.
  return clamp(warm*wet*0.72 + drought*0.38 + Math.max(0,(region.climate?.temperatureAnomalyC||0))*0.05);
}

function exposurePressure(region,byId){
  let best=0;
  for(const id of region.neighbors||[]) best=Math.max(best,clamp(byId.get(id)?.agriculturalPests?.outbreakSeverity||0));
  for(const id of region.recentTradePartners||[]) best=Math.max(best,clamp(byId.get(id)?.agriculturalPests?.outbreakSeverity||0)*0.75);
  return best;
}

function categorySusceptibility(region,id){
  const mix=region.foodDiversity?.productionMix||{};
  const own=clamp(mix[id]||0);
  const concentration=cropConcentration(region);
  if(id==='animal_foods') return clamp(0.12+own*0.28);
  if(id==='fruit_vegetables') return clamp(0.45+own*0.35+concentration*0.15);
  if(id==='pulses') return clamp(0.38+own*0.30+concentration*0.12);
  return clamp(0.42+own*0.38+concentration*0.18);
}

export function pestYieldMultiplier(region){return ensureState(region).yieldMultiplier;}

export function tickAgriculturalPests(regions,elapsedDays=7,rng=Math.random){
  const years=Math.max(0.001,(Number(elapsedDays)||0)/DAYS_PER_YEAR);
  const byId=new Map((regions||[]).map(r=>[r.id,r]));
  const next=[];
  for(const region of regions||[]){
    const s=ensureState(region);
    const concentration=cropConcentration(region);
    const weather=weatherRisk(region);
    const exposure=exposurePressure(region,byId);
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
    next.push({region,outbreak,pressure,weather,concentration,exposure,abnormalLoss,category});
  }
  for(const n of next){
    const s=ensureState(n.region);
    s.outbreakSeverity=n.outbreak;
    s.currentPressure=n.pressure;
    s.cropDiseasePressure=clamp(s.baselinePressure*0.65+n.outbreak*(0.32+n.weather*0.28));
    s.pestDiversity=clamp(s.pestDiversity + (n.exposure*0.02+n.concentration*0.004-s.pestDiversity*0.001)*years);
    s.yieldMultiplier=clamp(1-n.abnormalLoss,0.52,1);
    s.categoryYieldMultiplier=n.category;
    s.weatherRisk=n.weather;s.monocultureRisk=n.concentration;s.externalExposure=n.exposure;
    if(n.outbreak>0.35 && (s.history.at(-1)?.active!==true)) s.history.push({active:true,severity:n.outbreak});
    if(n.outbreak<0.08 && s.history.at(-1)?.active===true) s.history.push({active:false,severity:n.outbreak});
    if(s.history.length>20)s.history.splice(0,s.history.length-20);
    n.region.report ||= {};
    n.region.report.agriculturalPests={baselinePressure:s.baselinePressure,currentPressure:s.currentPressure,outbreakSeverity:s.outbreakSeverity,yieldMultiplier:s.yieldMultiplier,weatherRisk:n.weather,monocultureRisk:n.concentration,externalExposure:n.exposure,categoryYieldMultiplier:{...n.category}};
  }
}
