import { hasDirectContact, knownRegionIds, recordScoutContact } from './knowledge.js?v=20260906-scouting1';

const MAX_BASIC_NAVAL_SEARCH_KM = 450;
const MAX_ADVANCED_NAVAL_SEARCH_KM = 900;
const MIN_SCOUTING_ARMY = 20;

function distanceKm(a, b) {
  const [lon1, lat1] = a?.centroid || [];
  const [lon2, lat2] = b?.centroid || [];
  if (![lon1, lat1, lon2, lat2].every(Number.isFinite)) return Infinity;
  const toRad = Math.PI / 180;
  const p1 = lat1 * toRad;
  const p2 = lat2 * toRad;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function sharedSeaIds(a, b) {
  const bSeas = new Set(b?.adjacentSeaIds || []);
  return (a?.adjacentSeaIds || []).filter((id) => bSeas.has(id));
}

function navalRangeKm(region) {
  return (region?.navy?.advancedBoats || 0) > 0
    ? MAX_ADVANCED_NAVAL_SEARCH_KM
    : MAX_BASIC_NAVAL_SEARCH_KM;
}

function missionWeeks(viaSea, km) {
  // Round trips dominate expedition duration. Short-channel reconnaissance is
  // measured in weeks; a several-hundred-kilometre search can occupy a vessel
  // for a season or more. Land patrols are slower per kilometre.
  if (viaSea) return Math.max(3, 2 + Math.ceil(km / 80) * 2);
  return Math.max(4, 2 + Math.ceil(km / 35) * 2);
}

function missionSuccessChance(choice, region) {
  const km = Math.max(0, choice.distanceKm || 0);
  const range = choice.viaSea ? navalRangeKm(region) : Math.max(120, km + 1);
  const distanceFraction = Math.min(1, km / Math.max(1, range));
  const base = choice.viaSea ? 0.94 : 0.9;
  const distancePenalty = choice.viaSea
    ? 0.58 * Math.pow(distanceFraction, 1.25)
    : 0.32 * Math.pow(Math.min(1, km / 250), 1.15);
  const rumourBonus = choice.reason?.includes('rumour') ? 0.08 : 0;
  return Math.max(0.18, Math.min(0.98, base - distancePenalty + rumourBonus));
}

export function scoutingCandidates(region, regions, mode = 'auto') {
  if (!region) return [];
  const byId = new Map(regions.map((candidate) => [candidate.id, candidate]));
  const known = knownRegionIds(region);
  const candidates = new Map();

  const add = (target, viaSea, weight, reason) => {
    if (!target || target.id === region.id || hasDirectContact(region, target)) return;
    const km = distanceKm(region, target);
    if (!Number.isFinite(km)) return;
    const key = `${target.id}|${viaSea ? 'sea' : 'land'}`;
    const candidate = { target, viaSea, weight, reason, distanceKm: km };
    const existing = candidates.get(key);
    if (!existing || weight > existing.weight) candidates.set(key, candidate);
  };

  if (mode !== 'sea' && (region.army?.personnel || 0) >= MIN_SCOUTING_ARMY) {
    // Patrols push beyond places the government already knows about. The AI
    // uses hidden topology only to resolve where an expedition physically
    // emerges; deciding to scout never uses the target's hidden economy or tech.
    const frontierIds = new Set([region.id, ...known]);
    for (const frontierId of frontierIds) {
      const frontier = byId.get(frontierId);
      if (!frontier) continue;
      for (const targetId of frontier.neighbors || []) {
        const target = byId.get(targetId);
        if (!target) continue;
        const km = distanceKm(region, target);
        const rumourWeight = known.has(targetId) ? 4 : 1.5;
        const distanceWeight = Math.max(0.3, 1.5 - km / 300);
        add(target, false, rumourWeight * distanceWeight,
          known.has(targetId) ? 'follow a known inland rumour' : 'push beyond a known frontier');
      }
    }
  }

  if (mode !== 'land' && region.isCoastal && (region.navy?.boats || 0) >= 1) {
    const maxRange = navalRangeKm(region);
    for (const target of regions) {
      if (target.id === region.id || !target.isCoastal || hasDirectContact(region, target)) continue;
      const seas = sharedSeaIds(region, target);
      if (!seas.length) continue;
      const km = distanceKm(region, target);
      if (km > maxRange) continue;
      const rumourBonus = known.has(target.id) ? 4 : 1;
      // Distance matters strongly even before the success roll: rulers searching
      // an unknown sea are much more likely to encounter a nearby coast than a
      // remote one. Known rumours can justify deliberately pushing farther.
      const distanceWeight = Math.max(0.12, Math.exp(-km / 220));
      add(target, true, rumourBonus * distanceWeight,
        known.has(target.id) ? 'follow a coastal rumour' : 'search a nearby sea');
    }
  }

  return [...candidates.values()];
}

function chooseWeighted(candidates, rng) {
  const total = candidates.reduce((sum, item) => sum + Math.max(0.01, item.weight), 0);
  let roll = rng() * total;
  for (const item of candidates) {
    roll -= Math.max(0.01, item.weight);
    if (roll <= 0) return item;
  }
  return candidates[candidates.length - 1] || null;
}

export function startScoutingMission(region, regions, currentTick, rng = Math.random, mode = 'auto') {
  if (!region || region.scouting?.active) return null;
  const candidates = scoutingCandidates(region, regions, mode);
  if (!candidates.length) return null;
  const choice = chooseWeighted(candidates, rng);
  if (!choice) return null;

  const armyAvailable = Math.max(0, Math.floor(region.army?.personnel || 0));
  const armyCommitted = Math.min(120, Math.max(MIN_SCOUTING_ARMY, Math.floor(armyAvailable * 0.05)));
  if (armyAvailable < armyCommitted) return null;
  const navyCommitted = choice.viaSea ? 1 : 0;
  if (navyCommitted && (region.navy?.boats || 0) - (region.navy?.scoutingBoats || 0) < navyCommitted) return null;

  const durationWeeks = missionWeeks(choice.viaSea, choice.distanceKm);
  const successChance = missionSuccessChance(choice, region);
  region.army.away = Math.max(0, region.army.away || 0) + armyCommitted;
  region.navy.scoutingBoats = Math.max(0, region.navy.scoutingBoats || 0) + navyCommitted;
  region.scouting = {
    active: true,
    mode: choice.viaSea ? 'sea' : 'land',
    targetId: choice.target.id,
    reason: choice.reason,
    distanceKm: choice.distanceKm,
    successChance,
    startedTick: currentTick,
    completeTick: currentTick + durationWeeks,
    armyCommitted,
    navyCommitted,
    lastResult: region.scouting?.lastResult || null,
  };
  return region.scouting;
}

export function tickScouting(regions, currentTick, rng = Math.random) {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const results = [];
  for (const region of regions) {
    const mission = region.scouting;
    if (!mission?.active || currentTick < mission.completeTick) continue;

    region.army.away = Math.max(0, (region.army.away || 0) - (mission.armyCommitted || 0));
    region.navy.scoutingBoats = Math.max(0, (region.navy.scoutingBoats || 0) - (mission.navyCommitted || 0));
    const target = byId.get(mission.targetId);
    const successChance = Number.isFinite(mission.successChance)
      ? mission.successChance
      : (mission.mode === 'sea' ? 0.68 : 0.78);
    const success = Boolean(target) && rng() < successChance;
    if (success) recordScoutContact(region, target, currentTick, mission.mode);

    const result = {
      success,
      tick: currentTick,
      targetId: success ? target.id : null,
      targetName: success ? target.name : null,
      mode: mission.mode,
      distanceKm: mission.distanceKm || null,
    };
    region.scouting = { active: false, lastResult: result };
    results.push({ regionId: region.id, ...result });
  }
  return results;
}
