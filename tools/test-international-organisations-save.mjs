import assert from 'node:assert/strict';
import { createGameSnapshot, restoreGameSnapshot } from '../js/core/saveGame.js';
import { syncNextInternationalOrganisationIds } from '../js/diplomacy/internationalOrganisations.js';

function region() {
  return {
    id: 'r1', name: 'Test', feature: null, centroid: [0, 0], areaSqKm: 100, neighbors: [], terrain: 'plains',
    population: 1000, polityId: 'A', governance: { sovereignPolityId: 'A' },
    knowledge: { ownerId: 'r1', observations: [], knownSubjectIds: new Set(), directContactIds: new Set(), _observationByStream: new Map() },
  };
}
function clock() {
  return {
    tickIndex: 123, elapsedDays: 456, resolution: { id: 'week' }, speed: 1, _resumeSpeed: 1, _estimatedTickMs: 12,
    stop() {}, setResolution(id) { this.resolution = { id }; }, _applySpeed(speed) { this.speed = speed; },
  };
}
function fog() {
  return { devMode: false, setPlayerRegion(id) { this.playerRegionId = id; }, setDevMode(value) { this.devMode = value; } };
}

const organisations = [{
  id: 'intl-org-7', name: 'World Forum', active: true, level: 'assembly', memberPolityIds: ['A', 'B', 'C'],
  majorPowerIds: ['A'], charter: { universalMembership: true }, metrics: { legitimacy: .8, acceptance: .75 },
  motions: [{ id: 'motion-11', type: 'climate_action', status: 'passed', compliance: .7 }],
}];
const regions = [region()];
const snapshot = createGameSnapshot({
  regions, seaRegions: [], polities: [{ id: 'A' }], religiousWorld: {}, agreements: [], activeRaids: [], activeCampaigns: [],
  activeWars: [], fleets: [], internationalOrganisations: organisations, clock: clock(), playerRegionId: 'r1', playerPolityId: 'A', fogOfWar: fog(),
});
assert.equal(snapshot.internationalOrganisations.length, 1, 'international organisations should be written to the save');
assert.equal(snapshot.internationalOrganisations[0].motions[0].id, 'motion-11');

const restoredOrganisations = [];
const restoredRegions = [region()];
const restored = restoreGameSnapshot(snapshot, {
  regions: restoredRegions, seaRegions: [], polities: [], religiousWorld: {}, agreements: [], activeRaids: [], activeCampaigns: [],
  activeWars: [], fleets: [], internationalOrganisations: restoredOrganisations, clock: clock(), fogOfWar: fog(),
});
assert.equal(restored.internationalOrganisationsRestored, true);
assert.deepEqual(restoredOrganisations, organisations, 'organisation charter, membership and motion history should survive round trip');
const next = syncNextInternationalOrganisationIds(restoredOrganisations);
assert.equal(next.nextOrganisationId, 8, 'new organisations should continue after restored IDs');
assert.equal(next.nextMotionId, 12, 'new motions should continue after restored IDs');

const legacySnapshot = structuredClone(snapshot);
delete legacySnapshot.internationalOrganisations;
const legacyOrganisations = [{ id: 'stale-runtime-value' }];
const legacyResult = restoreGameSnapshot(legacySnapshot, {
  regions: [region()], seaRegions: [], polities: [], religiousWorld: {}, agreements: [], activeRaids: [], activeCampaigns: [],
  activeWars: [], fleets: [], internationalOrganisations: legacyOrganisations, clock: clock(), fogOfWar: fog(),
});
assert.equal(legacyResult.internationalOrganisationsRestored, false, 'older saves should be recognised as lacking organisation state');
assert.deepEqual(legacyOrganisations, [], 'older saves should restore safely with no international organisations');

console.log('international organisation save/load regression passed');
