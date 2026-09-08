import assert from 'node:assert/strict';
import { ensureSubregionalControl } from '../js/military/subregionalControl.js';
import { ensureMovementGraph, initialiseCampaignMovement, routeBetween, setCampaignSubregionalObjective, tickCampaignMovement, attemptPhysicalOccupation, resolveCampaignNodeInteractions, raceStatus } from '../js/military/subregionalMovement.js';

function region(id, actor, coastal = true) {
  return {
    id, name: id, controllingActorId: actor, governance: { sovereignPolityId: actor },
    population: 26000, urbanisation: { urbanPopulation: 8000 }, isCoastal: coastal,
    stability: 0.7, conflictPressure: 0.3,
    settlements: { principalId: null, places: [] }, construction: { assets: [{ typeId: 'hill_fort', condition: 1 }] },
  };
}

const kent = region('kent', 'kentish', true);
const control = ensureSubregionalControl(kent);
const graph = ensureMovementGraph(kent);
assert.equal(graph.nodeIds.length, control.places.length);
const port = control.places.find(p => p.kind === 'port');
const city = control.places.find(p => p.kind === 'city');
assert.ok(port && city);
const path = routeBetween(kent, port.id, city.id);
assert.deepEqual(path.nodeIds[0], port.id);
assert.deepEqual(path.nodeIds.at(-1), city.id);

// Essex lands and explicitly races for the capital.
port.controllerActorId = 'essex'; port.occupationMode = 'military';
const essex = { id: 1, defenderId: 'kent', phase: 'engaged', completed: false, viaSea: true, occupationActorId: 'essex', subregional: { objectivePolicy: 'capital' } };
initialiseCampaignMovement(essex, kent, 10);
assert.equal(essex.subregional.currentNodeId, port.id);
setCampaignSubregionalObjective(essex, kent, 'capital');
let arrived = false;
for (let t = 11; t < 20 && !arrived; t++) arrived = tickCampaignMovement(essex, kent, t, 0.8).arrived;
assert.ok(arrived, 'army physically reaches its objective');
const capture = attemptPhysicalOccupation(essex, kent, 20, 0.8);
assert.ok(capture.captured);
assert.equal(city.controllerActorId, 'essex');

// A second army can pursue a different objective simultaneously.
const wessex = { id: 2, defenderId: 'kent', phase: 'engaged', completed: false, viaSea: false, occupationActorId: 'wessex', subregional: { objectivePolicy: 'forts' } };
initialiseCampaignMovement(wessex, kent, 10);
const status = raceStatus([essex, wessex], 'kent');
assert.equal(status.length, 2);
assert.notEqual(status[0].actorId, status[1].actorId);

// If hostile armies physically meet, they block rather than ghost through one another.
wessex.subregional.currentNodeId = essex.subregional.currentNodeId;
const war = { id: 'war-1', participants: [
  { actorId: 'essex', stances: { wessex: 'hostile' } },
  { actorId: 'wessex', stances: { essex: 'hostile' } },
] };
essex.warId = war.id; wessex.warId = war.id;
const interactions = resolveCampaignNodeInteractions([essex, wessex], [war], 'kent');
assert.ok(interactions.some(e => e.type === 'subregional_armies_confront'));
assert.equal(essex.subregional.blockedByCampaignId, wessex.id);
assert.equal(wessex.subregional.blockedByCampaignId, essex.id);

console.log('subregional movement regressions passed');
