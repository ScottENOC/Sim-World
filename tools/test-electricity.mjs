import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickElectricity, electricityIndustrialMultiplier, electricityWellbeing } from '../js/economy/electricity.js';
import { electrificationBreakthroughChances, ELECTRICAL_GENERATION_TECH_ID, LOCAL_ELECTRIC_DISTRIBUTION_TECH_ID, HYDROELECTRIC_GENERATION_TECH_ID } from '../js/technology/electrification.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';

function asset(typeId) { return { id:`a-${typeId}`, typeId, condition:1, scale:1 }; }
function region(overrides={}) { return {
  id:'r', name:'Electric Test', population:100000, stockpile:{coal:10000},
  construction:{projects:[],completed:{},assets:[],workersReserved:0},
  industrialSupply:{capability:{steelmaking:.8,precision_machining:.8,locomotive_engineering:.4,railway_engineering:.5},outputCapacity:{},inventory:{},exposure:{}},
  structuralTransformation:{capability:{manufacture:.7}}, corporateCapital:{firms:[]},
  unlockedTechIds:new Set(), governance:{sovereignPolityId:'p'}, wallet:500, foodSecurity:.7, stability:.6,
  housing:{capacity:80000}, labor:{unemploymentRate:.08}, raidPressure:.18, enterpriseExternalities:{}, ...overrides,
}; }

const generatorOnly=region({construction:{projects:[],completed:{coal_power_station:1},assets:[asset('coal_power_station')],workersReserved:0}});
const gen=tickElectricity(generatorOnly,365.2425);
assert(gen.generated>0,'a fuelled power station should generate electricity');
assert.equal(gen.delivered,0,'generation without a distribution grid should provide no delivered electrical service');
assert(generatorOnly.stockpile.coal<10000,'coal generation must physically consume coal');

const powered=region({construction:{projects:[],completed:{coal_power_station:1,local_electric_grid:1},assets:[asset('coal_power_station'),asset('local_electric_grid')],workersReserved:0}});
const poweredResult=tickElectricity(powered,365.2425);
assert(poweredResult.delivered>0 && powered.electricity.householdService>0 && powered.electricity.industrialService>0,'generation plus a grid should deliver household and industrial power');
assert(electricityIndustrialMultiplier(powered)>1,'delivered industrial electricity should improve industrial output');
assert(electricityIndustrialMultiplier(powered)<=1.2,'first-generation electrification bonus must remain bounded');

const fuelStarved=region({stockpile:{coal:0},construction:{projects:[],completed:{coal_power_station:1,local_electric_grid:1},assets:[asset('coal_power_station'),asset('local_electric_grid')],workersReserved:0}});
const starved=tickElectricity(fuelStarved,365.2425);
assert.equal(starved.generated,0,'coal stations without coal must not generate');
assert.equal(starved.delivered,0,'a grid cannot manufacture electricity by itself');

const hydro=region({stockpile:{coal:0},hydrology:{riverIds:['river'],waterAvailability:.9},construction:{projects:[],completed:{reservoir_dam:1,hydroelectric_station:1,local_electric_grid:1},assets:[asset('reservoir_dam'),asset('hydroelectric_station'),asset('local_electric_grid')],workersReserved:0}});
const hydroResult=tickElectricity(hydro,365.2425);
assert(hydroResult.hydroOutput>0 && hydroResult.delivered>0,'hydroelectric generation should work with controlled water and a grid');
assert.equal(hydroResult.coalConsumed,0,'hydroelectricity should not consume coal');

const noService=region({electricity:{householdService:0,industrialService:0}});
const fullService=region({electricity:{householdService:1,industrialService:1}});
assert(electricityWellbeing(fullService).culturalAccess>electricityWellbeing(noService).culturalAccess);
const polity={id:'p',continuity:{legitimacy:.5},institutions:{}};
assert(assessPopularWellbeing(fullService,polity).culturalAccess>assessPopularWellbeing(noService,polity).culturalAccess,'delivered electric lighting should feed the normal wellbeing model');

const tech=region({id:'tech'}); const byId=new Map([['tech',tech]]);
let chances=electrificationBreakthroughChances(tech,byId);
assert(chances.generation>0,'sufficiently industrial regions should be able to develop electrical generation');
assert.equal(chances.distribution,0,'distribution requires generation knowledge first');
tech.unlockedTechIds.add(ELECTRICAL_GENERATION_TECH_ID);
chances=electrificationBreakthroughChances(tech,byId);
assert(chances.distribution>0 && chances.hydro>0,'generation knowledge should open distribution and hydro paths');

const construction=fs.readFileSync(new URL('../js/economy/construction.js',import.meta.url),'utf8');
for (const id of ['coal_power_station','local_electric_grid','hydroelectric_station']) assert(construction.includes(`id: '${id}'`));
const breakthroughs=fs.readFileSync(new URL('../js/technology/breakthroughs.js',import.meta.url),'utf8');
assert(breakthroughs.includes('tickElectrificationBreakthroughs'));
const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(main.includes('tickElectricity(region, time.elapsedDays)'));

console.log('electricity generation, grid, fuel, hydro, industry and wellbeing regressions passed');
