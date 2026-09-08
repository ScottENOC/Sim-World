import assert from 'node:assert/strict';
import { initialiseExpeditionaryLogistics, tickExpeditionaryLogistics } from '../js/military/expeditionaryLogistics.js';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';
import { FLEET_MISSIONS } from '../js/military/fleets.js';

function region(id, actor, coastal = true) {
  return {
    id, name: id, population: 12000, stability: 0.7, isCoastal: coastal,
    adjacentSeaIds: coastal ? ['sea-1'] : [],
    governance: { sovereignPolityId: actor }, controllingActorId: actor,
    stockpile: { food: 5000 }, construction: { assets: [] },
    urbanisation: { urbanPopulation: 2500 }, settlements: [],
  };
}

const attacker = region('a', 'A');
const defender = region('b', 'B');
const campaign = { id: 1, viaSea: true, personnel: 1000, occupationActorId: 'A', subregional: {} };
const fleet = { id: 'fleet-a', ownerActorId: 'A', ownerRegionId: 'a', homePortRegionId: 'a', locationType: 'sea', seaRegionId: 'sea-1', mission: FLEET_MISSIONS.ESCORT, ships: [{ condition: 1 }, { condition: 1 }, { condition: 1 }] };

ensureSubregionalControl(defender);
initialiseExpeditionaryLogistics(campaign, attacker, defender, [fleet], 0);
assert.equal(campaign.logisticsState.isIsolated, false);
const startFood = campaign.logisticsState.carriedFood;
let result = tickExpeditionaryLogistics(campaign, attacker, defender, [fleet], 1);
assert.ok(result.delivered > 0, 'open maritime route should deliver supplies');
assert.ok(result.state.routeReliability > 0.5, 'escorted route should be reasonably reliable');

// Destroying the supporting fleet cuts deliveries but carried stores prevent an instant collapse.
fleet.ships = [];
result = tickExpeditionaryLogistics(campaign, attacker, defender, [fleet], 2);
assert.equal(result.delivered, 0);
assert.equal(result.state.isIsolated, true);
assert.ok(result.supplyFraction > 0.9, 'newly isolated army should initially live on carried stores');

for (let week = 3; week < 12; week++) result = tickExpeditionaryLogistics(campaign, attacker, defender, [fleet], week);
assert.ok(['rationing', 'severe_shortage', 'starving'].includes(result.state.status), 'prolonged isolation should exhaust stores');
assert.ok(result.combatMultiplier < 1);
assert.ok(result.movementMultiplier < 1);

// Capturing a port materially improves throughput compared with an open beach.
const attacker2 = region('c', 'C');
const defender2 = region('d', 'D');
const campaign2 = { id: 2, viaSea: true, personnel: 1000, occupationActorId: 'C', subregional: {} };
const fleet2 = { id: 'fleet-c', ownerActorId: 'C', ownerRegionId: 'c', homePortRegionId: 'c', locationType: 'sea', seaRegionId: 'sea-1', mission: FLEET_MISSIONS.ESCORT, ships: [{ condition: 1 }, { condition: 1 }] };
const control2 = ensureSubregionalControl(defender2);
initialiseExpeditionaryLogistics(campaign2, attacker2, defender2, [fleet2], 0);
let beach = tickExpeditionaryLogistics(campaign2, attacker2, defender2, [fleet2], 1);
const port = control2.places.find((p) => p.kind === 'port');
assert.ok(port, 'coastal region should have a port node');
port.controllerActorId = 'C';
attacker2.stockpile.food = 5000;
let harbour = tickExpeditionaryLogistics(campaign2, attacker2, defender2, [fleet2], 2);
assert.ok(harbour.state.deliveryCapacity > beach.state.deliveryCapacity, 'captured port should improve supply throughput');

// Enemy blockade/interception suppresses route reliability.
const enemyFleet = { id: 'fleet-d', ownerActorId: 'D', ownerRegionId: 'd', homePortRegionId: 'd', locationType: 'sea', seaRegionId: 'sea-1', mission: FLEET_MISSIONS.BLOCKADE, ships: Array.from({length: 8}, () => ({ condition: 1 })) };
attacker2.stockpile.food = 5000;
const contested = tickExpeditionaryLogistics(campaign2, attacker2, defender2, [fleet2, enemyFleet], 3);
assert.ok(contested.state.routeReliability < harbour.state.routeReliability, 'hostile blockade should reduce deliveries');

console.log('expeditionary logistics regressions passed');
