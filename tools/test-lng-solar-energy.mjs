import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CONSTRUCTION_TYPES } from '../js/economy/construction.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';
import { tickElectricity } from '../js/economy/electricity.js';
import {
  ensureModernEnergy, tickModernEnergy, tickLngProcessing, buildLngCarrier, idleLngCarrier,
  lngRouteCompatible, gasPowerPotential, tickLngCarrierProcurement,
} from '../js/economy/lngSolarEnergy.js';
import {
  NATURAL_GAS_EXTRACTION_TECH_ID, GAS_TURBINE_GENERATION_TECH_ID, LNG_PROCESSING_TECH_ID,
  LNG_CARRIER_TECH_ID, PHOTOVOLTAIC_GENERATION_TECH_ID, tickModernEnergyBreakthroughs,
} from '../js/technology/modernEnergy.js';

const asset=(typeId)=>({id:`a-${typeId}`,typeId,condition:1,scale:1});
function region(overrides={}){
  return {
    id:'r',name:'Modern Energy Test',population:160000,isCoastal:true,areaSqKm:2000,centroid:[0,30],
    stockpile:{coal:0,copper:3000,steel:3000,diesel:500,natural_gas:0,lng:0},treasury:3000,
    construction:{projects:[],completed:{},assets:[],workersReserved:0},
    industrialSupply:{capability:{precision_machining:.9},inventory:{machine_components:500},outputCapacity:{},exposure:{}},
    industrialPlants:{componentCapability:{electronics:.85,radio_navigation:.8}},
    structuralTransformation:{capability:{manufacture:.9}},corporateCapital:{financialDepth:.8,firms:[]},
    electricity:{industrialService:.9,householdService:.8},unlockedTechIds:new Set(),governance:{sovereignPolityId:'p'},
    deposits:{natural_gas:{tiers:[{id:'conventional',initialStock:100000,remainingStock:100000,difficulty:.38,requiredTechId:NATURAL_GAS_EXTRACTION_TECH_ID,maxWorkers:100}]}},
    wallet:500,foodSecurity:.8,stability:.75,housing:{capacity:160000},labor:{unemploymentRate:.04},raidPressure:0,enterpriseExternalities:{},
    ...overrides,
  };
}
function withAssets(r,...types){r.construction.assets=types.map(asset);for(const t of types)r.construction.completed[t]=(r.construction.completed[t]||0)+1;return r;}

for(const id of ['natural_gas_field','gas_power_station','lng_liquefaction_terminal','lng_regasification_terminal','solar_power_station']){
  assert(CONSTRUCTION_TYPES[id],`${id} should be a buildable infrastructure type`);
}
assert(TRADE_GOODS.lng,'LNG should be a priced/tradable commodity');
assert(!TRADE_GOODS.natural_gas,'pipeline gas should not silently travel in ordinary merchant cargo');

const tech=region({id:'tech'});
for(const id of ['petroleum_well_drilling','petroleum_refining','electrical_generation','industrial_electrification'])tech.unlockedTechIds.add(id);
for(let i=0;i<8;i++)tickModernEnergyBreakthroughs([tech],i,()=>0,365.2425);
for(const id of [NATURAL_GAS_EXTRACTION_TECH_ID,GAS_TURBINE_GENERATION_TECH_ID,LNG_PROCESSING_TECH_ID,LNG_CARRIER_TECH_ID,PHOTOVOLTAIC_GENERATION_TECH_ID]){
  assert(tech.unlockedTechIds.has(id),`${id} should emerge from a mature industrial energy system`);
}

const producer=withAssets(region(), 'natural_gas_field','harbour','large_drydock','lng_liquefaction_terminal','local_electric_grid');
for(const id of [NATURAL_GAS_EXTRACTION_TECH_ID,LNG_PROCESSING_TECH_ID,LNG_CARRIER_TECH_ID])producer.unlockedTechIds.add(id);
const beforeDeposit=producer.deposits.natural_gas.tiers[0].remainingStock;
tickModernEnergy(producer,365.2425);
assert(producer.stockpile.lng>0,'a gas field plus liquefaction terminal should produce LNG');
assert(producer.deposits.natural_gas.tiers[0].remainingStock<beforeDeposit,'gas extraction should deplete the physical deposit');
assert(ensureModernEnergy(producer).gas.electricityLoad>0,'liquefaction should create a substantial electricity load');

const importer=withAssets(region({id:'importer',stockpile:{coal:0,copper:1000,steel:0,diesel:0,natural_gas:0,lng:1200}}), 'harbour','lng_regasification_terminal','gas_power_station','local_electric_grid');
importer.unlockedTechIds.add(LNG_PROCESSING_TECH_ID);importer.unlockedTechIds.add(LNG_CARRIER_TECH_ID);
const gasBefore=importer.stockpile.natural_gas;
tickLngProcessing(importer,365.2425);
assert(importer.stockpile.natural_gas>gasBefore && importer.stockpile.lng<1200,'regasification should turn imported LNG back into usable gas');
assert(lngRouteCompatible(producer,importer),'LNG routes should require compatible coastal export and import terminals');
const inland=region({id:'inland',isCoastal:false});inland.unlockedTechIds.add(LNG_CARRIER_TECH_ID);withAssets(inland,'lng_regasification_terminal','harbour');
assert(!lngRouteCompatible(producer,inland),'LNG should not move through an inland ordinary merchant route');

const built=buildLngCarrier(producer);
assert(built.built && built.carrier.type==='lng_carrier','specialised LNG carriers should be persistent merchant assets');
assert.equal(idleLngCarrier(producer)?.id,built.carrier.id);
producer.tradeEconomy={ventures:[{id:'v',lngCarrierId:built.carrier.id}]};
assert.equal(idleLngCarrier(producer),null,'an LNG carrier assigned to a voyage should be unavailable until the venture returns');
producer.tradeEconomy.ventures=[];
assert.equal(idleLngCarrier(producer)?.id,built.carrier.id,'the carrier should become available again after the venture clears');

const solarOnly=withAssets(region({id:'solar',weather:{solarAvailability:.9},electricity:{industrialService:0,householdService:0}}),'local_electric_grid','solar_power_station');
solarOnly.unlockedTechIds.add(PHOTOVOLTAIC_GENERATION_TECH_ID);
const solarResult=tickElectricity(solarOnly,365.2425);
assert(solarResult.solarOutput>0,'a photovoltaic station should generate electricity');
assert(solarResult.dispatch.balancingShortfall>0,'standalone solar should retain an intermittency/balancing cost');

const solarGas=withAssets(region({id:'solar-gas',weather:{solarAvailability:.9},stockpile:{coal:0,copper:3000,steel:0,diesel:0,natural_gas:5000,lng:0},electricity:{industrialService:0,householdService:0}}),'local_electric_grid','solar_power_station','gas_power_station');
solarGas.unlockedTechIds.add(PHOTOVOLTAIC_GENERATION_TECH_ID);solarGas.unlockedTechIds.add(GAS_TURBINE_GENERATION_TECH_ID);
assert(gasPowerPotential(solarGas,365.2425).outputPotential>0);
const gasStart=solarGas.stockpile.natural_gas;
const mixed=tickElectricity(solarGas,365.2425);
assert(mixed.gasOutput>0,'gas generation should respond when the grid needs firm energy or balancing');
assert(solarGas.stockpile.natural_gas<gasStart,'gas-fired output should consume physical natural gas');
assert(mixed.dispatch.balancingShortfall<solarResult.dispatch.balancingShortfall,'flexible gas generation should improve solar balancing');

const tradeSrc=fs.readFileSync(new URL('../js/economy/trade.js',import.meta.url),'utf8');
assert(tradeSrc.includes("opp.resource === 'lng'") && tradeSrc.includes('lngCarrierId'),'trade runtime should enforce LNG-specific carrier logistics');
const regionSrc=fs.readFileSync(new URL('../js/world/region.js',import.meta.url),'utf8');
assert(regionSrc.includes('deposits.natural_gas'),'world generation should seed latent natural-gas geology');
const mainSrc=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(mainSrc.includes('tickModernEnergy(region, time.elapsedDays)'),'modern energy runtime should run before grid dispatch');

// Procurement should not be able to build without the specialised shipbuilding base.
const noYard=withAssets(region({id:'no-yard'}),'harbour','lng_liquefaction_terminal');noYard.unlockedTechIds.add(LNG_CARRIER_TECH_ID);
assert.equal(tickLngCarrierProcurement(noYard,365.2425),null);

console.log('natural gas, LNG terminals/carriers/trade, gas peaking and solar intermittency regressions passed');
