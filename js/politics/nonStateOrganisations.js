import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260912-medieval-politics1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const chanceForDays = (annualChance, elapsedDays) => 1 - Math.pow(1 - clamp(annualChance), Math.max(0, elapsedDays) / DAYS_PER_YEAR);

export const ORGANISATION_TYPES = Object.freeze({
  FREE_CITY: 'free_city',
  PIRATE_HAVEN: 'pirate_haven',
  MERCENARY_COMPANY: 'mercenary_company',
  PRIVATE_MILITARY_COMPANY: 'private_military_company',
  MERCHANT_LEAGUE: 'merchant_league',
  CHARTERED_COMPANY: 'chartered_company',
  INTERSTATE_LEAGUE: 'interstate_league',
  SUPRANATIONAL_UNION: 'supranational_union',
});

function ensureSet(value) {
  if (value instanceof Set) return value;
  return new Set(Array.isArray(value) ? value : []);
}

export function ensureOrganisationWorld(world) {
  if (!world.nonStateOrganisations) world.nonStateOrganisations = [];
  if (!Number.isFinite(world.nextOrganisationId)) world.nextOrganisationId = 1;
  for (const organisation of world.nonStateOrganisations) {
    organisation.memberRegionIds = ensureSet(organisation.memberRegionIds);
    organisation.memberPolityIds = ensureSet(organisation.memberPolityIds);
    organisation.hostRegionIds = ensureSet(organisation.hostRegionIds);
    organisation.treasury = Math.max(0, Number(organisation.treasury) || 0);
    organisation.influence = Math.max(0, Number(organisation.influence) || 0);
    organisation.autonomy = clamp(organisation.autonomy || 0);
    organisation.authority = clamp(organisation.authority || 0);
    organisation.active = organisation.active !== false;
  }
  return world;
}

function administration(region, politiesById) {
  return politiesById.get(region.governance?.sovereignPolityId || region.polityId)?.administration || null;
}

function commerce(region) {
  const imports = Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const exports = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0);
  const partners = region.recentTradePartners instanceof Map ? region.recentTradePartners.size : 0;
  const urban = Math.max(0, Number(region.urbanisation?.urbanPopulation) || 0);
  return clamp(Math.log1p(imports + exports) / 8 + Math.log1p(partners) / 12 + Math.log1p(urban) / 35);
}

function localPower(region) {
  const medieval = region.medievalInstitutions || {};
  const army = Math.max(0, Number(region.army?.personnel) || 0);
  const population = Math.max(1, Number(region.population) || 1);
  const armyShare = clamp(army / Math.max(500, population * 0.08));
  return clamp(
    (Number(medieval.localDefence) || 0) * 0.28 +
    (Number(medieval.eliteOrganisation) || 0) * 0.26 +
    (Number(medieval.fiscalCapacity) || 0) * 0.20 +
    armyShare * 0.26,
  );
}

function hasBreakthrough(region, id) {
  return Boolean(
    region.breakthroughs?.has?.(id) ||
    region.technology?.breakthroughs?.has?.(id) ||
    region.technology?.known?.has?.(id) ||
    region.technology?.[id] ||
    region[id],
  );
}

function createOrganisation(world, type, name, currentTick, options = {}) {
  ensureOrganisationWorld(world);
  const id = `organisation_${world.nextOrganisationId++}`;
  const organisation = {
    id,
    actorId: `org:${id}`,
    type,
    name,
    foundedTick: currentTick,
    active: true,
    treasury: Math.max(0, Number(options.treasury) || 0),
    influence: Math.max(0, Number(options.influence) || 0.05),
    autonomy: clamp(options.autonomy || 0),
    authority: clamp(options.authority || 0),
    militaryCapacity: Math.max(0, Number(options.militaryCapacity) || 0),
    commercialCapacity: clamp(options.commercialCapacity || 0),
    territorialShare: clamp(options.territorialShare || 0),
    memberRegionIds: ensureSet(options.memberRegionIds),
    memberPolityIds: ensureSet(options.memberPolityIds),
    hostRegionIds: ensureSet(options.hostRegionIds),
    charteringPolityId: options.charteringPolityId || null,
    parentOrganisationId: options.parentOrganisationId || null,
    pooledSovereignty: clamp(options.pooledSovereignty || 0),
    notes: options.notes || {},
  };
  world.nonStateOrganisations.push(organisation);
  return organisation;
}

function existingOrganisation(world, type, predicate) {
  return world.nonStateOrganisations.find((organisation) => organisation.active && organisation.type === type && predicate(organisation));
}

function controlPlace(region, organisation, preferredKinds = []) {
  const control = ensureSubregionalControl(region);
  let place = preferredKinds.map((kind) => control.places.find((candidate) => candidate.kind === kind)).find(Boolean);
  if (!place) place = control.places.find((candidate) => candidate.kind === 'principal_settlement' || candidate.kind === 'city' || candidate.kind === 'town');
  if (!place) return null;
  place.controllerActorId = organisation.actorId;
  place.occupationMode = 'autonomous';
  place.garrisonActorId = organisation.actorId;
  place.garrisonPersonnel = Math.max(place.garrisonPersonnel || 0, Math.round(organisation.militaryCapacity * 0.08));
  organisation.hostRegionIds.add(region.id);
  organisation.memberRegionIds.add(region.id);
  return place;
}

function maybeFoundFreeCity(region, world, politiesById, currentTick, elapsedDays, rng) {
  if (existingOrganisation(world, ORGANISATION_TYPES.FREE_CITY, (organisation) => organisation.hostRegionIds.has(region.id))) return null;
  const autonomy = clamp(region.governance?.autonomy || 0);
  const weakCentre = 1 - clamp(region.governance?.administrativeControl ?? 1);
  const urban = Math.max(0, Number(region.urbanisation?.urbanPopulation) || 0);
  const commercial = commerce(region);
  const power = localPower(region);
  if (urban < 4000 || commercial < 0.34 || power < 0.30 || Math.max(autonomy, weakCentre) < 0.52) return null;
  const annual = 0.003 * commercial * (0.4 + power) * (0.4 + Math.max(autonomy, weakCentre));
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const organisation = createOrganisation(world, ORGANISATION_TYPES.FREE_CITY, `${region.name} Free City`, currentTick, {
    treasury: Math.max(20, (region.treasury || 0) * 0.04), influence: 0.08 + commercial * 0.12,
    autonomy: Math.max(0.55, autonomy), militaryCapacity: Math.max(80, (region.army?.personnel || 0) * 0.08),
    commercialCapacity: commercial, territorialShare: 0.04,
    memberPolityIds: [region.governance?.sovereignPolityId || region.polityId], hostRegionIds: [region.id],
  });
  const place = controlPlace(region, organisation, ['city', 'principal_settlement', 'port', 'town']);
  region.governance.autonomy = clamp(Math.max(region.governance.autonomy || 0, 0.62));
  return { type: 'organisation_founded', organisation, regionId: region.id, regionName: region.name, placeId: place?.id || null };
}

function maybeFoundPirateHaven(region, world, activeRaids, currentTick, elapsedDays, rng) {
  if (!region.isCoastal) return null;
  if (existingOrganisation(world, ORGANISATION_TYPES.PIRATE_HAVEN, (organisation) => organisation.hostRegionIds.has(region.id))) return null;
  const stability = clamp(region.stability ?? 0.7);
  const weakCentre = 1 - clamp(region.governance?.administrativeControl ?? 1);
  const boats = Math.max(0, Number(region.navy?.boats) || 0);
  const raiding = (activeRaids || []).filter((raid) => raid.attackerId === region.id && !raid.completed).length;
  if (stability > 0.48 || weakCentre < 0.35 || boats < 2 || raiding < 1) return null;
  const annual = 0.009 * (1 - stability) * (0.5 + weakCentre) * Math.min(1.5, 0.5 + raiding * 0.3);
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const organisation = createOrganisation(world, ORGANISATION_TYPES.PIRATE_HAVEN, `${region.name} Free Captains`, currentTick, {
    treasury: 25 + raiding * 8, influence: 0.08, autonomy: 0.82,
    militaryCapacity: Math.max(100, boats * 45), commercialCapacity: commerce(region) * 0.5,
    territorialShare: 0.03, memberRegionIds: [region.id], hostRegionIds: [region.id],
  });
  const place = controlPlace(region, organisation, ['port', 'fort', 'town']);
  return { type: 'organisation_founded', organisation, regionId: region.id, regionName: region.name, placeId: place?.id || null };
}

function maybeFoundMercenaryCompany(region, world, currentTick, elapsedDays, rng) {
  if (existingOrganisation(world, ORGANISATION_TYPES.MERCENARY_COMPANY, (organisation) => organisation.hostRegionIds.has(region.id))) return null;
  const power = localPower(region);
  const army = Math.max(0, Number(region.army?.personnel) || 0);
  const finance = Math.max(0, Number(region.treasury) || 0);
  if (power < 0.38 || army < 500 || finance < 25) return null;
  const annual = 0.0025 * power * clamp(army / 3000);
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const organisation = createOrganisation(world, ORGANISATION_TYPES.MERCENARY_COMPANY, `${region.name} Company`, currentTick, {
    treasury: 15, influence: 0.04, autonomy: 0.9,
    militaryCapacity: Math.max(120, army * 0.06), commercialCapacity: 0.15,
    hostRegionIds: [region.id], memberRegionIds: [region.id],
  });
  return { type: 'organisation_founded', organisation, regionId: region.id, regionName: region.name };
}

function connectedCommercialPartners(region, regionsById) {
  const partners = [];
  for (const partnerId of region.recentTradePartners?.keys?.() || []) {
    const partner = regionsById.get(partnerId);
    if (partner && commerce(partner) >= 0.32) partners.push(partner);
  }
  return partners.sort((a, b) => commerce(b) - commerce(a));
}

function maybeFoundMerchantLeague(region, world, regionsById, currentTick, elapsedDays, rng) {
  if (world.nonStateOrganisations.some((organisation) => organisation.active && organisation.type === ORGANISATION_TYPES.MERCHANT_LEAGUE && organisation.memberRegionIds.has(region.id))) return null;
  const commercial = commerce(region);
  if (commercial < 0.42) return null;
  const partners = connectedCommercialPartners(region, regionsById).filter((partner) => commerce(partner) >= 0.36).slice(0, 6);
  if (partners.length < 2) return null;
  const annual = 0.0018 * commercial * Math.min(1.5, partners.length / 3);
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const members = [region, ...partners.slice(0, Math.max(2, Math.min(4, partners.length)))];
  const organisation = createOrganisation(world, ORGANISATION_TYPES.MERCHANT_LEAGUE, `${region.name} Merchant League`, currentTick, {
    treasury: 35, influence: 0.09, autonomy: 0.55, commercialCapacity: members.reduce((sum, member) => sum + commerce(member), 0) / members.length,
    memberRegionIds: members.map((member) => member.id), memberPolityIds: members.map((member) => member.governance?.sovereignPolityId || member.polityId),
    hostRegionIds: [region.id],
  });
  return { type: 'organisation_founded', organisation, regionId: region.id, regionName: region.name };
}

function maybeFoundCharteredCompany(region, world, politiesById, currentTick, elapsedDays, rng) {
  if (world.nonStateOrganisations.some((organisation) => organisation.active && organisation.type === ORGANISATION_TYPES.CHARTERED_COMPANY && organisation.hostRegionIds.has(region.id))) return null;
  const polity = politiesById.get(region.governance?.sovereignPolityId || region.polityId);
  const admin = administration(region, politiesById);
  const commercial = commerce(region);
  const oceanic = hasBreakthrough(region, 'ocean_going_sailing') || hasBreakthrough(region, 'ocean_sailing');
  const gunpowder = hasBreakthrough(region, 'gunpowder');
  const currency = Boolean(polity?.currency?.active || polity?.currency?.currentCurrencyId);
  if (!oceanic || !gunpowder || !currency || commercial < 0.62 || (admin?.accounting || 0) < 0.62 || (admin?.officialdom || 0) < 0.55 || (region.treasury || 0) < 350) return null;
  // Deliberately rare: this should generally be an early-modern rather than medieval outcome.
  const annual = 0.00018 * commercial * (admin.accounting || 0);
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const organisation = createOrganisation(world, ORGANISATION_TYPES.CHARTERED_COMPANY, `${region.name} Chartered Company`, currentTick, {
    treasury: Math.max(120, (region.treasury || 0) * 0.12), influence: 0.12, autonomy: 0.72,
    authority: 0.35, militaryCapacity: Math.max(150, (region.army?.personnel || 0) * 0.04), commercialCapacity: commercial,
    memberRegionIds: [region.id], hostRegionIds: [region.id], memberPolityIds: [polity?.id].filter(Boolean), charteringPolityId: polity?.id || null,
  });
  return { type: 'organisation_founded', organisation, regionId: region.id, regionName: region.name };
}

function polityAgreementGraph(polities, agreements) {
  const graph = new Map(polities.map((polity) => [polity.id, new Set()]));
  for (const agreement of agreements || []) {
    if (!agreement.active) continue;
    const a = agreement.fromPolityId || agreement.fromActorId || agreement.fromId;
    const b = agreement.toPolityId || agreement.toActorId || agreement.toId;
    if (!graph.has(a) || !graph.has(b) || a === b) continue;
    graph.get(a).add(b); graph.get(b).add(a);
  }
  return graph;
}

function maybeFoundInterstateLeague(world, polities, regions, agreements, currentTick, elapsedDays, rng) {
  if (world.nonStateOrganisations.some((organisation) => organisation.active && [ORGANISATION_TYPES.INTERSTATE_LEAGUE, ORGANISATION_TYPES.SUPRANATIONAL_UNION].includes(organisation.type))) return null;
  const graph = polityAgreementGraph(polities, agreements);
  const eligible = polities.filter((polity) => {
    const admin = polity.administration || {};
    return (admin.legitimacy || 0) >= 0.62 && (admin.communications || 0) >= 0.55 && (admin.officialdom || 0) >= 0.45 && (graph.get(polity.id)?.size || 0) >= 2;
  });
  if (eligible.length < 4) return null;
  const component = eligible.filter((polity) => eligible.some((other) => other.id !== polity.id && graph.get(polity.id)?.has(other.id)));
  if (component.length < 4) return null;
  const avgComms = component.reduce((sum, polity) => sum + (polity.administration?.communications || 0), 0) / component.length;
  // Very high institutional hurdle. A medieval world should almost never satisfy it.
  const annual = 0.00008 * avgComms * Math.min(1.5, component.length / 6);
  if (rng() >= chanceForDays(annual, elapsedDays)) return null;
  const organisation = createOrganisation(world, ORGANISATION_TYPES.INTERSTATE_LEAGUE, 'League of States', currentTick, {
    treasury: 80, influence: 0.14, autonomy: 1, authority: 0.12, pooledSovereignty: 0.03,
    memberPolityIds: component.map((polity) => polity.id),
  });
  return { type: 'organisation_founded', organisation, polityIds: [...organisation.memberPolityIds] };
}

function evolveOrganisations(world, politiesById, currentTick, elapsedDays) {
  const events = [];
  for (const organisation of world.nonStateOrganisations) {
    if (!organisation.active) continue;
    const years = Math.max(0, (currentTick - organisation.foundedTick) / 52.1775);
    if (organisation.type === ORGANISATION_TYPES.FREE_CITY || organisation.type === ORGANISATION_TYPES.PIRATE_HAVEN) {
      organisation.autonomy = clamp(organisation.autonomy + 0.002 * elapsedDays / 30);
      organisation.territorialShare = clamp(organisation.territorialShare + organisation.autonomy * 0.0007 * elapsedDays / 30, 0, 0.35);
      if (organisation.type === ORGANISATION_TYPES.FREE_CITY && organisation.autonomy >= 0.88 && organisation.territorialShare >= 0.10) organisation.notes.status = 'city_state';
      if (organisation.type === ORGANISATION_TYPES.PIRATE_HAVEN && organisation.autonomy >= 0.9) organisation.notes.status = 'pirate_city';
    }
    if (organisation.type === ORGANISATION_TYPES.MERCHANT_LEAGUE) {
      organisation.influence += 0.0005 * elapsedDays / 30 * organisation.memberRegionIds.size;
      organisation.authority = clamp(organisation.authority + 0.0002 * elapsedDays / 30);
    }
    if (organisation.type === ORGANISATION_TYPES.MERCENARY_COMPANY) {
      organisation.militaryCapacity *= Math.pow(0.9995, elapsedDays / 30);
    }
    if (organisation.type === ORGANISATION_TYPES.INTERSTATE_LEAGUE) {
      const members = [...organisation.memberPolityIds].map((id) => politiesById.get(id)).filter(Boolean);
      if (!members.length) continue;
      const avgLegitimacy = members.reduce((sum, polity) => sum + (polity.administration?.legitimacy || 0), 0) / members.length;
      const avgOfficialdom = members.reduce((sum, polity) => sum + (polity.administration?.officialdom || 0), 0) / members.length;
      if (years >= 100 && members.length >= 5 && avgLegitimacy >= 0.75 && avgOfficialdom >= 0.72) {
        organisation.pooledSovereignty = clamp(organisation.pooledSovereignty + 0.00025 * elapsedDays / 30);
        organisation.authority = clamp(organisation.authority + 0.00018 * elapsedDays / 30);
      }
      if (organisation.pooledSovereignty >= 0.25 && organisation.authority >= 0.35) {
        organisation.type = ORGANISATION_TYPES.SUPRANATIONAL_UNION;
        organisation.name = 'Union of States';
        events.push({ type: 'organisation_evolved', organisation });
      }
    }
  }
  return events;
}

export function tickNonStateOrganisations(regions, polities, world, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  ensureOrganisationWorld(world);
  const regionsById = new Map(regions.map((region) => [region.id, region]));
  const politiesById = new Map(polities.map((polity) => [polity.id, polity]));
  const events = [];

  // Founding checks are intentionally sparse and individually low probability.
  for (const region of regions) {
    for (const event of [
      maybeFoundFreeCity(region, world, politiesById, currentTick, elapsedDays, rng),
      maybeFoundPirateHaven(region, world, options.activeRaids || [], currentTick, elapsedDays, rng),
      maybeFoundMercenaryCompany(region, world, currentTick, elapsedDays, rng),
      maybeFoundMerchantLeague(region, world, regionsById, currentTick, elapsedDays, rng),
      maybeFoundCharteredCompany(region, world, politiesById, currentTick, elapsedDays, rng),
    ]) if (event) events.push(event);
  }
  const interstate = maybeFoundInterstateLeague(world, polities, regions, options.agreements || [], currentTick, elapsedDays, rng);
  if (interstate) events.push(interstate);
  events.push(...evolveOrganisations(world, politiesById, currentTick, elapsedDays));
  return events;
}

export function organisationSummary(world) {
  ensureOrganisationWorld(world);
  return world.nonStateOrganisations.filter((organisation) => organisation.active).map((organisation) => ({
    id: organisation.id,
    type: organisation.type,
    name: organisation.name,
    members: organisation.memberRegionIds.size + organisation.memberPolityIds.size,
    influence: organisation.influence,
    autonomy: organisation.autonomy,
    authority: organisation.authority,
    militaryCapacity: organisation.militaryCapacity,
    commercialCapacity: organisation.commercialCapacity,
    status: organisation.notes?.status || null,
  }));
}
