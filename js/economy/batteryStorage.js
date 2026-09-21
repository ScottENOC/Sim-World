import { availableBatteryCapacityFromCells, consumeBatteryCellsForCapacity } from './batterySupplyChain.js?v=20260921-battery-chain1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const nonNegative=(v)=>Math.max(0,Number(v)||0);

export const BATTERY_TECH_IDS=Object.freeze({
  LEAD_ACID:'lead_acid_batteries',
  ADVANCED:'advanced_rechargeable_batteries',
  LITHIUM_ION:'lithium_ion_batteries',
});

export const BATTERY_CHEMISTRIES=Object.freeze({
  lead_acid:{id:'lead_acid',energyDensity:0.18,powerDensity:0.48,roundTripEfficiency:0.74,cycleLife:0.26,safety:0.82,costIndex:0.42},
  advanced_rechargeable:{id:'advanced_rechargeable',energyDensity:0.42,powerDensity:0.62,roundTripEfficiency:0.82,cycleLife:0.52,safety:0.76,costIndex:0.58},
  lithium_ion:{id:'lithium_ion',energyDensity:0.86,powerDensity:0.84,roundTripEfficiency:0.91,cycleLife:0.74,safety:0.68,costIndex:0.72},
});

export function batteryCapability(region){
  const tech=region?.unlockedTechIds||new Set();
  if(tech.has(BATTERY_TECH_IDS.LITHIUM_ION))return BATTERY_CHEMISTRIES.lithium_ion;
  if(tech.has(BATTERY_TECH_IDS.ADVANCED))return BATTERY_CHEMISTRIES.advanced_rechargeable;
  if(tech.has(BATTERY_TECH_IDS.LEAD_ACID))return BATTERY_CHEMISTRIES.lead_acid;
  return null;
}

export function ensureBatteryStorage(region){
  region.batteryStorage||={installedCapacity:0,storedEnergy:0,maxChargeRate:0,maxDischargeRate:0,throughput:0,losses:0,lastCharge:0,lastDischarge:0,installedByChemistry:{}};
  const state=region.batteryStorage;
  state.installedByChemistry ||= {};
  state.installedCapacity=nonNegative(state.installedCapacity);
  state.storedEnergy=clamp(state.storedEnergy,0,state.installedCapacity);
  if(!Number.isFinite(state.maxChargeRate)||state.maxChargeRate<=0)state.maxChargeRate=state.installedCapacity*.38;
  if(!Number.isFinite(state.maxDischargeRate)||state.maxDischargeRate<=0)state.maxDischargeRate=state.installedCapacity*.48;
  return state;
}

export function installBatteryStorage(region,capacity,{chargeRate=null,dischargeRate=null,requireCells=true}={}){
  const capability=batteryCapability(region);
  if(!capability)return{installed:false,reason:'battery_technology_unavailable'};
  const state=ensureBatteryStorage(region);
  const requested=nonNegative(capacity);
  if(requested<=0)return{installed:false,reason:'invalid_capacity'};

  let added=requested;
  let cellsUsed=0;
  let cellGood=null;
  if(requireCells){
    const material=consumeBatteryCellsForCapacity(region,capability.id,requested);
    added=material.capacity;
    cellsUsed=material.cellsUsed;
    cellGood=material.good;
    if(added<=0)return{
      installed:false,
      reason:'battery_cells_unavailable',
      chemistry:capability.id,
      availableCellCapacity:availableBatteryCapacityFromCells(region,capability.id),
      cellGood,
    };
  }

  state.installedCapacity+=added;
  state.installedByChemistry[capability.id]=nonNegative(state.installedByChemistry[capability.id])+added;
  state.maxChargeRate=chargeRate==null?state.installedCapacity*(.25+capability.powerDensity*.22):nonNegative(chargeRate);
  state.maxDischargeRate=dischargeRate==null?state.installedCapacity*(.30+capability.powerDensity*.28):nonNegative(dischargeRate);
  return{
    installed:true,
    requestedCapacity:requested,
    addedCapacity:added,
    capacity:state.installedCapacity,
    chemistry:capability.id,
    cellsUsed,
    cellGood,
    materialLimited:added+1e-9<requested,
  };
}

export function dispatchBatteryStorage(region,{surplus=0,shortfall=0,elapsedDays=7}={}){
  const capability=batteryCapability(region);
  const state=ensureBatteryStorage(region);
  state.lastCharge=0; state.lastDischarge=0;
  if(!capability||state.installedCapacity<=0)return{chargeInput:0,discharged:0,storedEnergy:state.storedEnergy,losses:0,chemistry:null};
  const interval=Math.max(1/7,nonNegative(elapsedDays)/7);
  const chargeRoom=Math.max(0,state.installedCapacity-state.storedEnergy);
  const chargeInput=Math.min(nonNegative(surplus),state.maxChargeRate*interval,chargeRoom/Math.max(.01,capability.roundTripEfficiency));
  const stored=chargeInput*capability.roundTripEfficiency;
  state.storedEnergy=Math.min(state.installedCapacity,state.storedEnergy+stored);
  const chargeLoss=Math.max(0,chargeInput-stored);
  const discharge=Math.min(nonNegative(shortfall),state.maxDischargeRate*interval,state.storedEnergy);
  state.storedEnergy=Math.max(0,state.storedEnergy-discharge);
  state.lastCharge=chargeInput;
  state.lastDischarge=discharge;
  state.throughput=nonNegative(state.throughput)+chargeInput+discharge;
  state.losses=nonNegative(state.losses)+chargeLoss;
  return{chargeInput,discharged:discharge,storedEnergy:state.storedEnergy,losses:chargeLoss,chemistry:capability.id};
}

export function batteryMobilityCapability(region){
  const c=batteryCapability(region);
  if(!c)return{available:false,energyDensity:0,endurance:0,quietPropulsion:0,satelliteUtility:0};
  return{
    available:true,
    chemistry:c.id,
    energyDensity:c.energyDensity,
    endurance:clamp(c.energyDensity*.62+c.cycleLife*.20+c.powerDensity*.18),
    quietPropulsion:clamp(c.energyDensity*.38+c.powerDensity*.42+c.roundTripEfficiency*.20),
    satelliteUtility:clamp(c.energyDensity*.48+c.cycleLife*.24+c.roundTripEfficiency*.28),
  };
}
