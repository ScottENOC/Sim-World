import { PETROLEUM_REFINING_TECH_ID, SHALLOW_OIL_DRILLING_TECH_ID } from './petroleum.js?v=20260920-modern-energy1';
import { ELECTRICAL_GENERATION_TECH_ID, INDUSTRIAL_ELECTRIFICATION_TECH_ID } from './electrification.js?v=20260920-modern-energy1';

export const NATURAL_GAS_EXTRACTION_TECH_ID = 'natural_gas_extraction';
export const GAS_TURBINE_GENERATION_TECH_ID = 'gas_turbine_generation';
export const LNG_PROCESSING_TECH_ID = 'lng_processing';
export const LNG_CARRIER_TECH_ID = 'lng_carrier_design';
export const PHOTOVOLTAIC_GENERATION_TECH_ID = 'photovoltaic_generation';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const weekly=(p,days)=>1-Math.pow(1-clamp(p),Math.max(0,Number(days)||0)/7);

function contacts(region,byId,techId){
  const ids=new Set([...(region.neighbors||[]),...(region.tradePartnerIds||[])]);
  if(region.recentTradePartners instanceof Map)for(const id of region.recentTradePartners.keys())ids.add(id);
  return [...ids].filter(id=>byId.get(id)?.unlockedTechIds?.has?.(techId)).length;
}
function diffusion(region,byId,techId,base){return 1-Math.pow(1-base,contacts(region,byId,techId));}
function readiness(region){
  const c=region.industrialSupply?.capability||{}, p=region.industrialPlants?.componentCapability||{};
  const machining=clamp(c.precision_machining||0), manufacture=clamp(region.structuralTransformation?.capability?.manufacture||0);
  const electronics=clamp(p.electronics||p.radio_navigation||0), finance=clamp(region.corporateCapital?.financialDepth||0);
  const electric=clamp(region.electricity?.industrialService||0);
  return {machining,manufacture,electronics,finance,electric,overall:clamp(machining*.28+manufacture*.28+electronics*.18+finance*.10+electric*.16)};
}

export function modernEnergyBreakthroughChances(region,byId){
  const t=region.unlockedTechIds||new Set(), r=readiness(region), hasGas=Boolean(region.deposits?.natural_gas);
  const gas=t.has(NATURAL_GAS_EXTRACTION_TECH_ID)||!t.has(SHALLOW_OIL_DRILLING_TECH_ID)?0:
    (hasGas?(0.20+r.machining*.42+r.manufacture*.38)*0.000010:0)+diffusion(region,byId,NATURAL_GAS_EXTRACTION_TECH_ID,0.00024);
  const turbine=t.has(GAS_TURBINE_GENERATION_TECH_ID)||!t.has(ELECTRICAL_GENERATION_TECH_ID)||!t.has(NATURAL_GAS_EXTRACTION_TECH_ID)?0:
    r.overall*(.35+r.machining*.35+r.manufacture*.30)*0.000006+diffusion(region,byId,GAS_TURBINE_GENERATION_TECH_ID,0.00016);
  const lng=t.has(LNG_PROCESSING_TECH_ID)||!t.has(PETROLEUM_REFINING_TECH_ID)||!t.has(NATURAL_GAS_EXTRACTION_TECH_ID)||!t.has(INDUSTRIAL_ELECTRIFICATION_TECH_ID)?0:
    r.overall*(.30+r.machining*.25+r.manufacture*.25+r.finance*.20)*0.000004+diffusion(region,byId,LNG_PROCESSING_TECH_ID,0.00012);
  const carrier=t.has(LNG_CARRIER_TECH_ID)||!t.has(LNG_PROCESSING_TECH_ID)||!region.isCoastal?0:
    r.overall*(.35+r.machining*.30+r.manufacture*.35)*0.0000035+diffusion(region,byId,LNG_CARRIER_TECH_ID,0.00010);
  const solar=t.has(PHOTOVOLTAIC_GENERATION_TECH_ID)||!t.has(ELECTRICAL_GENERATION_TECH_ID)?0:
    r.overall*(.25+r.electronics*.45+r.machining*.30)*0.0000038+diffusion(region,byId,PHOTOVOLTAIC_GENERATION_TECH_ID,0.00014);
  return {gas:clamp(gas),turbine:clamp(turbine),lng:clamp(lng),carrier:clamp(carrier),solar:clamp(solar)};
}

export function tickModernEnergyBreakthroughs(regions,currentTick,rng=Math.random,elapsedDays=7){
  const events=[], byId=new Map((regions||[]).map(r=>[r.id,r]));
  const attempts=[
    ['gas',NATURAL_GAS_EXTRACTION_TECH_ID,'natural_gas_breakthrough','Natural-gas production','Drilling and gas-handling methods make commercial natural-gas production practical.'],
    ['turbine',GAS_TURBINE_GENERATION_TECH_ID,'gas_turbine_breakthrough','Gas-turbine generation','Flexible gas-fired generating plant can now support electrical grids.'],
    ['lng',LNG_PROCESSING_TECH_ID,'lng_processing_breakthrough','Liquefied natural gas','Industrial refrigeration and gas handling make bulk LNG export and import practical.'],
    ['carrier',LNG_CARRIER_TECH_ID,'lng_carrier_breakthrough','LNG carrier design','Specialised insulated merchant ships can now carry LNG between equipped terminals.'],
    ['solar',PHOTOVOLTAIC_GENERATION_TECH_ID,'photovoltaic_breakthrough','Photovoltaic generation','Semiconductor manufacturing has matured enough for practical grid-connected solar generation.'],
  ];
  for(const region of regions||[]){
    region.unlockedTechIds||=new Set(); const chances=modernEnergyBreakthroughChances(region,byId);
    for(const [key,id,type,title,message] of attempts){
      if(region.unlockedTechIds.has(id)||rng()>=weekly(chances[key]||0,elapsedDays))continue;
      region.unlockedTechIds.add(id); events.push({type,regionId:region.id,regionName:region.name,tick:currentTick,title,message:`${region.name}: ${message}`}); break;
    }
  }
  return events;
}
