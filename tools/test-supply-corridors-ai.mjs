import assert from 'node:assert/strict';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';
import { campaignSupplyCorridor, garrisonCapturedNode } from '../js/military/supplyCorridors.js';
import { chooseSupplyAwareCampaignDirective, desperateAttackProfile } from '../js/military/supplyAwareAi.js';

function region(id, actor) {
  return {
    id, name: id, population: 18000, stability: 0.62, isCoastal: true,
    governance: { sovereignPolityId: actor }, controllingActorId: actor,
    stockpile: { food: 5000 }, construction: { assets: [] },
    urbanisation: { urbanPopulation: 4200 }, settlements: [],
  };
}

const attacker = region('a', 'A');
attacker.militaryStrategy = { garrisonFloor: 0.65 };
const defender = region('b', 'B');
const control = ensureSubregionalControl(defender);
const port = control.places.find((n) => n.kind === 'port');
const principal = control.places.find((n) => ['city','town','principal_settlement'].includes(n.kind));
const rural = control.places.find((n) => n.kind === 'village_district');
assert.ok(port && principal && rural);

// Simulate a landed army that has taken the port and advanced to a rural node.
port.controllerActorId = 'A'; port.occupationMode = 'military'; port.garrisonActorId = 'A'; port.garrisonPersonnel = 200;
rural.controllerActorId = 'A'; rural.occupationMode = 'military';
const campaign = {
  id: 1, viaSea: true, occupationActorId: 'A', personnel: 1000, initialPersonnel: 1000,
  subregional: { currentNodeId: rural.id, objectivePolicy: 'balanced', targetNodeId: null, route: [], routeIndex: 0, edgeProgress: 0 },
  logisticsState: { status: 'supplied', weeklyRequirement: 100, carriedFood: 500, routeReliability: 0.9 },
};

let corridor = campaignSupplyCorridor(campaign, defender);
assert.equal(corridor.open, false, 'enemy-held intermediate node should cut the inland corridor');
assert.equal(corridor.brokenNodeId, principal.id);

// Capture and garrison the intermediate node: the corridor should become reliable.
principal.controllerActorId = 'A'; principal.occupationMode = 'military';
const beforePersonnel = campaign.personnel;
const garrison = garrisonCapturedNode(campaign, attacker, defender, principal, 10);
assert.ok(garrison.assigned > 0, 'planner should leave a garrison at a captured supply node');
assert.ok(campaign.personnel < beforePersonnel, 'garrison personnel must come out of the field army');
corridor = campaignSupplyCorridor(campaign, defender);
assert.ok(corridor.reliability >= 0.7, 'properly garrisoned corridor should remain usable');

// Losing the node behind the army should make a well-fed AI turn back to secure the route.
principal.controllerActorId = 'B'; principal.garrisonActorId = null; principal.garrisonPersonnel = 0;
campaign.logisticsState.status = 'supplied'; campaign.logisticsState.carriedFood = 500;
let decision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);
assert.equal(decision.directive, 'secure_corridor');
assert.equal(campaign.subregional.targetNodeId, principal.id);
assert.ok(decision.riskTolerance < 0.5, 'well-fed army should remain comparatively cautious');

// A severe shortage accepts more risk to break back to supply.
campaign.logisticsState.status = 'severe_shortage'; campaign.logisticsState.carriedFood = 45;
decision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);
assert.equal(decision.directive, 'breakout');
assert.ok(decision.riskTolerance >= 0.75);

// Starvation can justify a deliberately bloodier desperate assault.
campaign.logisticsState.status = 'starving'; campaign.logisticsState.carriedFood = 5;
decision = chooseSupplyAwareCampaignDirective(campaign, attacker, defender);
assert.equal(decision.directive, 'desperate_assault');
const desperate = desperateAttackProfile(campaign);
assert.ok(desperate.pressureMultiplier > 1);
assert.ok(desperate.casualtyMultiplier > 1);

// Restoring supply removes the desperate combat profile.
campaign.logisticsState.status = 'supplied';
assert.deepEqual(desperateAttackProfile(campaign), { pressureMultiplier: 1, casualtyMultiplier: 1 });

console.log('supply corridor and supply-aware AI regressions passed');
