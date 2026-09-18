import assert from 'node:assert/strict';
import { AUTOMOBILE_TECH_ID, ASSEMBLY_LINE_TECH_ID, ADVANCED_FACTORY_TECH_ID, industrialProductionBreakthroughChances, industrialProductionMultipliers, tickIndustrialProduction } from '../js/technology/industrialProduction.js';
import { PETROLEUM_REFINING_TECH_ID } from '../js/technology/petroleum.js';

function region(id,techs=[]){return {id,name:id,neighbors:[],tradePartnerIds:new Set(),unlockedTechIds:new Set(techs),industrialSupply:{capability:{precision_machining:.8,locomotive_engineering:.7},exposure:{precision_machining:.6}},structuralTransformation:{capability:{manufacture:.8},scaleMultipliers:{manufacture:1.5}},electricity:{industrialCoverage:.7},corporateCapital:{financialDepth:.6},governance:{administrativeControl:.7}};}
const independent=region('independent',[PETROLEUM_REFINING_TECH_ID]);
const byId=new Map([[independent.id,independent]]);
const c=industrialProductionBreakthroughChances(independent,byId);
assert(c.automobile>0,'automobile should be possible with refining and machinery without assembly line');
assert(c.assembly>0,'assembly line should be possible independently of automobiles');
assert(!independent.unlockedTechIds.has(ASSEMBLY_LINE_TECH_ID));
assert(!independent.unlockedTechIds.has(AUTOMOBILE_TECH_ID));

const assemblyOnly=region('assembly',[ASSEMBLY_LINE_TECH_ID]);
const m1=industrialProductionMultipliers(assemblyOnly);
assert(m1.standardisedGoods>1.15,'assembly line should materially improve standardised production');
assert(!assemblyOnly.unlockedTechIds.has(AUTOMOBILE_TECH_ID),'assembly line must not imply automobiles');

const autoOnly=region('auto',[AUTOMOBILE_TECH_ID,PETROLEUM_REFINING_TECH_ID]);
assert(!autoOnly.unlockedTechIds.has(ASSEMBLY_LINE_TECH_ID),'automobiles must not imply assembly lines');
tickIndustrialProduction([autoOnly],365);
assert(autoOnly.industrialProduction.motorisationReadiness>0,'automobile knowledge should build motorisation readiness over time');

const advanced=region('advanced',[ADVANCED_FACTORY_TECH_ID,ASSEMBLY_LINE_TECH_ID]);
tickIndustrialProduction([advanced],365*5);
const m2=industrialProductionMultipliers(advanced);
assert(m2.machinery>m1.machinery,'advanced factories should improve machinery production beyond assembly alone');

console.log('industrial production regressions passed');
