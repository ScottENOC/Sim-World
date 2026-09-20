const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const DIET_FOOD_IDS=Object.freeze(['staple_grains','pulses','fruit_vegetables','animal_foods']);

function lat(region){return Math.abs(Number(region?.centroid?.[1])||0);}
function terrain(region,key){return clamp(region?.terrain?.[key]||0);}
function coastal(region){return region?.isCoastal?1:0;}

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
  s.availability||={};s.consumption||={};
  if(!Number.isFinite(s.diversityIndex))s.diversityIndex=0;
  if(!Number.isFinite(s.healthSupport))s.healthSupport=.9;
  return s;
}

export function foodDiversityProfile(region){return {...ensureFoodDiversity(region)};}

export function tickFoodDiversity(region,elapsedDays=7){
  const s=ensureFoodDiversity(region),weeks=Math.max(.01,(Number(elapsedDays)||0)/7),pop=Math.max(1,Number(region.population)||1);
  region.stockpile||={};region.marketDemand||={};
  const cultivated=Math.max(0,Number(region.agriculturalLand?.cultivatedHa)||0);
  const farmScale=Math.max(0.25,Math.min(2.2,cultivated/Math.max(1,pop*.18)));
  // These stocks represent dietary-category availability rather than a second calorie ledger.
  // Generic `food` remains the caloric accounting stock for compatibility.
  const categorySupply=pop*.025*weeks*farmScale;
  for(const id of DIET_FOOD_IDS){
    const local=categorySupply*(s.productionMix[id]||0);
    region.stockpile[id]=Math.max(0,Number(region.stockpile[id])||0)+local;
    const desired=pop*.0065*weeks; // enough demand to reward imports of underrepresented foods
    region.marketDemand[id]=desired/weeks;
    const available=Math.max(0,Number(region.stockpile[id])||0);
    const consumed=Math.min(available,desired);
    region.stockpile[id]=Math.max(0,available-consumed);
    s.availability[id]=clamp(consumed/Math.max(.0001,desired));
    s.consumption[id]=consumed;
  }
  const values=DIET_FOOD_IDS.map(id=>clamp(s.availability[id]||0));
  const minimum=Math.min(...values),mean=values.reduce((a,b)=>a+b,0)/values.length;
  // Health cares about both breadth and bottlenecks: four adequate categories beat one huge staple surplus.
  s.diversityIndex=clamp(mean*.65+minimum*.35);
  s.healthSupport=.94+s.diversityIndex*.08; // deliberately modest; famine/calories remain dominant
  region.report||={};region.report.foodDiversity={workers:0,productionMix:{...s.productionMix},availability:{...s.availability},diversityIndex:s.diversityIndex,healthSupport:s.healthSupport};
  return region.report.foodDiversity;
}
