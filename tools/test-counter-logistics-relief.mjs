import assert from 'node:assert/strict';
import { ensureSubregionalControl, requiredGarrison } from '../js/military/subregionalControl.js';
import { chooseDefensiveCounterLogistics, counterLogisticsCombatProfile } from '../js/military/counterLogisticsAi.js';
import { coordinateExpeditionRelief } from '../js/military/expeditionReliefAi.js';
import { FLEET_MISSIONS } from '../js/military/fleets.js';

function region(id, actor) {
  return {
    id, name: id, population: 18000, stability: 0.62, isCoastal: true,
    adjacentSeaIds: ['sea-1'], neighbors: [],
    governance: { sovereignPolityId: actor }, controllingActorId: actor,
    stockpile: { food: 5000 }, construction: { assets: [] },
    urbanisation: { urbanPopulation: 4200 }, settlements: [],
    army: { personnel: 650, away: 0 }, navy: { personnel: 0, boats: 0, advancedBoats: 0 },
  };
}

const attacker = region('a', 'A');
const defender = region('b', 'B');
const control = ensureSubregionalControl(defender);
const port = control.places.find((n) => n.kind === 'port');
const principal = control.places.find((n) => ['city','town','principal_settlement'].includes(n.kind));
const rural = control.places.find((n) => n.kind === 'village_district');
assert.ok(port && principal && rural);

port.controllerActorId = 'A'; port.occupationMode = 'military'; port.garrisonActorId = 'A'; port.garrisonPersonnel = 180;
principal.controllerActorId = 'A'; principal.occupationMode = 'military'; principal.garrisonActorId = 'A'; principal.garrisonPersonnel = Math.max(1, Math.floor(requiredGarrison(defender, principal) * 0.1));
rural.controllerActorId = 'A'; rural.occupationMode = 'military';
const campaign = {
  id: 7, viaSea: true, occupationActorId: 'A', attackerId: 'a', defenderId: 'b',
  personnel: 900, initialPersonnel: 900, pressure: 0.48, attackerMorale: 0.7, supply: 0.5,
  subregional: { currentNodeId: rural.id, objectivePolicy: 'balanced', targetNodeId: null, route: [], routeIndex: 0, edgeProgress: 0 },
  logisticsState: { status: 'severe_shortage', weeklyRequirement: 100, carriedFood: 60, routeReliability: 0.45, routeSeaIds: ['sea-1'], supportFleetIds: [] },
};

// A defender should attack a weak link behind an expedition rather than the field army itself.
let result = chooseDefensiveCounterLogistics(campaign, attacker, defender, 20, () => 0);
assert.equal(result.directive, 'cut_corridor');
assert.equal(result.success, true);
assert.equal(principal.controllerActorId, 'B');

// A starving enemy encourages containment rather than gifting it a decisive battle.
campaign.logisticsState.status = 'starving';
campaign.subregional.currentNodeId = rural.id;
result = chooseDefensiveCounterLogistics(campaign, attacker, defender, 21, () => 1);
assert.equal(campaign.defenderAvoidBattle, true);
const defensive = counterLogisticsCombatProfile(campaign);
assert.ok(defensive.intensityMultiplier < 1);
assert.ok(defensive.attackerPressureMultiplier < 1);

// If no weak corridor target exists but the invader is foraging, defenders harass dispersed parties.
principal.controllerActorId = 'B';
port.controllerActorId = 'B';
campaign.logisticsState.localForagingCapacity = 35;
campaign.logisticsState.status = 'rationing';
result = chooseDefensiveCounterLogistics(campaign, attacker, defender, 22, () => 1);
assert.equal(result.directive, 'harass_foragers');
assert.ok(counterLogisticsCombatProfile(campaign).extraAttackerAttritionRate > 0);

// The attacker state should dispatch a real persistent fleet toward the threatened route.
const fleet = {
  id: 'fleet-a', ownerActorId: 'A', ownerRegionId: 'a', homePortRegionId: 'a',
  locationType: 'port', portRegionId: 'a', seaRegionId: null,
  mission: FLEET_MISSIONS.PORT, missionTargetId: null,
  ships: [{ condition: 1 }, { condition: 1 }, { condition: 1 }], supply: 1, fatigue: 0, morale: 1, condition: 1,
};
campaign.logisticsState.status = 'severe_shortage';
campaign.logisticsState.carriedFood = 80;
campaign.logisticsState.routeReliability = 0.2;
campaign.logisticsState.supportFleetIds = [];
const relief = coordinateExpeditionRelief(campaign, attacker, defender, [fleet], new Map([['a', attacker], ['b', defender]]), new Map([['sea-1', { id: 'sea-1' }]]), 23);
assert.ok(['urgent_relief', 'reinforce_supply_route'].includes(relief.directive));
assert.equal(fleet.mission, FLEET_MISSIONS.ESCORT);
assert.ok(campaign.logisticsState.supportFleetIds.includes(fleet.id));

// With no fleet available and collapse imminent, the state should recommend evacuation.
campaign.logisticsState.status = 'starving';
campaign.logisticsState.carriedFood = 20;
campaign.logisticsState.routeReliability = 0.05;
const evacuation = coordinateExpeditionRelief(campaign, attacker, defender, [], new Map([['a', attacker], ['b', defender]]), new Map([['sea-1', { id: 'sea-1' }]]), 24);
assert.equal(evacuation.directive, 'evacuate_if_possible');

console.log('counter-logistics and relief regressions passed');
