import assert from 'node:assert/strict';
import { ORGANISATION_TYPES } from '../js/politics/nonStateOrganisations.js';
import {
  dismissMercenaryCompany,
  grantCompanyCharter,
  hireMercenaryCompany,
  joinOrganisation,
  leaveOrganisation,
  recogniseFreeCity,
  suppressPirateHaven,
  tickOrganisationInteractions,
  toleratePirateHaven,
  votePooledAuthority,
} from '../js/politics/nonStateInteractions.js';

const polity = (id, capitalRegionId) => ({ id, capitalRegionId, administration: { legitimacy: 0.8, communications: 0.8, officialdom: 0.8 } });
const region = (id, sovereign, treasury = 500) => ({
  id, name: id, polityId: sovereign, controllingActorId: sovereign, population: 10000, treasury, wallet: 0, stability: 0.6,
  governance: { sovereignPolityId: sovereign, autonomy: 0.5, administrativeControl: 0.6 },
  army: { personnel: 1200, away: 0 }, navy: { personnel: 200, boats: 8 },
  settlements: { principalId: `${id}:principal`, places: [{ id: `${id}:principal`, name: id, kind: 'principal', population: 5000 }] },
});

const polities = [polity('p1', 'r1'), polity('p2', 'r2'), polity('p3', 'r3')];
const regions = [region('r1', 'p1'), region('r2', 'p2'), region('r3', 'p3')];
const makeOrg = (id, type, extra = {}) => ({
  id, actorId: `org:${id}`, type, name: id, foundedTick: 0, active: true, treasury: 100, influence: 0.2, autonomy: 0.7,
  authority: 0.2, militaryCapacity: 500, commercialCapacity: 0.6, territorialShare: 0.05,
  memberRegionIds: new Set(), memberPolityIds: new Set(), hostRegionIds: new Set(), pooledSovereignty: 0.1, notes: {}, ...extra,
});
const merc = makeOrg('merc', ORGANISATION_TYPES.MERCENARY_COMPANY, { hostRegionIds: new Set(['r1']) });
const pirate = makeOrg('pirate', ORGANISATION_TYPES.PIRATE_HAVEN, { hostRegionIds: new Set(['r1']), militaryCapacity: 200 });
const free = makeOrg('free', ORGANISATION_TYPES.FREE_CITY, { hostRegionIds: new Set(['r1']), memberPolityIds: new Set(['p1']) });
const company = makeOrg('company', ORGANISATION_TYPES.CHARTERED_COMPANY, { hostRegionIds: new Set(['r1']) });
const merchantLeague = makeOrg('merchants', ORGANISATION_TYPES.MERCHANT_LEAGUE, { memberPolityIds: new Set(['p2']) });
const stateLeague = makeOrg('league', ORGANISATION_TYPES.INTERSTATE_LEAGUE, { memberPolityIds: new Set(['p1','p2','p3']), authority: 0.4 });
const world = { nonStateOrganisations: [merc, pirate, free, company, merchantLeague, stateLeague], nextOrganisationId: 10 };

let result = hireMercenaryCompany(world, merc.id, 'p1', 'r1', regions, polities, 250, 100);
assert.equal(result.changed, true);
assert.equal(merc.mercenaryContracts[0].active, true);
tickOrganisationInteractions(regions, polities, world, 30);
assert.ok(regions[0].nonStateSupport.mercenaryPersonnel > 0);
assert.ok(merc.treasury > 100);
result = dismissMercenaryCompany(world, merc.id, 'p1', regions);
assert.equal(result.changed, true);
assert.equal(regions[0].nonStateSupport.mercenaryPersonnel, 0);

result = recogniseFreeCity(world, free.id, 'p1', polities);
assert.equal(result.changed, true);
assert.equal(free.recognisedByPolityIds.has('p1'), true);

result = toleratePirateHaven(world, pirate.id, 'p1', polities);
assert.equal(result.changed, true);
assert.equal(pirate.toleratedByPolityIds.has('p1'), true);
result = suppressPirateHaven(world, pirate.id, 'p1', regions, polities);
assert.equal(result.changed, true);
assert.equal(result.suppressed, true);
assert.equal(pirate.active, false);

result = grantCompanyCharter(world, company.id, 'p1', regions, polities);
assert.equal(result.changed, true);
assert.equal(company.charteringPolityId, 'p1');
assert.equal(company.charterPrivileges.p1.tradeMonopoly, true);

result = joinOrganisation(world, merchantLeague.id, 'p1', polities);
assert.equal(result.changed, true);
assert.equal(merchantLeague.memberPolityIds.has('p1'), true);
result = leaveOrganisation(world, merchantLeague.id, 'p1');
assert.equal(result.changed, true);
assert.equal(merchantLeague.memberPolityIds.has('p1'), false);

const beforePooling = stateLeague.pooledSovereignty;
result = votePooledAuthority(world, stateLeague.id, 'p1', true, polities, () => 0);
assert.equal(result.changed, true);
assert.equal(result.passed, true);
assert.ok(stateLeague.pooledSovereignty > beforePooling);

console.log('non-state interaction regressions passed');
