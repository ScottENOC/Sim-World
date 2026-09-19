import assert from 'node:assert/strict';
import { tickHouseholdFoodSecurity, refrigeratedLandFoodTransportMultiplier } from '../js/economy/householdFoodSecurity.js';
import { horseTransportMultiplier } from '../js/economy/horses.js';
import { FOOD_CANNING_TECH_ID, MECHANICAL_REFRIGERATION_TECH_ID, CFC_REFRIGERATION_TECH_ID } from '../js/technology/foodPreservationEnvironmentalHealth.js';

function region(overrides={}) {
  return {
    id:'r1', name:'Test', population:10000, wallet:50, unlockedTechIds:new Set(),
    stockpile:{food:20000,diesel:100,horses:10}, marketDemand:{}, report:{},
    occupations:{trader:100}, horseEconomy:{transport:50},
    industrialSupply:{capability:{precision_machining:0.05}},
    structuralTransformation:{capability:{manufacture:0.05}},
    industrialPlants:{componentCapability:{engine:0.02}},
    electricity:{householdService:0,industrialService:0},
    environmentalHealth:{}, _foodNeeded:10000,
    ...overrides,
  };
}

const bronze = region();
const bronzeProfile = tickHouseholdFoodSecurity(bronze,7);
assert(bronzeProfile.targetReserveWeeks < 1.2, 'pre-industrial household target should remain measured in days, not months');
assert(bronzeProfile.refrigeratorUptake === 0, 'refrigerators must not appear without refrigeration technology');

const modern = region({
  wallet:5000,
  unlockedTechIds:new Set([FOOD_CANNING_TECH_ID,MECHANICAL_REFRIGERATION_TECH_ID,CFC_REFRIGERATION_TECH_ID,'petroleum_refining']),
  stockpile:{food:500000,diesel:50000,horses:10},
  industrialSupply:{capability:{precision_machining:0.95}},
  structuralTransformation:{capability:{manufacture:0.95}},
  industrialPlants:{componentCapability:{engine:0.95}},
  electricity:{householdService:0.98,industrialService:0.98},
});
for(let year=0;year<35;year++) tickHouseholdFoodSecurity(modern,365.2425);
const modernProfile = modern.report.householdFoodSecurity;
assert(modernProfile.refrigeratorUptake > 0.8, 'affluent electrified households should broadly adopt refrigerators');
assert(modernProfile.cannedPantryUptake > 0.8, 'affluent industrial households should broadly adopt canned pantry food');
assert(modernProfile.targetReserveWeeks > 4, 'mature modern households should be able to target more than a month of calories');
assert(modernProfile.reserveWeeks > 3, 'actual private food reserves should become substantial when food is available');
assert(modern.environmentalHealth.cfcUse > 0, 'mass household refrigeration should create CFC use before alternatives');
assert(modernProfile.refrigeratedRoadShare > 0.45, 'motorised cold-chain distribution should emerge in a mature industrial economy');
assert(refrigeratedLandFoodTransportMultiplier(modern) > 1.3, 'cold-chain road freight should increase usable food throughput');

const transportBefore = horseTransportMultiplier(region());
const transportAfter = horseTransportMultiplier(modern);
assert(transportAfter > transportBefore, 'motorised refrigerated distribution should raise overland freight capability');

const crisis = region({
  stockpile:{food:-5000,diesel:0,horses:0},
  householdFoodSecurity:{privateReserve:7000,targetReserveWeeks:0.45,reserveWeeks:0,refrigeratorUptake:0,cannedPantryUptake:0,refrigeratedRoadShare:0},
});
const crisisProfile = tickHouseholdFoodSecurity(crisis,7);
assert(crisis.stockpile.food >= -0.01, 'household reserves should cover a regional food shortfall before famine response');
assert(crisisProfile.released >= 4999, 'private reserves should be visibly drawn down during supply failure');
assert(crisis.householdFoodSecurity.privateReserve < 2500, 'released household food must leave the private reserve');

console.log('household food security regression passed');
