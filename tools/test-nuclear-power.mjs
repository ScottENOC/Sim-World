import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickNuclearFuelCycle, nuclearGeneration, nuclearSpentFuelStorageCapacity, NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, REACTOR_ENGINEERING_TECH_ID, NUCLEAR_POWER_TECH_ID, SPENT_FUEL_MANAGEMENT_TECH_ID } from '../js/economy/nuclearPower.js';
import { nuclearBreakthroughChances } from '../js/technology/nuclear.js';
import { tickElectricity, dispatchElectricityPortfolio } from '../js/economy/electricity.js';
import { availableConstructionTypes, startConstruction } from '../js/economy/construction.js';
import { tradeGood, isStrategicTradeGood } from '../js/economy/tradeGoods.js';

function asset(typeId,id=typeId){return {id:`a-${id}`,typeId,condition:1,scale:1};}
function region(overrides={}){
  const unlockedTechIds=new Set(['advanced_factories','electrical_generation','local_electric_distribution','industrial_electrification','steelmaking',NUCLEAR_PHYSICS_TECH_ID,URANIUM_FUEL_CYCLE_TECH_ID,REACTOR_ENGINEERING_TECH_ID,NUCLEAR_POWER_TECH_ID,SPENT_FUEL_MANAGEMENT_TECH_ID]);
  return {
    id:'nuke-test',name:'Nuclear Test',population:250000,isCoastal:false,hydrology:{riverIds:['r1'],waterAvailability:.9},
    unlockedTechIds,stockpile:{uranium_ore:900,uranium_concentrate:0,reactor_fuel:20,spent_nuclear_fuel:0,coal:0,copper:5000,steel:10000,aluminium:1000,stone:20000},
    resourceDeposits:{uranium:{depth:.75,remainingFraction:1,inferred:false}},
    occupations:{miner:4000},industrialSupply:{capability:{precision_machining:.78,steelmaking:.85,industrial_chemistry:.72,railway_engineering:.5,locomotive_engineering:.45}},
    structuralTransformation:{capability:{manufacture:.82,chemicals:.7}},massEducation:{literacy:.82},governance:{administration:{recordKeeping:.75},administrativeControl:.78},corporateCapital:{firms:[]},
    construction:{projects:[],completed:{factory:1,nuclear_fuel_plant:1,nuclear_power_station:1,local_electric_grid:2},assets:[asset('factory'),asset('nuclear_fuel_plant'),asset('nuclear_power_station'),asset('local_electric_grid','g1'),asset('local_electric_grid','g2')],workersReserved:0},
    ...overrides,
  };
}

const fuelRegion=region();
const beforeOre=fuelRegion.stockpile.uranium_ore;
const fuel=tickNuclearFuelCycle(fuelRegion,365.2425);
assert(fuel.uraniumOreMined>0,'known uranium deposits should support uranium extraction once the fuel cycle exists');
assert(fuel.oreProcessed>0 && fuel.concentrateProduced>0,'fuel-cycle plants should turn uranium ore into concentrate');
assert(fuel.reactorFuelProduced>0 && fuelRegion.stockpile.reactor_fuel>20,'fuel-cycle plants should fabricate civilian reactor fuel');
assert(fuelRegion.stockpile.uranium_ore<beforeOre+fuel.uraniumOreMined,'processing should physically consume uranium ore');

const beforeFuel=fuelRegion.stockpile.reactor_fuel;
const generation=nuclearGeneration(fuelRegion,365.2425);
assert(generation.output>0,'a fuelled operational reactor should generate electricity');
assert(generation.reactorFuelConsumed>0 && fuelRegion.stockpile.reactor_fuel<beforeFuel,'generation must consume fabricated reactor fuel');
assert(generation.spentFuelGenerated>0 && fuelRegion.stockpile.spent_nuclear_fuel>0,'reactor operation must create persistent spent fuel');
assert(generation.capacityFactor<1,'first-generation reactors should not behave as perfect 100% capacity-factor generators');

const starved=region({stockpile:{uranium_ore:0,uranium_concentrate:0,reactor_fuel:0,spent_nuclear_fuel:0,coal:0,copper:5000},construction:{projects:[],completed:{nuclear_power_station:1,local_electric_grid:1},assets:[asset('nuclear_power_station'),asset('local_electric_grid')],workersReserved:0}});
const noFuel=nuclearGeneration(starved,365.2425);
assert.equal(noFuel.output,0,'reactors without reactor fuel must shut down rather than create energy');

const congested=region({stockpile:{uranium_ore:0,uranium_concentrate:0,reactor_fuel:50,spent_nuclear_fuel:120,coal:0,copper:5000}});
const congestedOut=nuclearGeneration(congested,365.2425).output;
const stored=region({stockpile:{uranium_ore:0,uranium_concentrate:0,reactor_fuel:50,spent_nuclear_fuel:120,coal:0,copper:5000},construction:{projects:[],completed:{factory:1,nuclear_fuel_plant:1,nuclear_power_station:1,local_electric_grid:2,spent_fuel_storage:1},assets:[asset('factory'),asset('nuclear_fuel_plant'),asset('nuclear_power_station'),asset('local_electric_grid','g1'),asset('local_electric_grid','g2'),asset('spent_fuel_storage')],workersReserved:0}});
assert(nuclearSpentFuelStorageCapacity(stored)>nuclearSpentFuelStorageCapacity(congested),'dedicated spent-fuel storage should materially expand safe storage capacity');
const storedOut=nuclearGeneration(stored,365.2425).output;
assert(storedOut>congestedOut,'severe spent-fuel congestion should derate reactors until storage is expanded');

const electric=region();
const electricResult=tickElectricity(electric,365.2425);
assert(electricResult.nuclearOutput>0,'nuclear generation should feed the ordinary electricity portfolio');
assert(electricResult.reactorFuelConsumed>0 && electricResult.spentFuelGenerated>0,'electricity dispatch should expose the physical nuclear fuel cycle');
const steady=dispatchElectricityPortfolio({nuclear:5000},10000);
assert.equal(steady.dispatchEfficiency,1,'steady nuclear generation should not be penalised when no variable balancing is required');
const nuclearSolar=dispatchElectricityPortfolio({nuclear:5000,solar:4000},10000);
assert(nuclearSolar.nuclearCyclingLoss>0,'early inflexible reactors should incur some system penalty when forced to balance large variable output without flexible plant');

const dry=region({id:'dry',isCoastal:false,hydrology:{riverIds:[]},construction:{projects:[],completed:{local_electric_grid:1},assets:[asset('local_electric_grid')],workersReserved:0}});
assert(!availableConstructionTypes(dry).some(t=>t.id==='nuclear_power_station'),'large reactors should require coastal or river cooling water');
assert.equal(startConstruction(dry,'nuclear_power_station',1800,1),null,'construction should reject a nuclear station at a dry inland site');
const wet=region({id:'wet',isCoastal:false,hydrology:{riverIds:['river']},construction:{projects:[],completed:{local_electric_grid:1},assets:[asset('local_electric_grid')],workersReserved:0}});
assert(availableConstructionTypes(wet).some(t=>t.id==='nuclear_power_station'),'a sufficiently industrial river site should be eligible for a nuclear station');
assert(startConstruction(wet,'nuclear_power_station',1800,1),'an eligible site should be able to begin a multi-year reactor project');

const primitive=region({id:'primitive',unlockedTechIds:new Set(),massEducation:{literacy:.8}});
let chances=nuclearBreakthroughChances(primitive,new Map([['primitive',primitive]]));
assert.equal(chances.physics,0,'nuclear physics should not emerge without an advanced electrical industrial base');
const modern=region({id:'modern',unlockedTechIds:new Set(['advanced_factories','electrical_generation','industrial_electrification','local_electric_distribution','steelmaking'])});
let byId=new Map([['modern',modern]]);chances=nuclearBreakthroughChances(modern,byId);
assert(chances.physics>0,'advanced literate precision industry should be able to develop nuclear physics');
modern.unlockedTechIds.add(NUCLEAR_PHYSICS_TECH_ID);chances=nuclearBreakthroughChances(modern,byId);
assert(chances.fuelCycle>0 && chances.reactorEngineering>0,'nuclear physics should branch into fuel-cycle and reactor-engineering knowledge');
assert.equal(chances.nuclearPower,0,'civilian nuclear power should require both reactor engineering and fuel-cycle knowledge');
modern.unlockedTechIds.add(URANIUM_FUEL_CYCLE_TECH_ID);modern.unlockedTechIds.add(REACTOR_ENGINEERING_TECH_ID);chances=nuclearBreakthroughChances(modern,byId);
assert(chances.nuclearPower>0,'fuel-cycle plus reactor engineering and a grid should open civilian nuclear power');

for(const good of ['uranium_ore','uranium_concentrate','reactor_fuel']){
  assert(tradeGood(good),`${good} should be a tradeable civilian nuclear input`);
  assert(isStrategicTradeGood(good),`${good} should default to strategic export control`);
}
assert.equal(tradeGood('spent_nuclear_fuel'),null,'radioactive waste must not move through ordinary merchant trade');

const construction=fs.readFileSync(new URL('../js/economy/construction.js',import.meta.url),'utf8');
for(const id of ['nuclear_fuel_plant','nuclear_power_station','spent_fuel_storage'])assert(construction.includes(`id: '${id}'`),`${id} construction type should be integrated`);
const breakthroughs=fs.readFileSync(new URL('../js/technology/breakthroughs.js',import.meta.url),'utf8');
assert(breakthroughs.includes('tickNuclearBreakthroughs'),'nuclear technology progression should join the normal breakthrough loop');

console.log('civilian nuclear physics, uranium fuel cycle, reactor construction, generation, cooling, waste and trade regressions passed');
