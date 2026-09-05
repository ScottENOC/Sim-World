import { changeAttitude } from '../diplomacy/relations.js?v=20260905-religion1';

const TRADE_CONVERSION_RATE = 0.00045;
const STATE_SUPPORT_RATE = 0.0003;
const VARIANT_CHANCE_PER_WEEK = 0.000004;
const DIRECTIVE_INTERVAL = 260;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

function traditionName(region) {
  const stem = region.name.replace(/[^A-Za-zÀ-ÿ' -]/g, '').trim();
  return `${stem} Tradition`;
}

function leaderName(religion) {
  const stem = religion.name.replace(/ Tradition| Reform| Communion/g, '');
  return `Keeper of ${stem}`;
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
  }
  normaliseShares(state);
  return state;
}

export function initialiseReligions(regions, world = createReligiousWorld()) {
  ensureReligiousWorld(world);
  if (world.religions.length > 0) {
    for (const region of regions) ensureRegionReligion(region, world);
    return world;
  }
  for (const region of regions) {
    const id = `religion_${world.nextReligionId++}`;
    world.religions.push({ id, name: traditionName(region), parentId: null, familyId: id,
      holyCityRegionId: region.id, adminCentreRegionId: null, foundedTick: 0,
      authority: 0.08, leader: null, active: true });
    region.religion = { shares: { [id]: 1 }, stateReligionId: null, tolerance: 0.65,
      unrest: 0, conflictHistory: {} };
    if (region.cultureGroups?.[0]) region.cultureGroups[0].religionId = id;
  }
  return world;
}

function normaliseShares(state) {
  for (const [id, share] of Object.entries(state.shares)) {
    if (!Number.isFinite(share) || share < 0.0001) delete state.shares[id];
  }
  const total = Object.values(state.shares).reduce((sum, value) => sum + value, 0);
  if (total > 0) for (const id of Object.keys(state.shares)) state.shares[id] /= total;
}

export function religionById(world, id) {
  return ensureReligiousWorld(world).religions.find((religion) => religion.id === id) || null;
}

export function dominantReligion(region, world) {
  const state = ensureRegionReligion(region, world);
  const entry = Object.entries(state.shares).sort((a, b) => b[1] - a[1])[0];
  return entry ? religionById(world, entry[0]) : null;
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

function createVariant(world, parent, region, currentTick, name = null) {
  const id = `religion_${world.nextReligionId++}`;
  const safeName = String(name || `${region.name} Reform`).replace(/[<>&"']/g, '').trim().slice(0, 60);
  const religion = { id, name: safeName || `${region.name} Reform`, parentId: parent.id,
    familyId: parent.familyId, holyCityRegionId: region.id, adminCentreRegionId: null,
    foundedTick: currentTick, authority: 0.04, leader: null, active: true };
  world.religions.push(religion);
  return religion;
}

export function forkReligion(region, world, currentTick, name = null) {
  const parent = dominantReligion(region, world);
  if (!parent || (region.religion.shares[parent.id] || 0) < 0.35 || (region.treasury || 0) < 25) return null;
  region.treasury -= 25;
  const variant = createVariant(world, parent, region, currentTick, name);
  const seed = Math.min(0.18, region.religion.shares[parent.id] * 0.25);
  region.religion.shares[parent.id] -= seed;
  region.religion.shares[variant.id] = seed;
  region.religion.stateReligionId = variant.id;
  region.religion.unrest = clamp(region.religion.unrest + 0.08);
  normaliseShares(region.religion);
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
  normaliseShares(state);
}

function spreadThroughTrade(regions, world, currentTick) {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const followers = {};
  for (const region of regions) for (const [religionId, share] of Object.entries(region.religion?.shares || {})) {
    followers[religionId] = (followers[religionId] || 0) + (region.population || 0) * share;
  }
  const seen = new Set();
  for (const region of regions) for (const [partnerId, tick] of region.recentTradePartners || []) {
    if (currentTick - tick > 8) continue;
    const partner = byId.get(partnerId);
    if (!partner) continue;
    const key = [region.id, partner.id].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const a = dominantReligion(region, world); const b = dominantReligion(partner, world);
    const aMission = religionById(world, region.religion.stateReligionId) || a;
    const bMission = religionById(world, partner.religion.stateReligionId) || b;
    if (!a || !b || !aMission || !bMission || (a.id === bMission.id && b.id === aMission.id)) continue;
    const aWeight = Math.sqrt((followers[aMission.id] || 0) + 1) *
      (region.religion.stateReligionId === aMission.id ? 1.5 : 1) * (1 + aMission.authority);
    const bWeight = Math.sqrt((followers[bMission.id] || 0) + 1) *
      (partner.religion.stateReligionId === bMission.id ? 1.5 : 1) * (1 + bMission.authority);
    const total = aWeight + bWeight;
    shiftShare(region, a.id, bMission.id, TRADE_CONVERSION_RATE * bWeight / total, world);
    shiftShare(partner, b.id, aMission.id, TRADE_CONVERSION_RATE * aWeight / total, world);
  }
}

function stateSponsorship(region, world) {
  const state = ensureRegionReligion(region, world);
  const official = state.stateReligionId;
  if (!official || !state.shares[official]) return;
  const rivals = Object.entries(state.shares).filter(([id]) => id !== official).sort((a, b) => b[1] - a[1]);
  if (rivals[0]) shiftShare(region, rivals[0][0], official,
    STATE_SUPPORT_RATE * (0.4 + (1 - state.tolerance)) * state.shares[official], world);
}

function observeConflicts(regions, world, raids, campaigns, currentTick) {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const conflicts = [...(raids || []).map((item) => ({ key: `raid:${item.id}`, item })),
    ...(campaigns || []).map((item) => ({ key: `campaign:${item.id}`, item }))];
  for (const { key, item } of conflicts) {
    if (world.observedConflicts.has(key)) continue;
    world.observedConflicts.add(key);
    const attacker = byId.get(item.attackerId); const defender = byId.get(item.defenderId);
    const attackFaith = attacker && dominantReligion(attacker, world);
    const defendFaith = defender && dominantReligion(defender, world);
    if (!attacker || !defender || !attackFaith || !defendFaith || attackFaith.familyId === defendFaith.familyId) continue;
    const grievanceKey = `${defendFaith.familyId}|${attackFaith.familyId}`;
    world.grievances[grievanceKey] = (world.grievances[grievanceKey] || 0) +
      Math.max(1, (item.initialPersonnel || item.personnel || 0) / 500);
    attacker.religion.conflictHistory[defendFaith.familyId] = currentTick;
    for (const religion of world.religions) if (religion.familyId === defendFaith.familyId && religion.leader) {
      religion.leader.opinionOfRegions[attacker.id] = clamp(
        (religion.leader.opinionOfRegions[attacker.id] || 0) - (attackFaith.id === defendFaith.id ? 0.08 : 0.12), -1, 1);
    }
    for (const observer of regions) {
      const observerFaith = dominantReligion(observer, world);
      if (observerFaith?.familyId !== defendFaith.familyId) continue;
      for (const target of regions) {
        const targetFaith = dominantReligion(target, world);
        if (targetFaith?.familyId !== attackFaith.familyId) continue;
        const specific = targetFaith.id === attackFaith.id ? 1.5 : 1;
        changeAttitude(observer, target.id, -0.015 * specific, 'religious_solidarity', currentTick);
      }
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

function updateLeaders(world, currentTick) {
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
  for (const key of Object.keys(world.grievances)) world.grievances[key] *= 0.999;
  return issued;
}

function applyReligionPolitics(region, world, currentTick) {
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
  state.unrest += (targetUnrest - state.unrest) * 0.02;
  region.stability = clamp((region.stability ?? 1) - state.unrest * 0.00015);
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

export function chooseAiReligion(region, world, currentTick, rng = Math.random) {
  const state = ensureRegionReligion(region, world);
  const dominant = dominantReligion(region, world);
  if (!dominant) return;
  const share = state.shares[dominant.id] || 0;
  if (!state.stateReligionId && share >= 0.62 && rng() < 0.0008) state.stateReligionId = dominant.id;
  if (state.stateReligionId && (state.shares[state.stateReligionId] || 0) < 0.18 && rng() < 0.01) {
    state.stateReligionId = share >= 0.45 ? dominant.id : null;
  }
  if (state.unrest > 0.16) state.tolerance = clamp(state.tolerance + 0.002);
  else if (state.stateReligionId && share > 0.8) state.tolerance = clamp(state.tolerance - 0.0002);
  if (!dominant.adminCentreRegionId && dominant.holyCityRegionId === region.id && rng() < 0.001) {
    establishReligiousCentre(region, world, dominant.id);
  }
  if (state.stateReligionId && share > 0.7 && region.population > 8000 && rng() < 0.000002) {
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

export function tickReligion(regions, world, currentTick, raids = [], campaigns = [], rng = Math.random) {
  ensureReligiousWorld(world);
  for (const region of regions) ensureRegionReligion(region, world);
  spreadThroughTrade(regions, world, currentTick);
  observeConflicts(regions, world, raids, campaigns, currentTick);
  const issued = updateLeaders(world, currentTick);
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
    stateSponsorship(region, world);
    applyReligionPolitics(region, world, currentTick);
    const dominant = dominantReligion(region, world);
    if (dominant && region.population >= 5000 && rng() < VARIANT_CHANCE_PER_WEEK) {
      const variant = createVariant(world, dominant, region, currentTick);
      shiftShare(region, dominant.id, variant.id, 0.04, world);
      events.push({ type: 'religious_variant', regionId: region.id, regionName: region.name, religion: variant });
    }
  }
  const living = new Set(regions.flatMap((region) => Object.keys(region.religion.shares)));
  for (const religion of world.religions) religion.active = living.has(religion.id);
  return events;
}
