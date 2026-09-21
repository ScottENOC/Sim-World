import assert from 'node:assert/strict';
import {
  BATTERY_TECH_IDS,
  batteryCapability,
  batteryMobilityCapability,
  dispatchBatteryStorage,
  installBatteryStorage,
} from '../js/economy/batteryStorage.js';
import { modernEnergyBreakthroughChances } from '../js/technology/modernEnergy.js';

function region(techIds=[]){
  return {
    id:'r1', name:'Test Region', population:100000,
    unlockedTechIds:new Set(techIds), neighbors:[], tradePartnerIds:[],
    industrialSupply:{capability:{precision_machining:.9,steelmaking:.9}},
    industrialPlants:{componentCapability:{electronics:.9}},
    structuralTransformation:{capability:{manufacture:.9}},
    corporateCapital:{financialDepth:.8}, electricity:{industrialService:.9},
    stockpile:{lead_acid_battery_cells:10,advanced_rechargeable_cells:10,lithium_ion_cells:10},
  };
}

{
  const r=region([BATTERY_TECH_IDS.LEAD_ACID]);
  const installed=installBatteryStorage(r,100,{chargeRate:100,dischargeRate:100});
  assert.equal(installed.installed,true);
  assert.equal(installed.cellsUsed,5,'100 storage capacity should consume five lead-acid cell units');
  assert.equal(r.stockpile.lead_acid_battery_cells,5);
  const charged=dispatchBatteryStorage(r,{surplus:100,elapsedDays:7});
  assert.equal(charged.chemistry,'lead_acid');
  assert.ok(charged.chargeInput>0);
  assert.ok(r.batteryStorage.storedEnergy>0);
  assert.ok(r.batteryStorage.storedEnergy<charged.chargeInput,'charging must incur losses');
  const before=r.batteryStorage.storedEnergy;
  const discharged=dispatchBatteryStorage(r,{shortfall:25,elapsedDays:7});
  assert.equal(discharged.discharged,25);
  assert.equal(r.batteryStorage.storedEnergy,before-25);
}

{
  const r=region([BATTERY_TECH_IDS.LITHIUM_ION]);
  r.stockpile.lithium_ion_cells=.5;
  const installed=installBatteryStorage(r,100);
  assert.equal(installed.installed,true);
  assert.equal(installed.materialLimited,true);
  assert.equal(installed.addedCapacity,31,'half a lithium-ion cell unit should install 31 capacity');
}

{
  const lead=region([BATTERY_TECH_IDS.LEAD_ACID]);
  const lithium=region([BATTERY_TECH_IDS.LEAD_ACID,BATTERY_TECH_IDS.ADVANCED,BATTERY_TECH_IDS.LITHIUM_ION]);
  assert.equal(batteryCapability(lithium).id,'lithium_ion');
  assert.ok(batteryMobilityCapability(lithium).energyDensity>batteryMobilityCapability(lead).energyDensity);
  assert.ok(batteryMobilityCapability(lithium).quietPropulsion>batteryMobilityCapability(lead).quietPropulsion);
  assert.ok(batteryMobilityCapability(lithium).satelliteUtility>batteryMobilityCapability(lead).satelliteUtility);
}

{
  const electrical=region(['electrical_generation']);
  const byId=new Map([[electrical.id,electrical]]);
  const chances=modernEnergyBreakthroughChances(electrical,byId);
  assert.ok(chances.leadAcid>0,'electrified industrial regions should be able to develop rechargeable batteries');
  assert.equal(chances.advancedBattery,0,'advanced batteries require lead-acid experience first');
  assert.equal(chances.lithiumIon,0,'lithium-ion requires advanced rechargeable batteries first');
}

console.log('battery storage regressions passed');
