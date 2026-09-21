const arr = (value) => Array.isArray(value) ? value : [];

export function countryActorId(countryName, aliases = {}) {
  const explicit = aliases[countryName];
  if (explicit) return explicit;
  return String(countryName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function countryRegionsFromNavigation(regions, navigation, sovereignty = {}) {
  const byId = new Map(arr(regions).map((region) => [region.id, region]));
  const aliases = sovereignty.actorAliases || {};
  const groups = new Map();
  for (const [regionId, memberships] of Object.entries(navigation?.regions || {})) {
    const region = byId.get(regionId);
    if (!region) continue;
    const membership = arr(memberships).find((entry) => entry?.country) || null;
    if (!membership?.country) continue;
    const actorId = countryActorId(membership.country, aliases);
    if (!actorId) continue;
    if (!groups.has(actorId)) groups.set(actorId, { actorId, name: membership.country, continent: membership.continent || null, regions: [] });
    groups.get(actorId).regions.push(region);
  }
  return [...groups.values()];
}

function capitalFor(group, sovereignty = {}) {
  const override = sovereignty.capitals?.[group.actorId];
  if (override) {
    const match = group.regions.find((region) => region.id === override || region.name === override);
    if (match) return match;
  }
  return [...group.regions].sort((a, b) => Number(b.population || 0) - Number(a.population || 0))[0] || null;
}

function cloneSet(value) {
  return value instanceof Set ? new Set(value) : value;
}

function prepareCountryPolity(template, group, capital) {
  const polity = template || {
    administration: { experience: {}, breakthroughs: new Set() },
    report: {},
  };
  polity.id = group.actorId;
  polity.name = group.name;
  polity.capitalRegionId = capital?.id || group.regions[0]?.id || null;
  polity.rulerRegionId = polity.capitalRegionId;
  polity.subjectToPolityId = null;
  polity.scenarioActorId = group.actorId;
  polity.scenarioActorKind = 'country';
  polity.scenarioPlayable = true;
  if (polity.administration?.breakthroughs) polity.administration.breakthroughs = cloneSet(polity.administration.breakthroughs);
  return polity;
}

export function consolidateScenarioSovereignty(world, navigation, sovereignty = {}) {
  const regions = arr(world?.regions);
  const polities = arr(world?.polities);
  const groups = countryRegionsFromNavigation(regions, navigation, sovereignty);
  const polityById = new Map(polities.map((polity) => [polity.id, polity]));
  const absorbed = new Set();
  const countries = [];

  for (const group of groups) {
    const capital = capitalFor(group, sovereignty);
    if (!capital) continue;
    const oldCapitalPolityId = capital.governance?.sovereignPolityId || capital.polityId;
    const template = polityById.get(oldCapitalPolityId) || null;
    const countryPolity = prepareCountryPolity(template, group, capital);

    for (const region of group.regions) {
      const oldId = region.governance?.sovereignPolityId || region.polityId;
      if (oldId && oldId !== countryPolity.id) absorbed.add(oldId);
      region.polityId = countryPolity.id;
      region.controllingActorId = countryPolity.id;
      region.scenarioCountryId = countryPolity.id;
      region.scenarioSelectors = [...new Set([...(region.scenarioSelectors || []), group.actorId, countryActorId(group.name)])];
      region.governance ||= {};
      region.governance.sovereignPolityId = countryPolity.id;
      region.governance.localPolityId = countryPolity.id;
      region.governance.relationship = region.id === capital.id ? 'core' : 'integrated';
      region.governance.administrativeControl = 1;
      region.governance.autonomy = region.id === capital.id ? 0 : Number(sovereignty.defaultProvincialAutonomy ?? 0.12);
    }
    countries.push(countryPolity);
  }

  const countryIds = new Set(countries.map((country) => country.id));
  const retained = polities.filter((polity) => !absorbed.has(polity.id) && !countryIds.has(polity.id));
  polities.splice(0, polities.length, ...retained, ...countries);
  world.scenarioCountries = countries;
  return {
    consolidated: true,
    countryCount: countries.length,
    countries,
    absorbedRegionalPolities: absorbed.size,
    unassignedRegionIds: regions.filter((region) => !region.scenarioCountryId).map((region) => region.id),
  };
}
