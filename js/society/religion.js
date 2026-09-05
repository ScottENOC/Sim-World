import { changeAttitude } from '../diplomacy/relations.js?v=20260905-religion1';

const TRADE_CONVERSION_RATE = 0.00045;
const STATE_SUPPORT_RATE = 0.0003;
const VARIANT_CHANCE_PER_WEEK = 0.000004;
const DIRECTIVE_INTERVAL = 260;
const SHARE_PRUNE_INTERVAL = 13;
const SHARE_PRUNE_THRESHOLD = 0.00025;
const SPREAD_LOCAL = 'local';
const SPREAD_ORGANISED = 'organised';
const SPREAD_MISSIONARY = 'missionary';
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function traditionName(region) {
  const stem = region.name.replace(/[^A-Za-zÀ-ÿ' -]/g, '').trim();
  return `${stem} Tradition`;
}

function leaderName(religion) {
  const stem = religion.name.replace(/ Tradition| Reform| Communion/g, '');
  return `Keeper of ${stem}`;
}

function invalidateReligionIndex(world) {
  world._religionById = null;
}

function religionIndex(world) {
  ensureReligiousWorld(world);
  if (!(world._religionById instanceof Map) || world._religionById.size !== world.religions.length) {
    world._religionById = new Map(world.religions.map((religion) => [religion.id, religion]));
  }
  return world._religionById;
}

function ensureSpreadMode(religion) {
  if (!religion.spreadMode) {
    religion.spreadMode = religion.adminCentreRegionId || religion.leader ? SPREAD_ORGANISED : SPREAD_LOCAL;
  }
  return religion.spreadMode;
}

function canProselytise(religion) {
  if (!religion) return false;
  const mode = ensureSpreadMode(religion);
  return mode === SPREAD_ORGANISED || mode === SPREAD_MISSIONARY;
}

function missionStrength(religion, stateSponsored = false) {
  if (!canProselytise(religion)) return 0;
  const modeMultiplier = ensureSpreadMode(religion) === SPREAD_MISSIONARY ? 1.8 : 0.65;
  return modeMultiplier * (stateSponsored ? 1.5 : 1) * (1 + (religion.authority || 0));
}

export function createReligiousWorld() {
  return { religions: [], directives: [], grievances: {}, nextReligionId: 1,
    nextDirectiveId: 1, observedConflicts: new Set() };
}

export function ensureReligiousWorld(world) {
  if (!world) world = createReligiousWorld();
  if (!Array.isArray(world.religions)) world.religions = [];
  if (!Array.isArray(world.directives)) world.directives = [];
  if (!world.grievances) world.grievances = {};
  if (!(world.observedConflicts instanceof Set)) world.observedConflicts = new Set(world.observedConflicts || []);
  if (!Number.isFinite(world.nextReligionId)) world.nextReligionId = world.religions.length + 1;
  if (!Number.isFinite(world.nextDirectiveId)) world.nextDirectiveId = world.directives.length + 1;
  for (const religion of world.religions) ensureSpreadMode(religion);
  return world;
}

export function ensureRegionReligion(region, world) {
  ensureReligiousWorld(world);
  if (!region.religion) region.religion = {};
  const state = region.religion;
  if (!state.shares || typeof state.shares !== 'object') state.shares = {};
  if (!Number.isFinite(state.tolerance)) state.tolerance = 0.65;
  if (!Number.isFinite(state.unrest)) state.unrest = 0;
  if (!state.conflictHistory) state.conflictHistory = {};
  if (Object.keys(state.shares).length === 0) {
    const native = world.religions.find((religion) => religion.holyCityRegionId === region.id && !religion.parentId);
    if (native) state.shares[native.id] = 1;
    normaliseShares(state);
  }
  return state;
}

export function initialiseReligions(regions, world = createReligiousWorld()) {
  ensureReligiousWorld(world);
  if (world.religions.length > 0) {
    for (const region of regions) ensureRegionReligion(region, world);
    invalidateReligionIndex(world);
    return world;
  }
  for (const region of regions) {
    const id = `religion_${world.nextReligionId++}`;
    world.religions.push({ id, name: traditionName(region), parentId: null, familyId: id,
      holyCityRegionId: region.id, adminCentreRegionId: null, foundedTick: 0,
      authority: 0.08, leader: null, active: true, spreadMode: SPREAD_LOCAL });
    region.religion = { shares: { [id]: 1 }, stateReligionId: null, tolerance: 0.65,
      unrest: 0, conflictHistory: {} };
    if (region.cultureGroups?.[0]) region.cultureGroups[0].religionId = id;
  }
  invalidateReligionIndex(world);
  return world;
}

function normaliseShares(state) {
  for (const [id, share] of Object.entries(state.shares)) {
    if (!Number.isFinite(share) || share < 0.0001) delete state.shares[id];
  }
  const total = Object.values(state.shares).reduce((sum, value) => sum + value, 0);
  if (total > 0 && Math.abs(total - 1) > 0.0000001) {
    for (const id of Object.keys(state.shares)) state.shares[id] /= total;
  }
}

function pruneShares(state) {
  let removed = 0;
  let largestId = null;
  let largestShare = -1;
  for (const [id, share] of Object.entries(state.shares)) {
    if (share > largestShare) { largestShare = share; largestId = id; }
    if (!Number.isFinite(share) || share <= 0) {
      delete state.shares[id];
    } else if (share < SHARE_PRUNE_THRESHOLD) {
      removed += share;
      delete state.shares[id];
    }
  }
  if (removed > 0 && largestId && state.shares[largestId] !== undefined) state.shares[largestId] += removed;
  normaliseShares(state);
}

export function religionById(world, id) {
  if (!id) return null;
  return religionIndex(world).get(id) || null;
}

export function dominantReligion(region, world) {
  const state = ensureRegionReligion(region, world);
  let bestId = null;
  let bestShare = -1;
  for (const [id, share] of Object.entries(state.shares)) {
    if (share > bestShare) { bestShare = share; bestId = id; }
  }
  return bestId ? religionById(world, bestId) : null;
}

export function religionShare(region, religionId, world) {
  return ensureRegionReligion(region, world).shares[religionId] || 0;
}

export function setStateReligion(region, religionId, world) {
  const state = ensureRegionReligion(region, world);
  if (religionId === null || religionId === 'none') { state.stateReligionId = null; return true; }
  if (!religionById(world, religionId) || (state.shares[religionId] || 0) < 0.05) return false;
  state.stateReligionId = religionId;
  return true;
}

export function setReligiousTolerance(region, value, world) {
  ensureRegionReligion(region, world).tolerance = clamp(Number(value));
}

function createVariant(world, parent, region, currentTick, name = null, spreadMode = SPREAD_LOCAL) {
  const id = `religion_${world.nextReligionId++}`;
  const safeName = String(name || `${region.name} Reform`).replace(/[<>&"']/g, '').trim().slice(0, 60);
  const religion = { id, name: safeName || `${region.name} Reform`, parentId: parent.id,
    familyId: parent.familyId, holyCityRegionId: region.id, adminCentreRegionId: null,
    foundedTick: currentTick, authority: 0.04, leader: null, active: true, spreadMode };
  world.religions.push(religion);
  invalidateReligionIndex(world);
  return religion;
}

export function forkReligion(region, world, currentTick, name = null) {
  const parent = dominantReligion(region, world);
  if (!parent || (region.religion.shares[parent.id] || 0) < 0.35 || (region.treasury || 0) < 25) return null;
  region.treasury -= 25;
  const variant = createVariant(world, parent, region, currentTick, name, SPREAD_MISSIONARY);
  const seed = Math.min(0.18, region.religion.shares[parent.id] * 0.25);
  region.religion.shares[parent.id] -= seed;
  region.religion.shares[variant.id] = seed;
  region.religion.stateReligionId = variant.id;
  region.religion.unrest = clamp(region.religion.unrest + 0.08);
  return variant;
}

export function establishReligiousCentre(region, world, religionId) {
  const religion = religionById(world, religionId);
  const share = religionShare(region, religionId, world);
  const costs = { stone: 500, wood: 350, pottery: 100 };
  if (!religion || religion.adminCentreRegionId || share < 0.45 || region.population * share < 5000 ||
      (region.treasury || 0) < 40 || Object.entries(costs).some(([key, amount]) => (region.stockpile?.[key] || 0) < amount)) return false;
  region.treasury -= 40;
  for (const [key, amount] of Object.entries(costs)) region.stockpile[key] -= amount;
  religion.adminCentreRegionId = region.id;
  religion.authority = Math.max(0.35, religion.authority);
  if (ensureSpreadMode(religion) === SPREAD_LOCAL) religion.spreadMode = SPREAD_ORGANISED;
  religion.leader = { name: leaderName(religion), opinionOfRegions: {}, influence: {},
    currentDirectiveId: null };
  return true;
}

function shiftShare(region, fromId, toId, amount, world) {
  const state = ensureRegionReligion(region, world);
  const available = state.shares[fromId] || 0;
  const moved = Math.min(available, Math.max(0, amount));
  if (moved <= 0 || fromId === toId) return;
  state.shares[fromId] = available - moved;
  state.shares[toId] = (state.shares[toId] || 0) + moved;
}

function buildReligionTickCache(regions, world) {
  const byId = new Map();
  const dominantByRegion = new Map();
  const followers = Object.create(null);
  for (const region of regions) {
    byId.set(region.id, region);
    const state = ensureRegionReligion(region, world);
    let dominantId = null;
    let dominantShare = -1;
    for (const [religionId, share] of Object.entries(state.shares)) {
      followers[religionId] = (followers[religionId] || 0) + (region.population || 0) * share;
      if (share > dominantShare) { dominantShare = share; dominantId = religionId; }
    }
    dominantByRegion.set(region.id, dominantId ? religionById(world, dominantId) : null);
  }
  return { byId, dominantByRegion, followers };
}

function spreadThroughTrade(regions, world, currentTick, cache, weekScale = 1) {
  const { byId, dominantByRegion, followers } = cache;
  const seen = new Set();
  for (const region of regions) for (const [partnerId, tick] of region.recentTradePartners || []) {
    if (currentTick - tick > 8) continue;
    const partner = byId.get(partnerId);
    if (!partner) continue;
    const key = region.id < partner.id ? `${region.id}|${partner.id}` : `${partner.id}|${region.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const a = dominantByRegion.get(region.id);
    const b = dominantByRegion.get(partner.id);
    const aOfficial = religionById(world, region.religion.stateReligionId);
    const bOfficial = religionById(world, partner.religion.stateReligionId);
    const aMission = canProselytise(aOfficial) ? aOfficial : (canProselytise(a) ? a : null);
    const bMission = canProselytise(bOfficial) ? bOfficial : (canProselytise(b) ? b : null);
    if (!a || !b || (!aMission && !bMission)) continue;

    if (bMission && bMission.id !== a.id) {
      const bStrength = Math.sqrt((followers[bMission.id] || 0) + 1) *
        missionStrength(bMission, partner.religion.stateReligionId === bMission.id);
      const resistance = a.familyId === bMission.familyId ? 0.7 : 1;
      shiftShare(region, a.id, bMission.id, TRADE_CONVERSION_RATE * weekScale * resistance * bStrength / (bStrength + 120), world);
    }
    if (aMission && aMission.id !== b.id) {
      const aStrength = Math.sqrt((followers[aMission.id] || 0) + 1) *
        missionStrength(aMission, region.religion.stateReligionId === aMission.id);
      const resistance = b.familyId === aMission.familyId ? 0.7 : 1;
      shiftShare(partner, b.id, aMission.id, TRADE_CONVERSION_RATE * weekScale * resistance * aStrength / (aStrength + 120), world);
    }
  }
}

function stateSponsorship(region, world, weekScale = 1) {
  const state = ensureRegionReligion(region, world);
  const official = state.stateReligionId;
  if (!official || !state.shares[official]) return;
  let rivalId = null;
  let rivalShare = -1;
  for (const [id, share] of Object.entries(state.shares)) {
    if (id !== official && share > rivalShare) { rivalId = id; rivalShare = share; }
  }
  if (rivalId) shiftShare(region, rivalId, official,
    STATE_SUPPORT_RATE * weekScale * (0.4 + (1 - state.tolerance)) * state.shares[official], world);
}

function observeConflicts(regions, world, raids, campaigns, currentTick, cache) {
  const { byId, dominantByRegion } = cache;
  const conflicts = [...(raids || []).map((item) => ({ key: `raid:${item.id}`, item })),
    ...(campaigns || []).map((item) => ({ key: `campaign:${item.id}`, item }))];
  for (const { key, item } of conflicts) {
    if (world.observedConflicts.has(key)) continue;
    world.observedConflicts.add(key);
    const attacker = byId.get(item.attackerId); const defender = byId.get(item.defenderId);
    const attackFaith = attacker && dominantByRegion.get(attacker.id);
    const defendFaith = defender && dominantByRegion.get(defender.id);
    if (!attacker || !defender || !attackFaith || !defendFaith || attackFaith.familyId === defendFaith.familyId) continue;
    const grievanceKey = `${defendFaith.familyId}|${attackFaith.familyId}`;
    world.grievances[grievanceKey] = (world.grievances[grievanceKey] || 0) +
      Math.max(1, (item.initialPersonnel || item.personnel || 0) / 500);
    attacker.religion.conflictHistory[defendFaith.familyId] = currentTick;
    for (const religion of world.religions) if (religion.familyId === defendFaith.familyId && religion.leader) {
      religion.leader.opinionOfRegions[attacker.id] = clamp(
        (religion.leader.opinionOfRegions[attacker.id] || 0) - (attackFaith.id === defendFaith.id ? 0.08 : 0.12), -1, 1);
    }
    const defenderFamilyRegions = [];
    const attackerFamilyRegions = [];
    for (const region of regions) {
      const faith = dominantByRegion.get(region.id);
      if (faith?.familyId === defendFaith.familyId) defenderFamilyRegions.push(region);
      if (faith?.familyId === attackFaith.familyId) attackerFamilyRegions.push(region);
    }
    for (const observer of defenderFamilyRegions) for (const target of attackerFamilyRegions) {
      const targetFaith = dominantByRegion.get(target.id);
      const specific = targetFaith?.id === attackFaith.id ? 1.5 : 1;
      changeAttitude(observer, target.id, -0.015 * specific, 'religious_solidarity', currentTick);
    }
  }
}

function issueDirective(world, religion, type, targetFamilyId, currentTick) {
  const directive = { id: world.nextDirectiveId++, religionId: religion.id, type, targetFamilyId,
    issuedTick: currentTick, expiresTick: currentTick + DIRECTIVE_INTERVAL };
  world.directives.push(directive);
  if (religion.leader) religion.leader.currentDirectiveId = directive.id;
  return directive;
}

function updateLeaders(world, currentTick, weekScale = 1) {
  const issued = [];
  for (const religion of world.religions) {
    if (!religion.leader) continue;
    const current = world.directives.find((item) => item.id === religion.leader.currentDirectiveId && item.expiresTick > currentTick);
    if (current || currentTick - (religion.lastDirectiveTick || 0) < DIRECTIVE_INTERVAL) continue;
    const grievances = Object.entries(world.grievances).filter(([key]) => key.startsWith(`${religion.familyId}|`))
      .sort((a, b) => b[1] - a[1]);
    if (grievances[0]?.[1] >= 3) issued.push(issueDirective(world, religion, 'holy_war', grievances[0][0].split('|')[1], currentTick));
    else if (grievances[0]) issued.push(issueDirective(world, religion, 'peace', grievances[0][0].split('|')[1], currentTick));
    religion.lastDirectiveTick = currentTick;
  }
  for (const key of Object.keys(world.grievances)) world.grievances[key] *= Math.pow(0.999, weekScale);
  return issued;
}

function applyReligionPolitics(region, world, currentTick, weekScale = 1) {
  const state = ensureRegionReligion(region, world);
  const officialShare = state.stateReligionId ? state.shares[state.stateReligionId] || 0 : 0;
  const minority = state.stateReligionId ? 1 - officialShare : 0;
  let directivePenalty = 0;
  const official = religionById(world, state.stateReligionId);
  const directive = official?.leader && world.directives.find((item) =>
    item.id === official.leader.currentDirectiveId && item.expiresTick > currentTick);
  if (directive) {
    const lastAttack = state.conflictHistory[directive.targetFamilyId] ?? -Infinity;
    const obeyed = currentTick - lastAttack <= 104;
    if ((directive.type === 'holy_war' && !obeyed) || (directive.type === 'peace' && obeyed)) directivePenalty = 0.0003 * officialShare;
  }
  const targetUnrest = clamp(minority * (1 - state.tolerance) * 0.45 + directivePenalty * 100);
  const unrestAdjustment = 1 - Math.pow(1 - 0.02, weekScale);
  state.unrest += (targetUnrest - state.unrest) * unrestAdjustment;
  region.stability = clamp((region.stability ?? 1) - state.unrest * 0.00015 * weekScale);
}

export function influenceReligiousLeader(region, world, religionId, type, targetFamilyId, spend, currentTick, rng = Math.random) {
  const religion = religionById(world, religionId);
  const amount = Math.min(Math.max(0, Number(spend) || 0), region.treasury || 0);
  if (!religion?.leader || !['holy_war', 'peace'].includes(type) || !targetFamilyId || amount < 5) return { accepted: false };
  region.treasury -= amount;
  const localShare = religionShare(region, religionId, world);
  const holyCity = religion.holyCityRegionId === region.id ? 0.25 : 0;
  const chance = clamp(0.08 + Math.log10(amount + 1) * 0.12 + localShare * 0.3 + holyCity - religion.authority * 0.15);
  religion.leader.influence[region.id] = (religion.leader.influence[region.id] || 0) + amount;
  if (rng() >= chance) {
    religion.leader.opinionOfRegions[region.id] = clamp((religion.leader.opinionOfRegions[region.id] || 0) - 0.03, -1, 1);
    return { accepted: false, chance };
  }
  religion.leader.opinionOfRegions[region.id] = clamp((religion.leader.opinionOfRegions[region.id] || 0) + 0.08, -1, 1);
  religion.lastDirectiveTick = currentTick;
  return { accepted: true, chance, directive: issueDirective(world, religion, type, targetFamilyId, currentTick) };
}

export function religiousWarModifier(region, target, world, currentTick) {
  const official = religionById(world, region.religion?.stateReligionId);
  const targetFaith = dominantReligion(target, world);
  if (!official?.leader || !targetFaith) return 1;
  const directive = world.directives.find((item) => item.id === official.leader.currentDirectiveId && item.expiresTick > currentTick);
  if (!directive || directive.targetFamilyId !== targetFaith.familyId) return 1;
  return directive.type === 'holy_war' ? 1.8 : 0.25;
}

export function chooseAiReligion(region, world, currentTick, rng = Math.random, weekScale = 1) {
  const chance = (weekly) => 1 - Math.pow(1 - weekly, Math.max(0.01, weekScale));
  const state = ensureRegionReligion(region, world);
  const dominant = dominantReligion(region, world);
  if (!dominant) return;
  const share = state.shares[dominant.id] || 0;
  if (!state.stateReligionId && share >= 0.62 && rng() < chance(0.0008)) state.stateReligionId = dominant.id;
  if (state.stateReligionId && (state.shares[state.stateReligionId] || 0) < 0.18 && rng() < chance(0.01)) {
    state.stateReligionId = share >= 0.45 ? dominant.id : null;
  }
  if (state.unrest > 0.16) state.tolerance = clamp(state.tolerance + 0.002 * weekScale);
  else if (state.stateReligionId && share > 0.8) state.tolerance = clamp(state.tolerance - 0.0002 * weekScale);
  if (!dominant.adminCentreRegionId && dominant.holyCityRegionId === region.id && rng() < chance(0.001)) {
    establishReligiousCentre(region, world, dominant.id);
  }
  if (state.stateReligionId && share > 0.7 && region.population > 8000 && rng() < chance(0.000002)) {
    forkReligion(region, world, currentTick);
  }
}

export function migrateReligion(source, destination, count, world) {
  if (!world || count <= 0 || source.population <= 0) return;
  const sourceState = ensureRegionReligion(source, world); const destinationState = ensureRegionReligion(destination, world);
  const oldDestinationPopulation = Math.max(0, destination.population || 0);
  const newTotal = oldDestinationPopulation + count;
  for (const id of new Set([...Object.keys(sourceState.shares), ...Object.keys(destinationState.shares)])) {
    destinationState.shares[id] = ((destinationState.shares[id] || 0) * oldDestinationPopulation +
      (sourceState.shares[id] || 0) * count) / Math.max(1, newTotal);
  }
  normaliseShares(destinationState);
}

export function tickReligion(regions, world, currentTick, raids = [], campaigns = [], rng = Math.random, elapsedDays = 7) {
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const variantChance = 1 - Math.pow(1 - VARIANT_CHANCE_PER_WEEK, weekScale);
  ensureReligiousWorld(world);
  for (const region of regions) ensureRegionReligion(region, world);
  const cache = buildReligionTickCache(regions, world);
  spreadThroughTrade(regions, world, currentTick, cache, weekScale);
  observeConflicts(regions, world, raids, campaigns, currentTick, cache);
  const issued = updateLeaders(world, currentTick, weekScale);
  const events = [];
  for (const directive of issued) for (const region of regions) {
    if (region.religion.stateReligionId === directive.religionId) {
      const faith = religionById(world, directive.religionId);
      const target = religionById(world, directive.targetFamilyId);
      events.push({ type: 'religious_directive', regionId: region.id, regionName: region.name, directive,
        faithName: faith?.name, leaderName: faith?.leader?.name, targetFaithName: target?.name });
    }
  }
  for (const region of regions) {
    stateSponsorship(region, world, weekScale);
    applyReligionPolitics(region, world, currentTick, weekScale);
    const dominant = dominantReligion(region, world);
    if (dominant && region.population >= 5000 && rng() < variantChance) {
      const variant = createVariant(world, dominant, region, currentTick, null, SPREAD_LOCAL);
      shiftShare(region, dominant.id, variant.id, 0.04, world);
      events.push({ type: 'religious_variant', regionId: region.id, regionName: region.name, religion: variant });
    }
    // Monthly ticks can skip an exact modulo boundary; pruning is cheap and
    // doing it every base tick preserves the bounded-share invariant.
    pruneShares(region.religion);
  }
  const living = new Set(regions.flatMap((region) => Object.keys(region.religion.shares)));
  for (const religion of world.religions) religion.active = living.has(religion.id);
  return events;
}
