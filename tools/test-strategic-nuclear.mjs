import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ensureStrategicNuclearState, setNuclearProgrammePolicy, tickStrategicNuclearFuelCycle,
  strategicNuclearElectricityDemand, strategicNuclearMaterialSummary, estimateForeignNuclearCapability,
  ISOTOPE_SEPARATION_TECH_ID, SPENT_FUEL_REPROCESSING_TECH_ID,
} from '../js/economy/strategicNuclear.js';
import { tickElectricity } from '../js/economy/electricity.js';
import { strategicNuclearBreakthroughChances } from '../js/technology/strategicNuclear.js';
import {
  NUCLEAR_PHYSICS_TECH_ID, URANIUM_FUEL_CYCLE_TECH_ID, NUCLEAR_POWER_TECH_ID,
  SPENT_FUEL_MANAGEMENT_TECH_ID,
} from '../js/economy/nuclearPower.js';
import { KnowledgeLedger } from '../js/core/knowledge.js';

function asset(typeId) { return { id:`a-${typeId}-${Math.random()}`, typeId, condition:1, scale:1 }; }
function region(overrides={}) {
  const r = {
    id:'r', name:'Strategic Nuclear Test', population:180000, isCoastal:true,
    stockpile:{uranium_ore:0,uranium_concentrate:500,reactor_fuel:120,spent_nuclear_fuel:60,copper:5000,coal:0,
      enriched_uranium_feed:0,strategic_uranium_material:0,separated_plutonium:0},
    construction:{projects:[],completed:{},assets:[],workersReserved:0},
    industrialSupply:{capability:{steelmaking:.9,precision_machining:.9,industrial_chemistry:.85,locomotive_engineering:.4,railway_engineering:.4}},
    structuralTransformation:{capability:{manufacture:.88,chemicals:.82}},
    massEducation:{literacy:.82}, governance:{administration:{recordKeeping:.85},administrativeControl:.85},
    electricity:{industrialService:.92,industrialCoverage:.92,householdService:.8,demand:8000}, corporateCapital:{firms:[]},
    unlockedTechIds:new Set(['advanced_factories','electrical_generation','local_electric_distribution','industrial_electrification',
      NUCLEAR_PHYSICS_TECH_ID,URANIUM_FUEL_CYCLE_TECH_ID,NUCLEAR_POWER_TECH_ID,SPENT_FUEL_MANAGEMENT_TECH_ID,
      ISOTOPE_SEPARATION_TECH_ID,SPENT_FUEL_REPROCESSING_TECH_ID]),
    knowledge:new KnowledgeLedger('r'),
    neighbors:[], tradePartnerIds:[],
    ...overrides,
  };
  return r;
}

const civilian=region({construction:{projects:[],completed:{uranium_enrichment_complex:1,nuclear_reprocessing_plant:1},assets:[asset('uranium_enrichment_complex'),asset('nuclear_reprocessing_plant')],workersReserved:0}});
ensureStrategicNuclearState(civilian);
setNuclearProgrammePolicy(civilian,{posture:'civilian',safeguards:1,secrecy:.05,declared:true});
const civBefore={conc:civilian.stockpile.uranium_concentrate,spent:civilian.stockpile.spent_nuclear_fuel};
const civ=tickStrategicNuclearFuelCycle(civilian,365.2425);
assert(civ.concentrateUsed>0 && civilian.stockpile.uranium_concentrate<civBefore.conc,'enrichment complex should consume uranium concentrate');
assert(civ.spentFuelUsed>0 && civilian.stockpile.spent_nuclear_fuel<civBefore.spent,'reprocessing should consume spent fuel');
assert(civilian.stockpile.reactor_fuel>120,'civilian isotope separation/reprocessing should recover useful reactor fuel');
assert.equal(civilian.stockpile.strategic_uranium_material,0,'civilian posture must not create strategic uranium material');
assert.equal(civilian.stockpile.separated_plutonium,0,'civilian posture must not accumulate separated strategic plutonium');
assert(strategicNuclearElectricityDemand(civilian,365.2425)>0,'advanced fuel-cycle facilities should be major electricity loads');

const strategic=region({id:'s',construction:{projects:[],completed:{uranium_enrichment_complex:1,nuclear_reprocessing_plant:1},assets:[asset('uranium_enrichment_complex'),asset('nuclear_reprocessing_plant')],workersReserved:0}});
setNuclearProgrammePolicy(strategic,{posture:'strategic',safeguards:.1,secrecy:.85,declared:false});
const strategicResult=tickStrategicNuclearFuelCycle(strategic,365.2425);
assert(strategicResult.strategicUraniumProduced>0,'deliberate strategic posture should be able to accumulate abstract strategic uranium material');
assert(strategicResult.separatedPlutoniumProduced>0,'deliberate strategic posture plus reprocessing should be able to accumulate abstract separated plutonium');
const summary=strategicNuclearMaterialSummary(strategic);
assert(summary.stockpile.strategicUraniumMaterial>0 && summary.stockpile.separatedPlutonium>0);
assert(summary.signals.footprint>0 && summary.signals.electricalAnomaly>0,'large strategic fuel-cycle activity should create observable signatures');

const powerRegion=region({id:'power',stockpile:{uranium_concentrate:500,reactor_fuel:150,spent_nuclear_fuel:20,copper:5000,coal:0,
  enriched_uranium_feed:0,strategic_uranium_material:0,separated_plutonium:0},
  construction:{projects:[],completed:{uranium_enrichment_complex:1,local_electric_grid:2},assets:[asset('uranium_enrichment_complex'),asset('local_electric_grid'),asset('local_electric_grid')],workersReserved:0}});
setNuclearProgrammePolicy(powerRegion,{posture:'hedge'});
const power=tickElectricity(powerRegion,365.2425);
assert(power.strategicNuclearDemand>0,'electricity dispatcher should include strategic fuel-cycle industrial demand');

const observer=region({id:'observer',name:'Observer',tradePartnerIds:['s'],recentTradePartners:new Map([['s',1]]),stockpile:{},construction:{projects:[],completed:{},assets:[],workersReserved:0}});
observer.knowledge.addObservation({subjectId:'s',topic:'economy',source:'diplomat',confidence:.9,specificity:.9,observedTick:1});
const estimate=estimateForeignNuclearCapability(observer,strategic);
assert(estimate.confidence>0.1,'foreign intelligence should form a non-zero estimate from observable industrial evidence');
assert.equal(estimate.exactStockpileKnown,false,'foreign intelligence must not receive omniscient exact strategic stockpiles');
const selfEstimate=estimateForeignNuclearCapability(strategic,strategic);
assert.equal(selfEstimate.exactStockpileKnown,true,'a state should know its own stockpile');

const pre=region({id:'pre',unlockedTechIds:new Set(['advanced_factories','electrical_generation','industrial_electrification'])});
let chances=strategicNuclearBreakthroughChances(pre,new Map([['pre',pre]]));
assert.equal(chances.isotopeSeparation,0,'isotope separation must require nuclear physics and uranium fuel-cycle knowledge');
pre.unlockedTechIds.add(NUCLEAR_PHYSICS_TECH_ID); pre.unlockedTechIds.add(URANIUM_FUEL_CYCLE_TECH_ID);
chances=strategicNuclearBreakthroughChances(pre,new Map([['pre',pre]]));
assert(chances.isotopeSeparation>0,'mature nuclear industry should be able to develop isotope separation');
assert.equal(chances.reprocessing,0,'reprocessing should require spent-fuel management knowledge');
pre.unlockedTechIds.add(SPENT_FUEL_MANAGEMENT_TECH_ID);
chances=strategicNuclearBreakthroughChances(pre,new Map([['pre',pre]]));
assert(chances.reprocessing>0,'spent-fuel experience and nuclear industry should open reprocessing');

const construction=fs.readFileSync(new URL('../js/economy/construction.js',import.meta.url),'utf8');
assert(construction.includes("id: 'uranium_enrichment_complex'"));
assert(construction.includes("id: 'nuclear_reprocessing_plant'"));
const breakthroughs=fs.readFileSync(new URL('../js/technology/breakthroughs.js',import.meta.url),'utf8');
assert(breakthroughs.includes('tickStrategicNuclearBreakthroughs'));

console.log('strategic nuclear fuel cycle, safeguards, electricity burden, material separation and intelligence regressions passed');
