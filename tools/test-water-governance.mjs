import assert from 'node:assert/strict';
import {
  allocateWaterByPolicy, ensureWaterGovernance, finaliseWaterGovernance,
  groundwaterPolicyMultiplier, setWaterGovernancePolicy, surfaceWithdrawalPolicyMultiplier,
  waterDemandCaps, waterEmigrationAnnualRate, waterMigrationPull,
} from '../js/world/waterGovernance.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';

function region({modern=true}={}){
  const tech=new Set(modern?['water_management','hydraulic_engineering','germ_theory','electrical_generation','industrial_electrification']:['water_management']);
  return {
    id:'r',population:500000,areaSqKm:2000,wallet:2500,stability:.62,foodSecurity:.7,
    unlockedTechIds:tech,construction:{assets:[]},governance:{administrativeControl:.75},
    waterResources:{stressIndex:.45,chronicStress:.35,groundwaterLevel:.45,householdSatisfaction:1,industrySatisfaction:1,irrigationSatisfaction:1},
    electricity:{industrialService:.85,householdService:.85},industrialPlants:{factoryCapacity:30},
    demographics:{children:100000,workingAge:320000,elderly:80000},army:{personnel:0},navy:{personnel:0},
    report:{},housing:{capacity:650000},labor:{unemploymentRate:.07},stockpile:{},
  };
}

const fair=region();ensureWaterGovernance(fair);setWaterGovernancePolicy(fair,{householdPriority:1,industryPriority:.25,restrictionSeverity:.25,environmentalFlowFloor:.2,groundwaterExtractionCap:.55},{playerIssued:true});
let alloc=allocateWaterByPolicy(fair,{households:1,agriculture:1,livestock:.2,industry:1,controlledEnvironment:.1},1.6,{});
assert.ok(alloc.households>alloc.industry,'household-priority policy should protect households before industry');
assert.equal(surfaceWithdrawalPolicyMultiplier(fair),.8,'environmental flow floor must leave river water unabstracted');
assert.equal(groundwaterPolicyMultiplier(fair),.55,'groundwater extraction cap must constrain pumping');
setWaterGovernancePolicy(fair,{groundwaterEmergencyBan:true},{playerIssued:true});assert.equal(groundwaterPolicyMultiplier(fair),0,'emergency groundwater ban should stop pumping');

const priced=region();setWaterGovernancePolicy(priced,{scarcityPricing:.8,restrictionSeverity:0},{playerIssued:true});
const pricedCaps=waterDemandCaps(priced,{households:1,agriculture:1,livestock:1,industry:1,controlledEnvironment:1});
assert.ok(pricedCaps.households<.9,'scarcity pricing must reduce physical household water demand');
assert.equal(pricedCaps.industry,1,'household scarcity pricing should not silently cut industrial demand');

const unfair=region();
unfair.construction.assets=[{typeId:'water_treatment_plant',condition:.15},{typeId:'water_pumping_station',condition:.12},{typeId:'bulk_water_pipeline',condition:.1}];
setWaterGovernancePolicy(unfair,{householdPriority:.12,industryPriority:1,restrictionSeverity:.7,scarcityPricing:.55},{playerIssued:true});unfair.waterResources.householdSatisfaction=.42;unfair.waterResources.industrySatisfaction=.94;unfair.waterResources.irrigationSatisfaction=.72;
for(let y=0;y<5;y++)finaliseWaterGovernance(unfair,365);
assert.ok(unfair.waterGovernance.allocationInequity>.25,'protecting industry while households are cut should register as inequitable');
assert.ok(unfair.waterGovernance.underinvestment>0,'damaged/missing modern water assets under chronic stress should register as underinvestment');
assert.ok(unfair.waterGovernance.avoidableHardship>unfair.waterGovernance.necessaryHardship,'avoidable policy/underinvestment hardship should dominate this scenario');
assert.ok(unfair.waterGovernance.grievance>.35,'prolonged avoidable restrictions should create strong grievance');
assert.ok(unfair.waterGovernance.revolutionaryPressure>0,'prolonged severe avoidable water hardship should contribute to revolutionary pressure');
assert.ok(waterMigrationPull(unfair)<.8,'water hardship should make a destination less attractive to immigrants');
assert.ok(waterEmigrationAnnualRate(unfair)>.01,'severe chronic water hardship should create actual emigration pressure');

const emergency=region();setWaterGovernancePolicy(emergency,{householdPriority:1,industryPriority:.2,restrictionSeverity:.5},{playerIssued:true});emergency.waterResources.stressIndex=.8;emergency.waterResources.chronicStress=.75;emergency.waterResources.householdSatisfaction=.55;emergency.waterResources.industrySatisfaction=.45;emergency.waterResources.irrigationSatisfaction=.4;
for(let y=0;y<3;y++)finaliseWaterGovernance(emergency,365);
assert.ok(emergency.waterGovernance.necessaryHardship>0,'real drought restrictions should still hurt households');
assert.ok(emergency.waterGovernance.grievance<unfair.waterGovernance.grievance,'shared emergency scarcity should create less political grievance than preferential household cuts');

const ancient=region({modern:false});ancient.waterResources.householdSatisfaction=.45;ancient.waterResources.industrySatisfaction=.45;for(let y=0;y<3;y++)finaliseWaterGovernance(ancient,365);
assert.equal(ancient.waterGovernance.underinvestment,0,'pre-modern regions must not be blamed for failing to build unavailable modern water infrastructure');

const poor=region();poor.wallet=5;poor.industrialPlants.factoryCapacity=1;poor.electricity.industrialService=.2;poor.governance.administrativeControl=.15;poor.waterResources.householdSatisfaction=.55;poor.construction.assets=[];finaliseWaterGovernance(poor,365);
const rich=region();rich.wallet=100000;rich.industrialPlants.factoryCapacity=80;rich.electricity.industrialService=.95;rich.governance.administrativeControl=.9;rich.waterResources.householdSatisfaction=.55;rich.construction.assets=[];finaliseWaterGovernance(rich,365);
assert.ok(rich.waterGovernance.underinvestment>poor.waterGovernance.underinvestment*1.5,'states with real fiscal/institutional capacity should bear more underinvestment blame than poor low-capacity states');

const polity={id:'p',continuity:{legitimacy:.42},institutions:{}};unfair.polityId='p';const unfairWellbeing=assessPopularWellbeing(unfair,polity);const baseline=region();baseline.polityId='p';const baseWellbeing=assessPopularWellbeing(baseline,polity);
assert.ok(unfairWellbeing.grievance>baseWellbeing.grievance,'water governance grievance must feed the existing popular-wellbeing system');
assert.ok(unfairWellbeing.revolutionaryPressure>baseWellbeing.revolutionaryPressure,'water grievance must reach the existing revolutionary-pressure system');

console.log('water governance regression passed');
