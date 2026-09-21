import { tickAgriculturalPollinators, pollinatorCategoryYieldMultiplier } from './agriculturalPollinators.js?v=20260921-pollinators1';
import { geneticClimateMultiplier } from './agriculturalGenetics.js?v=20260921-genetics1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const DIET_FOOD_IDS=Object.freeze(['staple_grains','pulses','fruit_vegetables','animal_foods']);

function lat(region){return Math.abs(Number(region?.centroid?.[1])||0);}
function terrain(region,key){return clamp(region?.terrain?.[key]||0);}
function coastal(region){return region?.isCoastal?1:0;}
function pestCategoryMultiplier(region,id){return 1-clamp(region?.agriculturalPests?.extraYieldLoss?.[id]||0,0,.5);}

export function regionalFoodProductionMix(region){
  const latitude=lat(region),quality=clamp((Number(region?.landQuality)||1)/1.4),plains=terrain(region,'plains'),hills=terrain(region,'hills'),forest=terrain(region,'forest'),wet=terrain(region,'wetland');
  const warm=clamp(1-latitude/65),temperate=clamp(1-Math.abs(latitude-38)/38);
  const grain=.42+.32*plains+.12*quality+.08*temperate;
  const pulses=.18+.16*temperate+.10*hills+.10*quality;
  const produce=.14+.20*warm+.12*wet+.08*quality;
  const animals=.16+.12*hills+.08*forest+.08*coastal(region);
  const total=grain+pulses+produce+animals;
  return {staple_grains:grain/total,pulses:pulses/total,fruit_vegetables:produce/total,animal_foods:animals/total};
}

export function ensureFoodDiversity(region){
  region.foodDiversity||={};const s=region.foodDiversity;
  s.productionMix={...regionalFoodProductionMix(region),...(s.productionMix||{})};
  s.availability||={};s.consumption||={};s.shortage||={};s.pestMultiplier||={};s.pollinatorMultiplier||={};s.geneticClimateMultiplier||={};
  if(!Number.isFinite(s.diversityIndex))s.diversityIndex=0;
  if(!Number.isFinite(s.healthSupport))s.healthSupport=.9;
  return s;
}

export function foodDiversityProfile(region){return {...ensureFoodDiversity(region)};}

export function tickFoodDiversity(region,elapsedDays=7){
  const s=ensureFoodDiversity(region),weeks=Math.max(.01,(Number(elapsedDays)||0)/7),pop=Math.max(1,Number(region.population)||1);
  tickAgriculturalPollinators(region,elapsedDays);
  region.stockpile||={};region.marketDemand||={};
  const cultivated=Math.max(0,Number(region.agriculturalLand?.cultivatedHa)||0);
  const farmScale=Math.max(0.25,Math.min(2.2,cultivated/Math.max(1,pop*.18)));
  const categorySupply=pop*.025*weeks*farmScale;
  for(const id of DIET_FOOD_IDS){
    const pestMultiplier=pestCategoryMultiplier(region,id);
    const pollinatorMultiplier=pollinatorCategoryYieldMultiplier(region,id);
    const geneticMultiplier=geneticClimateMultiplier(region,id);
    s.pestMultiplier[id]=pestMultiplier;s.pollinatorMultiplier[id]=pollinatorMultiplier;s.geneticClimateMultiplier[id]=geneticMultiplier;
    const local=categorySupply*(s.productionMix[id]||0)*pestMultiplier*pollinatorMultiplier*geneticMultiplier;
    region.stockpile[id]=Math.max(0,Number(region.stockpile[id])||0)+local;
    const desired=pop*.0065*weeks;
    const available=Math.max(0,Number(region.stockpile[id])||0);
    const consumed=Math.min(available,desired);
    region.stockpile[id]=Math.max(0,available-consumed);
    const availability=clamp(consumed/Math.max(.0001,desired));
    const shortage=1-availability;
    s.availability[id]=availability;s.shortage[id]=shortage;s.consumption[id]=consumed;
    region.marketDemand[id]=(desired/weeks)*(1+shortage*5);
  }
  const values=DIET_FOOD_IDS.map(id=>clamp(s.availability[id]||0));
  const minimum=Math.min(...values),mean=values.reduce((a,b)=>a+b,0)/values.length;
  s.diversityIndex=clamp(mean*.65+minimum*.35);
  s.healthSupport=.94+s.diversityIndex*.08;
  region.report||={};region.report.foodDiversity={workers:0,productionMix:{...s.productionMix},availability:{...s.availability},shortage:{...s.shortage},pestMultiplier:{...s.pestMultiplier},pollinatorMultiplier:{...s.pollinatorMultiplier},geneticClimateMultiplier:{...s.geneticClimateMultiplier},diversityIndex:s.diversityIndex,healthSupport:s.healthSupport};
  return region.report.foodDiversity;
}
