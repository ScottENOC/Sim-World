import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectActiveTier } from '../js/world/resources/extraction.js';
import { tradeGood, TRADABLE_RESOURCES } from '../js/economy/tradeGoods.js';
import { civilianOilDemand, tickHouseholdEnergy, householdEnergyWellbeing } from '../js/economy/householdEnergy.js';
import { tickPetroleumRefining, refineryProductSlate } from '../js/economy/petroleumRefining.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';
import {
  SHALLOW_OIL_DRILLING_TECH_ID, DEEP_OIL_DRILLING_TECH_ID,
  HYDRAULIC_FRACTURING_TECH_ID, OFFSHORE_OIL_DRILLING_TECH_ID,
  PETROLEUM_REFINING_TECH_ID, PETROLEUM_CRACKING_TECH_ID,
  PETROLEUM_DESULFURISATION_TECH_ID, AVIATION_FRACTIONATION_TECH_ID,
  petroleumBreakthroughChances,
} from '../js/technology/petroleum.js';

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

for (const good of ['oil','lamp_fuel','petrol','diesel','heavy_fuel_oil','aviation_fuel']) {
  assert(TRADABLE_RESOURCES.includes(good),`${good} should use ordinary merchant trade`);
  assert(tradeGood(good)?.basePrice>0);
}
assert.equal(tradeGood('oil').category,'bulk_fuel');
assert.equal(tradeGood('diesel').category,'refined_fuel');

function region(overrides={}) { return {
  id:'r', name:'Test', population:100000, centroid:[0,55], stockpile:{oil:100}, marketDemand:{},
  wallet:800, foodSecurity:.7, stability:.6, housing:{capacity:70000}, labor:{unemploymentRate:.08}, raidPressure:.18,
  governance:{sovereignPolityId:'p'}, enterpriseExternalities:{}, deposits:{}, unlockedTechIds:new Set(),
  construction:{projects:[],completed:{},assets:[],workersReserved:0,lastWeek:null}, ...overrides,
}; }

// Households can use a little unrefined seep petroleum, but refined lamp fuel is
// the normal mature fuel and unmet demand appears in the ordinary market.
const cold=region();
const before=cold.stockpile.oil;
const use=tickHouseholdEnergy(cold,7);
assert(use.crudeConsumed>0 && cold.stockpile.oil<before,'primitive households should be able to use a limited amount of raw petroleum');
assert(use.crudeConsumed < civilianOilDemand(cold,7).total * .2,'raw crude must not become a universal household fuel');
assert(cold.householdEnergy.lightingService>0);
assert(cold.householdEnergy.heatingService>0);
assert(cold.marketDemand.lamp_fuel>0,'mature unmet household demand should target refined lamp/heating fuel');

const refined=region({id:'refined',stockpile:{oil:100,lamp_fuel:100}});
const refinedUse=tickHouseholdEnergy(refined,7);
assert(refinedUse.refinedFuelConsumed>0);
assert.equal(refinedUse.crudeConsumed,0,'available refined fuel should displace crude household burning');

const noOil=region({stockpile:{oil:0},deposits:{oil:{tiers:[{id:'seep',remainingStock:1000,requiredTechId:null}]}}});
tickHouseholdEnergy(noOil,7);
assert.equal(noOil.householdEnergy.lightingService,0,'an oil deposit alone must not provide civilian benefits');
assert(noOil.marketDemand.lamp_fuel>0);

const warm=region({id:'warm',centroid:[0,5],stockpile:{oil:100}});
assert(civilianOilDemand(cold,365.2425).heatingNeed>civilianOilDemand(warm,365.2425).heatingNeed);

const supplied=region({id:'supplied',householdEnergy:{lightingService:1,heatingService:1,coldNeed:.9}});
const unsupplied=region({id:'unsupplied',householdEnergy:{lightingService:0,heatingService:0,coldNeed:.9}});
const polity={id:'p',continuity:{legitimacy:.5},institutions:{}};
const suppliedW=assessPopularWellbeing(supplied,polity);
const unsuppliedW=assessPopularWellbeing(unsupplied,polity);
assert(suppliedW.prosperity>unsuppliedW.prosperity);
assert(suppliedW.safety>unsuppliedW.safety);
assert(suppliedW.culturalAccess>unsuppliedW.culturalAccess);
const bounded=householdEnergyWellbeing(supplied);
assert(bounded.prosperity<.1 && bounded.safety<.1 && bounded.culturalAccess<.1);

// Refining needs both the knowledge and a physical refinery. A refinery can be
// built in an oil-importing region; local geology is deliberately irrelevant.
const noRefinery=region({id:'no-refinery',stockpile:{oil:1000},unlockedTechIds:new Set([PETROLEUM_REFINING_TECH_ID])});
assert.equal(tickPetroleumRefining(noRefinery,365.2425).throughput,0);
const refineryRegion=region({
  id:'refinery', stockpile:{oil:1000},
  unlockedTechIds:new Set([PETROLEUM_REFINING_TECH_ID]),
  construction:{projects:[],completed:{petroleum_refinery:1},assets:[{id:'ref-1',typeId:'petroleum_refinery',condition:1,scale:1}],workersReserved:0,lastWeek:null},
  petroleum:{crudeQuality:{gravity:'heavy',sulfur:'sour',lightFraction:.38,sulfurFraction:.035}},
});
const simpleSlate=refineryProductSlate(refineryRegion);
const refinedOutput=tickPetroleumRefining(refineryRegion,365.2425);
assert(refinedOutput.throughput>0 && refinedOutput.products.lamp_fuel>0 && refinedOutput.products.heavy_fuel_oil>0);
assert(refineryRegion.stockpile.oil<1000);

refineryRegion.unlockedTechIds.add(PETROLEUM_CRACKING_TECH_ID);
const crackedSlate=refineryProductSlate(refineryRegion);
assert(crackedSlate.petrol+crackedSlate.diesel > simpleSlate.petrol+simpleSlate.diesel,'cracking should shift heavy fractions into lighter transport fuels');
assert(crackedSlate.heavy_fuel_oil<simpleSlate.heavy_fuel_oil);
const sourBefore=Object.values(crackedSlate).reduce((a,b)=>a+b,0);
refineryRegion.unlockedTechIds.add(PETROLEUM_DESULFURISATION_TECH_ID);
const sweetenedSlate=refineryProductSlate(refineryRegion);
assert(Object.values(sweetenedSlate).reduce((a,b)=>a+b,0)>sourBefore,'desulfurisation should reduce sour-crude processing losses');
refineryRegion.unlockedTechIds.add(AVIATION_FRACTIONATION_TECH_ID);
assert(refineryProductSlate(refineryRegion).aviation_fuel>0,'aviation fractionation should create a dedicated aviation cut');

const techRegion=region({id:'tech',isCoastal:true,deposits:{oil:{tiers}},unlockedTechIds:new Set(),experience:{mining:500000,smithing:400000},corporateCapital:{financialDepth:.7},protoIndustry:{industrialCapacity:.7},administration:{recordKeeping:.8,accounting:.8}});
const chances=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(chances.shallow>0);
assert.equal(chances.deep,0);
assert.equal(chances.refining,0,'refining follows practical well-drilling knowledge');
techRegion.unlockedTechIds.add(SHALLOW_OIL_DRILLING_TECH_ID);
const afterShallow=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(afterShallow.deep>0 && afterShallow.refining>0);
techRegion.unlockedTechIds.add(DEEP_OIL_DRILLING_TECH_ID);
const advanced=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(advanced.fracking>0 && advanced.offshore>0);
techRegion.unlockedTechIds.add(PETROLEUM_REFINING_TECH_ID);
const refineryAdvances=petroleumBreakthroughChances(techRegion,new Map([['tech',techRegion]]));
assert(refineryAdvances.cracking>0 && refineryAdvances.desulfurisation>0);

const main=fs.readFileSync(new URL('../js/main.js',import.meta.url),'utf8');
assert(main.includes("tickPetroleumRefining(region, time.elapsedDays)"));
assert(main.indexOf('tickPetroleumRefining(region, time.elapsedDays)') < main.indexOf('tickHouseholdEnergy(region, time.elapsedDays)'));
const regionSource=fs.readFileSync(new URL('../js/world/region.js',import.meta.url),'utf8');
for(const id of ['seep','shallow_onshore','deep_onshore','tight','offshore']) assert(regionSource.includes(`id: '${id}'`));
const constructionSource=fs.readFileSync(new URL('../js/economy/construction.js',import.meta.url),'utf8');
assert(constructionSource.includes("id: 'petroleum_refinery'"));

console.log('oil extraction, refinery, refined-fuel trade and civilian-energy regressions passed');
