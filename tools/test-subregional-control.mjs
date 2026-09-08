import assert from 'node:assert/strict';
import { ensureSubregionalControl, establishCampaignFootprint, advanceCampaignControl, assignOccupationGarrison, releaseUnsupportedOccupation, occupationSummary, requiredGarrison } from '../js/military/subregionalControl.js';

function region(id, actor, coastal = true) {
  return {
    id, name: id, controllingActorId: actor, governance: { sovereignPolityId: actor },
    population: 24000, urbanisation: { urbanPopulation: 7200 }, isCoastal: coastal,
    stability: 0.65, conflictPressure: 0.2,
    settlements: { principalId: null, places: [] }, construction: { assets: [{ typeId: 'hill_fort', condition: 1 }] },
  };
}

const target = region('kent', 'kentish');
const control = ensureSubregionalControl(target);
assert.ok(control.places.some((p) => p.kind === 'city'));
assert.ok(control.places.some((p) => p.kind === 'port'));
assert.ok(control.places.some((p) => p.kind === 'fort'));
assert.ok(control.places.some((p) => p.kind === 'village_district'));

establishCampaignFootprint(target, 'essex', 10, { viaSea: true });
let summary = occupationSummary(target);
assert.ok(summary.byActor.essex.ruralShare > 0, 'sea landing establishes a beachhead rather than transferring sovereignty');
assert.equal(summary.sovereignActorId, 'kentish');

for (let i = 0; i < 8; i++) advanceCampaignControl(target, 'essex', 0.07, 0.25 + i * 0.09, 11 + i);
summary = occupationSummary(target);
assert.ok(summary.byActor.essex.places.length >= 2, 'successful campaign should capture discrete places');
assert.ok(summary.byActor.essex.ruralShare > 0.2, 'successful campaign expands rural control');
assert.equal(summary.sovereignActorId, 'kentish', 'military occupation does not itself transfer sovereignty');

establishCampaignFootprint(target, 'wessex', 20, { viaSea: false });
for (let i = 0; i < 4; i++) advanceCampaignControl(target, 'wessex', 0.055, 0.3 + i * 0.1, 21 + i);
summary = occupationSummary(target);
assert.ok(summary.byActor.wessex.ruralShare > 0, 'second invader can control countryside simultaneously');
assert.ok(summary.byActor.essex.ruralShare > 0, 'first invader keeps its own occupation while the second advances');
assert.ok(summary.contested, 'multi-party occupation marks region contested');
assert.equal(summary.sovereignActorId, 'kentish', 'defender can retain sovereignty even after losing all crude physical control');

const beforeRelease = summary.byActor.essex.places.length;
const released = releaseUnsupportedOccupation(target, 'essex', 30);
summary = occupationSummary(target);
assert.ok(released.reverted > 0);
assert.ok((summary.byActor.essex?.places.length || 0) < beforeRelease);

advanceCampaignControl(target, 'essex', 0.08, 0.8, 31);
const occupied = ensureSubregionalControl(target).places.filter((p) => p.controllerActorId === 'essex');
assert.ok(occupied.length > 0);
const budget = occupied.reduce((sum, node) => sum + requiredGarrison(target, node), 0);
assignOccupationGarrison(target, 'essex', budget, 32);
const supportedNode = ensureSubregionalControl(target).places.find((p) => p.controllerActorId === 'essex' && p.garrisonPersonnel >= requiredGarrison(target, p) * 0.55);
assert.ok(supportedNode, 'allocator should create at least one adequately supported occupation garrison');
releaseUnsupportedOccupation(target, 'essex', 33);
assert.equal(ensureSubregionalControl(target).places.find((p) => p.id === supportedNode.id).controllerActorId, 'essex', 'adequate garrison preserves local military control');

console.log('subregional control regressions passed');
