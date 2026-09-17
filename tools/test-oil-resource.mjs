import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectActiveTier } from '../js/world/resources/extraction.js';
import { tradeGood, TRADABLE_RESOURCES } from '../js/economy/tradeGoods.js';
import { civilianOilDemand, tickHouseholdEnergy, householdEnergyWellbeing } from '../js/economy/householdEnergy.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';
import { SHALLOW_OIL_DRILLING_TECH_ID, DEEP_OIL_DRILLING_TECH_ID, HYDRAULIC_FRACTURING_TECH_ID, OFFSHORE_OIL_DRILLING_TECH_ID, petroleumBreakthroughChances } from '../js/technology/petroleum.js';

const tiers = [
  { id:'seep', remainingStock:1, requiredTechId:null },
  { id:'shallow_onshore', remainingStock:10, requiredTechId:SHALLOW_OIL_DRILLING_TECH_ID },
  { id:'deep_onshore', remainingStock:20, requiredTechId:DEEP_OIL_DRILLING_TECH_ID },
  { id:'tight', remainingStock:30, requiredTechId:HYDRAULIC_FRACTURING_TECH_ID },
  { id:'offshore', remainingStock:40, requiredTechId:OFFSHORE_OIL_DRILLING_TECH_ID },
];
assert.equal(selectActiveTier(tiers,new Set()).id,'seep');
tiers[0].remainingStock=0;
assert.equal(selectActiveTier(tiers,new Set()),null,'large reserves must remain locked without drilling knowledge');
assert.equal(selectActiveTier(tiers,new Set([SHALLOW_OIL_DRILLING_TECH_ID])).id,'shallow_onshore');
tiers[1].remainingStock=0;
assert.equal(selectActiveTier(tiers,new Set([SHALLOW_OIL_DRILLING_TECH_ID,DEEP_OIL_DRILLING_TECH_ID])).id,'deep_onshore');
tiers[2].remainingStock=0;
assert.equal(selectActiveTier(tiers,new Set([SHALLOW_OIL_DRILLING_TECH_ID,DEEP_OIL_DRILLING_TECH_ID,HYDRAULIC_FRACTURING_TECH_ID])).id,'tight');
tiers[3].remainingStock=0;
assert.equal(selectActiveTier(tiers,new Set([SHALLOW_OIL_DRILLING_TECH_ID,DEEP_OIL_DRILLING_TECH_ID,HYDRAULIC_FRACTURING_TECH_ID,OFFSHORE_OIL_DRILLING_TECH_ID])).id,'offshore');

assert(TRADABLE_RESOURCES.includes('oil'));
assert.equal(tradeGood('oil').category,'bulk_fuel');
assert(tradeGood('oil').basePrice>0);

function region(overrides={}) { return {
  id:'r', name:'Test', population:100000, centroid:[0,55], stockpile:{oil:100}, marketDemand:{},
  wallet:800, foodSecurity:.7, stability:.6, housing:{capacity:70000}, labor:{unemploymentRate:.08},
  governance:{sovereignPolityId:'p'}, enterpriseExternalities:{}, deposits:{}, ...overrides,
}; }
const cold=region();
const before=cold.stockpile.oil;
const use=tickHouseholdEnergy(cold,7);
assert(use.oilConsumed>0 && cold.stockpile.oil<before,'households should physically consume oil');
assert(cold.householdEnergy.lightingService>0,'available oil should provide lighting service');
assert(cold.householdEnergy.heatingService>0,'cold regions should use oil for heating');
assert(cold.marketDemand.oil>=0,'household oil requirements should feed ordinary market demand');

const noOil=region({stockpile:{oil:0},deposits:{oil:{tiers:[{id:'seep',remainingStock:1000,requiredTechId:null}]}}});
tickHouseholdEnergy(noOil,7);
assert.equal(noOil.householdEnergy.lightingService,0,'an oil deposit alone must not provide civilian benefits');
assert(noOil.marketDemand.oil>0,'unsupplied households should demand tradable oil');

const warm=region({id:'warm',centroid:[0,5],stockpile:{oil:100}});
const coldDemand=civilianOilDemand(cold,365.2425);
const warmDemand=civilianOilDemand(warm,365.2425);
assert(coldDemand.heatingNeed>warmDemand.heatingNeed,'cold climates should create more heating demand');

// Compare delivered services against an otherwise identical unsupplied region.
const supplied=region({id:'supplied',householdEnergy:{lightingService:1,heatingService:1,coldNeed:.9}});
const unsupplied=region({id:'unsupplied',householdEnergy:{lightingService:0,heatingService:0,coldNeed:.9}});
const polity={id:'p',continuity:{legitimacy:.5},institutions:{}};
const suppliedW=assessPopularWellbeing(supplied,polity);
const unsuppliedW=assessPopularWellbeing(unsupplied,polity);
assert(suppliedW.prosperity>unsuppliedW.prosperity);
assert(suppliedW.safety>unsuppliedW.safety);
assert(suppliedW.culturalAccess>unsuppliedW.culturalAccess);
const bounded=householdEnergyWellbeing(supplied);
assert(bounded.prosperity<.1 && bounded.safety<.1 && bounded.culturalAccess<.1,'oil services should be useful but not dominate wellbeing');

const techRegion=region({id:'tech',isCoastal:true,deposits:{oil:{tiers}},unlockedTechIds:new Set(),learningByDoing:{mining:500000,smithing:400000},corporateCapital:{financialDepth:.7},protoIndustry:{industrialCapacity:.7},administration:{recordKeeping:.8,accounting:.8}});
const chances=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(chances.shallow>0,'oil-bearing regions with mining practice should be able to discover shallow drilling');
assert.equal(chances.deep,0,'deep drilling requires shallow drilling first');
techRegion.unlockedTechIds.add(SHALLOW_OIL_DRILLING_TECH_ID);
assert(petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]])).deep>0);
techRegion.unlockedTechIds.add(DEEP_OIL_DRILLING_TECH_ID);
const advanced=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(advanced.fracking>0 && advanced.offshore>0,'deep drilling should open separate fracking and offshore breakthrough paths');

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(main.includes("tickHouseholdEnergy(region, time.elapsedDays)"));
const regionSource=fs.readFileSync(new URL('../js/world/region.js',import.meta.url),'utf8');
for(const id of ['seep','shallow_onshore','deep_onshore','tight','offshore']) assert(regionSource.includes(`id: '${id}'`));

console.log('oil resource, extraction, trade, civilian-energy and wellbeing regressions passed');
