import { hasDirectContact, knownRegionIds, recordScoutContact } from './knowledge.js?v=20260906-scouting1';

const LAND_MISSION_WEEKS = 13;
const SEA_MISSION_WEEKS = 18;
const MAX_NAVAL_SEARCH_KM = 450;
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

export function scoutingCandidates(region, regions, mode = 'auto') {
  if (!region) return [];
  const byId = new Map(regions.map((candidate) => [candidate.id, candidate]));
  const known = knownRegionIds(region);
  const candidates = new Map();

  const add = (target, viaSea, weight, reason) => {
    if (!target || target.id === region.id || hasDirectContact(region, target)) return;
    const key = `${target.id}|${viaSea ? 'sea' : 'land'}`;
    const existing = candidates.get(key);
    if (!existing || weight > existing.weight) candidates.set(key, { target, viaSea, weight, reason });
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
        add(target, false, known.has(targetId) ? 4 : 1.5, known.has(targetId) ? 'follow a known inland rumour' : 'push beyond a known frontier');
      }
    }
  }

  if (mode !== 'land' && region.isCoastal && (region.navy?.boats || 0) >= 1) {
    for (const target of regions) {
      if (target.id === region.id || !target.isCoastal || hasDirectContact(region, target)) continue;
      const seas = sharedSeaIds(region, target);
      if (!seas.length) continue;
      const km = distanceKm(region, target);
      if (km > MAX_NAVAL_SEARCH_KM) continue;
      const rumourBonus = known.has(target.id) ? 4 : 1;
      const distanceWeight = Math.max(0.5, 1.8 - km / MAX_NAVAL_SEARCH_KM);
      add(target, true, rumourBonus * distanceWeight, known.has(target.id) ? 'follow a coastal rumour' : 'search a nearby sea');
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
  if (navyCommitted && (region.navy?.boats || 0) < navyCommitted) return null;

  region.army.away = Math.max(0, region.army.away || 0) + armyCommitted;
  region.navy.scoutingBoats = Math.max(0, region.navy.scoutingBoats || 0) + navyCommitted;
  region.scouting = {
    active: true,
    mode: choice.viaSea ? 'sea' : 'land',
    targetId: choice.target.id,
    reason: choice.reason,
    startedTick: currentTick,
    completeTick: currentTick + (choice.viaSea ? SEA_MISSION_WEEKS : LAND_MISSION_WEEKS),
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
    const successChance = mission.mode === 'sea' ? 0.68 : 0.78;
    const success = Boolean(target) && rng() < successChance;
    if (success) recordScoutContact(region, target, currentTick, mission.mode);

    const result = {
      success,
      tick: currentTick,
      targetId: success ? target.id : null,
      targetName: success ? target.name : null,
      mode: mission.mode,
    };
    region.scouting = { active: false, lastResult: result };
    results.push({ regionId: region.id, ...result });
  }
  return results;
}
