import assert from 'node:assert/strict';
import { ensureOrganisationWorld, ORGANISATION_TYPES, tickNonStateOrganisations } from '../js/politics/nonStateOrganisations.js';

function region(id, overrides = {}) {
  return {
    id, name: id, population: 30000, stability: 0.4, isCoastal: true,
    treasury: 600,
    tradeEconomy: { weeklyImports: 900, weeklyExports: 900 },
    recentTradePartners: new Map(),
    urbanisation: { urbanPopulation: 12000 },
    army: { personnel: 2500 }, navy: { boats: 8 },
    governance: { sovereignPolityId: `p_${id}`, localPolityId: `p_${id}`, autonomy: 0.75, administrativeControl: 0.35 },
    medievalInstitutions: { localDefence: 0.7, eliteOrganisation: 0.7, fiscalCapacity: 0.7 },
    subregionalControl: { version: 1, places: [
      { id: `${id}:principal`, name: id, kind: 'city', population: 12000, strategicValue: 1, nativeControllerActorId: `p_${id}`, controllerActorId: `p_${id}`, occupationMode: 'sovereign', garrisonActorId: null, garrisonPersonnel: 0 },
      { id: `${id}:port`, name: `${id} port`, kind: 'port', population: 2000, strategicValue: 0.9, nativeControllerActorId: `p_${id}`, controllerActorId: `p_${id}`, occupationMode: 'sovereign', garrisonActorId: null, garrisonPersonnel: 0 },
    ], ruralControl: { [`p_${id}`]: 1 }, sovereignActorId: `p_${id}`, operationalControllerActorId: `p_${id}`, contested: false },
    technology: { known: new Set(['ocean_going_sailing','gunpowder']) },
    ...overrides,
  };
}

const regions = [region('A'), region('B'), region('C'), region('D')];
for (const a of regions) for (const b of regions) if (a !== b) a.recentTradePartners.set(b.id, 0);
const polities = regions.map((r) => ({ id: `p_${r.id}`, currency: { active: true }, administration: { legitimacy: 0.8, communications: 0.8, officialdom: 0.8, accounting: 0.8 } }));
const agreements = [];
for (let i = 0; i < polities.length; i++) for (let j = i + 1; j < polities.length; j++) agreements.push({ active: true, fromId: polities[i].id, toId: polities[j].id });
const world = {};
ensureOrganisationWorld(world);
const events = tickNonStateOrganisations(regions, polities, world, 10000, 365.2425, () => 0, { agreements, activeRaids: [{ attackerId: 'A', completed: false }] });
assert.ok(events.length > 0);
assert.ok(world.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.FREE_CITY));
assert.ok(world.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.MERCENARY_COMPANY));
assert.ok(world.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.MERCHANT_LEAGUE));
assert.ok(world.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.CHARTERED_COMPANY));
assert.ok(world.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.INTERSTATE_LEAGUE));
const freeCity = world.nonStateOrganisations.find((o) => o.type === ORGANISATION_TYPES.FREE_CITY && o.hostRegionIds.has('A'));
assert.ok(freeCity);
assert.ok(regions[0].subregionalControl.places.some((p) => p.controllerActorId === freeCity.actorId));

const medievalWorld = {};
const medievalRegion = region('M', { treasury: 80, technology: { known: new Set() } });
const medievalPolity = { id: 'p_M', currency: { active: false }, administration: { legitimacy: 0.4, communications: 0.25, officialdom: 0.2, accounting: 0.2 } };
tickNonStateOrganisations([medievalRegion], [medievalPolity], medievalWorld, 100, 365.2425, () => 0, { agreements: [], activeRaids: [] });
assert.equal(medievalWorld.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.CHARTERED_COMPANY), false);
assert.equal(medievalWorld.nonStateOrganisations.some((o) => o.type === ORGANISATION_TYPES.INTERSTATE_LEAGUE), false);
console.log('non-state organisation regression passed');
