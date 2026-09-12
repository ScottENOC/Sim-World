import { ensureSubregionalControl } from '../military/subregionalControl.js?v=20260908-subregion1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function ensureWorld(world) {
  world.authorities ||= [];
  if (!Number.isFinite(world.nextAuthorityId)) world.nextAuthorityId = world.authorities.length + 1;
  return world;
}

function polityMap(polities) { return new Map((polities || []).map((p) => [p.id, p])); }
function regionMap(regions) { return new Map((regions || []).map((r) => [r.id, r])); }

function followersByPolity(religionId, regions) {
  const totals = new Map();
  for (const region of regions) {
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    const followers = Math.max(0, region.population || 0) * Math.max(0, region.religion?.shares?.[religionId] || 0);
    if (followers > 0) totals.set(polityId, (totals.get(polityId) || 0) + followers);
  }
  return totals;
}

function religiousReach(religionId, regions) {
  let followers = 0; let regionsWithFollowers = 0; let strongRegions = 0;
  const polities = new Set();
  for (const region of regions) {
    const share = Math.max(0, region.religion?.shares?.[religionId] || 0);
    if (share <= 0.005) continue;
    followers += Math.max(0, region.population || 0) * share;
    regionsWithFollowers += 1;
    if (share >= 0.2) strongRegions += 1;
    polities.add(region.governance?.sovereignPolityId || region.polityId);
  }
  return { followers, regionsWithFollowers, strongRegions, polityCount: polities.size };
}

function authorityForReligion(world, religionId) {
  return ensureWorld(world).authorities.find((authority) => authority.religionId === religionId && authority.active !== false) || null;
}

export function religiousInstitutionScore(religion, regions) {
  if (!religion?.adminCentreRegionId || !religion?.leader) return 0;
  const reach = religiousReach(religion.id, regions);
  const followerScale = clamp(Math.log10(Math.max(10, reach.followers)) / 7);
  const geographic = clamp(reach.strongRegions / 10);
  const transnational = clamp((reach.polityCount - 1) / 4);
  return clamp((religion.authority || 0) * 0.32 + followerScale * 0.28 + geographic * 0.2 + transnational * 0.2);
}

function ensureReligiousCapitalPlace(region, authority) {
  const control = ensureSubregionalControl(region);
  let place = control.places.find((candidate) => candidate.id === authority.seatPlaceId);
  if (!place) {
    place = {
      id: authority.seatPlaceId,
      name: authority.seatName,
      kind: 'religious_capital',
      population: Math.round(Math.max(250, (region.population || 0) * authority.territorialShare * 0.5)),
      strategicValue: 0.9,
      nativeControllerActorId: authority.id,
      controllerActorId: authority.id,
      occupationMode: 'autonomous_religious',
      garrisonActorId: authority.id,
      garrisonPersonnel: Math.max(12, Math.round((region.population || 0) * authority.territorialShare * 0.01)),
      contested: false,
      capturedTick: null,
    };
    control.places.push(place);
  }
  return place;
}

export function establishAutonomousReligiousSeat(religion, hostRegion, world, polities, currentTick, options = {}) {
  ensureWorld(world);
  if (!religion?.adminCentreRegionId || religion.adminCentreRegionId !== hostRegion?.id || !religion.leader) return null;
  if (authorityForReligion(world, religion.id)) return authorityForReligion(world, religion.id);
  const hostPolityId = hostRegion.governance?.sovereignPolityId || hostRegion.polityId;
  const id = `religious_authority_${world.nextAuthorityId++}`;
  const territorialShare = clamp(options.territorialShare ?? (0.008 + (religion.authority || 0) * 0.016), 0.005, 0.035);
  const authority = {
    id, religionId: religion.id, name: `${religion.name} Authority`, seatRegionId: hostRegion.id,
    seatPlaceId: `${hostRegion.id}:religious-capital:${religion.id}`, seatName: `${religion.name} Sacred Seat`,
    hostPolityId, foundedTick: currentTick, autonomy: 0.92, territorialShare, treasury: 0,
    prestige: clamp(0.25 + (religion.authority || 0) * 0.5), diplomaticInfluence: 0.2,
    influenceByPolity: {}, recognitionByPolity: {}, active: true,
  };
  world.authorities.push(authority);
  religion.religiousAuthorityId = authority.id;
  ensureReligiousCapitalPlace(hostRegion, authority);
  const hostPolity = polityMap(polities).get(hostPolityId);
  if (hostPolity?.administration) {
    hostPolity.administration.legitimacy = clamp(hostPolity.administration.legitimacy + 0.035 + authority.prestige * 0.025);
  }
  hostRegion.religiousSeatInfluence = Math.max(hostRegion.religiousSeatInfluence || 0, authority.prestige);
  return authority;
}

function updateAuthority(authority, religion, regions, polities, elapsedYears) {
  const pMap = polityMap(polities); const rMap = regionMap(regions);
  const seat = rMap.get(authority.seatRegionId);
  if (!seat) { authority.active = false; return; }
  ensureReligiousCapitalPlace(seat, authority);
  const followerTotals = followersByPolity(religion.id, regions);
  const totalFollowers = [...followerTotals.values()].reduce((sum, value) => sum + value, 0) || 1;
  let crossBorderWeight = 0;
  for (const [polityId, followers] of followerTotals.entries()) {
    const share = followers / totalFollowers;
    const previous = authority.influenceByPolity[polityId] || 0;
    const target = clamp(share * 2.2 + authority.prestige * 0.2);
    authority.influenceByPolity[polityId] = previous + (target - previous) * clamp(elapsedYears * 0.35);
    if (polityId !== authority.hostPolityId) crossBorderWeight += share;
  }
  authority.diplomaticInfluence = clamp(0.18 + authority.prestige * 0.36 + crossBorderWeight * 0.5);
  const hostPolity = pMap.get(authority.hostPolityId);
  const taxBase = Math.max(0, seat.militaryFinance?.weeklyTaxRevenue || 0) * 52;
  const exemptValue = taxBase * authority.territorialShare * authority.autonomy;
  const pilgrimageBase = Math.sqrt(Math.max(0, totalFollowers)) * (0.02 + religion.authority * 0.03);
  authority.treasury += (exemptValue * 0.65 + pilgrimageBase) * elapsedYears;
  seat.treasury = Math.max(0, (seat.treasury || 0) - exemptValue * 0.35 * elapsedYears + pilgrimageBase * 0.3 * elapsedYears);
  seat.religiousSeatInfluence = authority.diplomaticInfluence;
  if (hostPolity?.administration) {
    const official = seat.religion?.stateReligionId === religion.id ? 1 : 0.35;
    const targetBonus = authority.diplomaticInfluence * official * 0.07;
    hostPolity.religiousLegitimacyBonus = targetBonus;
    hostPolity.administration.legitimacy = clamp(hostPolity.administration.legitimacy + targetBonus * elapsedYears * 0.04);
  }
}

function culturalDistance(a, b) {
  const groupsA = Array.isArray(a?.cultureGroups) ? a.cultureGroups : [];
  const groupsB = Array.isArray(b?.cultureGroups) ? b.cultureGroups : [];
  const top = (groups) => groups.slice().sort((x, y) => (y.population || 0) - (x.population || 0))[0];
  const one = top(groupsA); const two = top(groupsB);
  if (!one || !two) return 0.25;
  const idA = one.id || one.cultureId || one.name; const idB = two.id || two.cultureId || two.name;
  return idA === idB ? 0 : 0.8;
}

export function religiousSchismPressure(religion, regions, polities) {
  if (!religion?.adminCentreRegionId || !religion?.leader) return { pressure: 0, candidateRegionId: null };
  const rMap = regionMap(regions); const centre = rMap.get(religion.adminCentreRegionId);
  if (!centre) return { pressure: 0, candidateRegionId: null };
  const centrePolity = centre.governance?.sovereignPolityId || centre.polityId;
  let best = null;
  for (const region of regions) {
    const share = region.religion?.shares?.[religion.id] || 0;
    if (share < 0.32 || region.id === centre.id) continue;
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    const rivalPatron = polityId !== centrePolity ? 0.28 : 0;
    const culture = culturalDistance(region, centre) * 0.24;
    const distanceSignal = Math.min(0.28, Math.abs((region.centroid?.[0] || 0) - (centre.centroid?.[0] || 0)) / 90 * 0.28);
    const localStatePatronage = region.religion?.stateReligionId === religion.id ? 0.12 : 0;
    const localUnrest = clamp(region.religion?.unrest || 0) * 0.22;
    const score = clamp(rivalPatron + culture + distanceSignal + localStatePatronage + localUnrest + (religion.authority || 0) * 0.12);
    if (!best || score > best.pressure) best = { pressure: score, candidateRegionId: region.id };
  }
  return best || { pressure: 0, candidateRegionId: null };
}

export function createInstitutionalSchism(religion, region, world, currentTick) {
  ensureWorld(world);
  const parentShare = region?.religion?.shares?.[religion.id] || 0;
  if (!religion || !region || parentShare < 0.3) return null;
  const id = `religion_${world.nextReligionId++}`;
  const schism = {
    id, name: `${region.name} Communion`, parentId: religion.id, familyId: religion.familyId,
    holyCityRegionId: region.id, adminCentreRegionId: region.id, foundedTick: currentTick,
    authority: Math.max(0.22, religion.authority * 0.65),
    leader: { name: `Primate of ${region.name}`, opinionOfRegions: {}, influence: {}, currentDirectiveId: null },
    active: true, spreadMode: 'organised', monumentalPrestige: 0, institutionalSchism: true,
  };
  world.religions.push(schism);
  const moved = parentShare * 0.55;
  region.religion.shares[religion.id] = parentShare - moved;
  region.religion.shares[id] = moved;
  if (region.religion.stateReligionId === religion.id) region.religion.stateReligionId = id;
  region.religion.unrest = clamp((region.religion.unrest || 0) + 0.12);
  return schism;
}

export function tickReligiousInstitutions(regions, world, polities, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  ensureWorld(world);
  const elapsedYears = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const events = [];
  const rMap = regionMap(regions);
  for (const religion of world.religions || []) {
    if (!religion.active || !religion.adminCentreRegionId || !religion.leader) continue;
    let authority = authorityForReligion(world, religion.id);
    const score = religiousInstitutionScore(religion, regions);
    if (!authority && score >= 0.48) {
      const seat = rMap.get(religion.adminCentreRegionId);
      if (seat) {
        const hostPolityId = seat.governance?.sovereignPolityId || seat.polityId;
        const event = { type: 'religious_seat_offer', regionId: seat.id, regionName: seat.name,
          polityId: hostPolityId, religionId: religion.id, religionName: religion.name, institutionScore: score };
        if (hostPolityId === options.playerPolityId) {
          event.resolveDecision = (choice) => ({ established: choice === 'grant' ?
            establishAutonomousReligiousSeat(religion, seat, world, polities, currentTick) : null });
        } else {
          const host = polityMap(polities).get(hostPolityId);
          const accepts = (host?.administration?.legitimacy || 0) < 0.72 || (religion.authority || 0) > 0.48;
          if (accepts) { authority = establishAutonomousReligiousSeat(religion, seat, world, polities, currentTick); event.npcResolution = 'granted'; }
          else event.npcResolution = 'refused';
        }
        events.push(event);
      }
    }
    authority ||= authorityForReligion(world, religion.id);
    if (authority) updateAuthority(authority, religion, regions, polities, elapsedYears);
    if (!religion.lastInstitutionalSchismTick || currentTick - religion.lastInstitutionalSchismTick >= 520) {
      const schism = religiousSchismPressure(religion, regions, polities);
      const annualChance = schism.pressure >= 0.58 ? Math.pow((schism.pressure - 0.5) * 0.08, 1.25) : 0;
      const chance = 1 - Math.pow(1 - clamp(annualChance), elapsedYears);
      if (schism.candidateRegionId && rng() < chance) {
        const region = rMap.get(schism.candidateRegionId);
        const child = createInstitutionalSchism(religion, region, world, currentTick);
        if (child) {
          religion.lastInstitutionalSchismTick = currentTick;
          events.push({ type: 'religious_schism', regionId: region.id, regionName: region.name,
            polityId: region.governance?.sovereignPolityId || region.polityId, parentReligionId: religion.id,
            religion: child, pressure: schism.pressure });
        }
      }
    }
  }
  return events;
}
