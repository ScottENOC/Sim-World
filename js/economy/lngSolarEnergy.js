import { effectiveInfrastructureCount, operationalInfrastructure } from './construction.js?v=20260920-modern-energy1';
import { selectActiveTier } from '../world/resources/extraction.js?v=20260920-modern-energy1';
import {
  NATURAL_GAS_EXTRACTION_TECH_ID, GAS_TURBINE_GENERATION_TECH_ID, LNG_PROCESSING_TECH_ID,
  LNG_CARRIER_TECH_ID, PHOTOVOLTAIC_GENERATION_TECH_ID,
} from '../technology/modernEnergy.js?v=20260920-modern-energy1';

const DAYS_PER_YEAR=365.2425;
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=v=>Math.max(0,Number(v)||0);
let nextCarrierId=1;

export function ensureModernEnergy(region){
  region.modernEnergy||={}; const s=region.modernEnergy;
  s.gas||={lastExtraction:0,lastLiquefied:0,lastRegasified:0,electricityLoad:0};
  s.solar||={experience:0,lastOutput:0};
  s.lngCarriers||=[];
  if(!Array.isArray(s.lngCarriers))s.lngCarriers=[];
  return s;
}

export function syncNextLngCarrierId(regions){
  let max=0;
  for(const r of regions||[])for(const c of ensureModernEnergy(r).lngCarriers||[]){const m=String(c.id||'').match(/lng-carrier-(\d+)$/);if(m)max=Math.max(max,Number(m[1])||0);}
  nextCarrierId=Math.max(nextCarrierId,max+1); return nextCarrierId;
}

export function naturalGasExtraction(region,elapsedDays=7){
  const state=ensureModernEnergy(region), years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  state.gas.lastExtraction=0;
  if(!region.unlockedTechIds?.has?.(NATURAL_GAS_EXTRACTION_TECH_ID))return 0;
  const fields=effectiveInfrastructureCount(region,'natural_gas_field');
  const deposit=region.deposits?.natural_gas;
  const tier=deposit?.tiers?selectActiveTier(deposit.tiers,region.unlockedTechIds||new Set()):null;
  if(fields<=0||!tier||years<=0)return 0;
  const depletion=tier.initialStock>0?Math.pow(clamp(tier.remainingStock/tier.initialStock),tier.difficulty||.45):0;
  const output=Math.min(tier.remainingStock,fields*5200*years*depletion);
  tier.remainingStock=Math.max(0,tier.remainingStock-output);
  region.stockpile||={}; region.stockpile.natural_gas=nonNegative(region.stockpile.natural_gas)+output;
  state.gas.lastExtraction=output; return output;
}

function processingService(region){return clamp(.35+(region.electricity?.industrialService||0)*.65);}

export function tickLngProcessing(region,elapsedDays=7){
  const state=ensureModernEnergy(region), years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  region.stockpile||={}; state.gas.lastLiquefied=0; state.gas.lastRegasified=0; state.gas.electricityLoad=0;
  if(!region.unlockedTechIds?.has?.(LNG_PROCESSING_TECH_ID)||years<=0)return state.gas;
  const liquefiers=effectiveInfrastructureCount(region,'lng_liquefaction_terminal');
  const regas=effectiveInfrastructureCount(region,'lng_regasification_terminal');
  const gasPlants=effectiveInfrastructureCount(region,'gas_power_station');
  const reserve=gasPlants*900*years+250;
  const service=processingService(region);
  if(liquefiers>0&&nonNegative(region.stockpile.natural_gas)>reserve){
    const input=Math.min(nonNegative(region.stockpile.natural_gas)-reserve,liquefiers*4200*years*service);
    const output=input*.91;
    region.stockpile.natural_gas-=input; region.stockpile.lng=nonNegative(region.stockpile.lng)+output;
    state.gas.lastLiquefied=output; state.gas.electricityLoad+=input*.075;
  }
  if(regas>0&&nonNegative(region.stockpile.natural_gas)<reserve&&nonNegative(region.stockpile.lng)>0){
    const desired=Math.max(0,reserve-nonNegative(region.stockpile.natural_gas));
    const input=Math.min(nonNegative(region.stockpile.lng),regas*5200*years*service,desired/.985);
    const output=input*.985;
    region.stockpile.lng-=input; region.stockpile.natural_gas=nonNegative(region.stockpile.natural_gas)+output;
    state.gas.lastRegasified=output; state.gas.electricityLoad+=input*.018;
  }
  return state.gas;
}

export function tickModernEnergy(region,elapsedDays=7){naturalGasExtraction(region,elapsedDays);return tickLngProcessing(region,elapsedDays);}
export function modernEnergyElectricityDemand(region){return nonNegative(ensureModernEnergy(region).gas.electricityLoad);}

export function gasPowerPotential(region,elapsedDays=7){
  if(!region.unlockedTechIds?.has?.(GAS_TURBINE_GENERATION_TECH_ID))return {outputPotential:0,gasForFullOutput:0};
  const plants=effectiveInfrastructureCount(region,'gas_power_station'), years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  if(plants<=0||years<=0)return {outputPotential:0,gasForFullOutput:0};
  const gasAvailable=nonNegative(region.stockpile?.natural_gas), gasForFullOutput=plants*760*years;
  const fuelRatio=gasForFullOutput>0?clamp(gasAvailable/gasForFullOutput):0;
  return {outputPotential:plants*5000*years*fuelRatio,gasForFullOutput:gasForFullOutput*fuelRatio};
}

export function consumeGasForGeneration(region,output,potential){
  const p=Math.max(.000001,Number(potential?.outputPotential)||0), fraction=clamp(nonNegative(output)/p);
  const gas=Math.min(nonNegative(region.stockpile?.natural_gas),nonNegative(potential?.gasForFullOutput)*fraction);
  if(gas>0)region.stockpile.natural_gas-=gas;
  ensureModernEnergy(region).gas.lastPowerGasConsumed=gas; return gas;
}

export function solarGenerationMultiplier(region,elapsedDays=7){
  const s=ensureModernEnergy(region).solar;
  if(!region.unlockedTechIds?.has?.(PHOTOVOLTAIC_GENERATION_TECH_ID))return 0;
  const years=Math.max(0,Number(elapsedDays)||0)/DAYS_PER_YEAR;
  const stations=effectiveInfrastructureCount(region,'solar_power_station');
  if(stations>0)s.experience=clamp(s.experience+years*(.025+Math.min(.08,stations*.006))*(1-s.experience));
  return .84+s.experience*.16;
}

export function lngRouteCompatible(origin,destination){
  return Boolean(origin?.isCoastal&&destination?.isCoastal&&origin.unlockedTechIds?.has?.(LNG_CARRIER_TECH_ID)&&
    operationalInfrastructure(origin,'harbour')&&operationalInfrastructure(destination,'harbour')&&
    effectiveInfrastructureCount(origin,'lng_liquefaction_terminal')>0&&effectiveInfrastructureCount(destination,'lng_regasification_terminal')>0);
}

export function idleLngCarrier(region){
  const s=ensureModernEnergy(region), busy=new Set((region.tradeEconomy?.ventures||[]).filter(v=>v?.lngCarrierId).map(v=>v.lngCarrierId));
  return s.lngCarriers.find(c=>c.status!=='retired'&&(c.condition??1)>=.45&&!busy.has(c.id))||null;
}

export function lngCarrierCargoCapacity(carrier){return carrier?Math.max(500,Number(carrier.capacityUnits)||4200):0;}

export function buildLngCarrier(region){
  const s=ensureModernEnergy(region); region.stockpile||={}; region.industrialSupply||={}; region.industrialSupply.inventory||={};
  if(!region.unlockedTechIds?.has?.(LNG_CARRIER_TECH_ID))return {built:false,reason:'technology_not_ready'};
  if(!region.isCoastal||!operationalInfrastructure(region,'harbour')||!operationalInfrastructure(region,'large_drydock'))return {built:false,reason:'specialised_shipyard_required'};
  const machine=region.industrialSupply.inventory.machine_components||0;
  if(nonNegative(region.stockpile.steel)<190||machine<58||nonNegative(region.stockpile.diesel)<24||nonNegative(region.treasury)<90)return {built:false,reason:'insufficient_inputs'};
  region.stockpile.steel-=190; region.industrialSupply.inventory.machine_components-=58; region.stockpile.diesel-=24; region.treasury-=90;
  const carrier={id:`lng-carrier-${nextCarrierId++}`,type:'lng_carrier',status:'serviceable',condition:1,capacityUnits:4200}; s.lngCarriers.push(carrier);
  return {built:true,carrier};
}

export function tickLngCarrierProcurement(region){
  const s=ensureModernEnergy(region), terminals=effectiveInfrastructureCount(region,'lng_liquefaction_terminal')+effectiveInfrastructureCount(region,'lng_regasification_terminal');
  if(terminals<=0||!region.unlockedTechIds?.has?.(LNG_CARRIER_TECH_ID))return null;
  const target=Math.min(4,Math.max(1,Math.ceil(terminals*.75)));
  if(s.lngCarriers.filter(c=>c.status!=='retired').length>=target)return null;
  if(nonNegative(region.treasury)<180)return null;
  return buildLngCarrier(region);
}
