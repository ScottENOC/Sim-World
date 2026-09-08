import { attitudeToward, changeAttitude } from './relations.js?v=20260904-save1';
import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';

let nextMessageId = 1;
export function syncNextDiplomaticMessageId(regions = []) {
  let maxId = 0;
  for (const region of regions) for (const msg of region.diplomaticMessages || []) maxId = Math.max(maxId, Number(String(msg.id || '').replace(/\D/g, '')) || 0);
  nextMessageId = maxId + 1;
}

function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id; }
function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }

function ensureMailbox(region) {
  if (!Array.isArray(region.diplomaticMessages)) region.diplomaticMessages = [];
  return region.diplomaticMessages;
}

function landRoute(origin, target, regionsById, maxHops = 14) {
  if (origin.id === target.id) return [origin.id];
  const queue = [[origin.id]];
  const seen = new Set([origin.id]);
  while (queue.length) {
    const path = queue.shift();
    if (path.length > maxHops + 1) continue;
    const here = regionsById.get(path[path.length - 1]);
    for (const nextId of here?.neighbors || []) {
      if (seen.has(nextId)) continue;
      const nextPath = [...path, nextId];
      if (nextId === target.id) return nextPath;
      seen.add(nextId); queue.push(nextPath);
    }
  }
  return null;
}

function routeFor(origin, target, regionsById) {
  const land = landRoute(origin, target, regionsById);
  const sea = maritimeRouteBetween(origin, target);
  if (!land && !sea) return null;
  const landDays = land ? Math.max(2, (land.length - 1) * 4) : Infinity;
  const seaDays = sea ? Math.max(3, sea.seaIds.length * 3 + (sea.physicalFriction || 0) * 8) : Infinity;
  if (seaDays < landDays) return { mode: 'sea', seaIds: sea.seaIds, passageIds: sea.passageIds || [], days: seaDays };
  return { mode: 'land', regionIds: land, days: landDays };
}

function routeRisk(route, regionsById, fleets, senderActorId, targetActorId) {
  if (!route) return { interceptChance: 1, hostileActors: [] };
  let risk = 0; const hostileActors = new Set();
  if (route.mode === 'land') {
    const mids = (route.regionIds || []).slice(1, -1);
    for (const id of mids) {
      const region = regionsById.get(id); if (!region) continue;
      const safety = clamp(region.safetyRating ?? 1);
      risk += (1 - safety) * 0.08 + clamp(region.conflictPressure || 0) * 0.16;
      const controller = actorId(region);
      if (controller && controller !== senderActorId && controller !== targetActorId) {
        const senderRegion = [...regionsById.values()].find((r) => actorId(r) === senderActorId);
        if (senderRegion && attitudeToward(senderRegion, region.id) < -0.45) {
          risk += 0.12; hostileActors.add(controller);
        }
      }
    }
  } else {
    for (const fleet of fleets || []) {
      if (fleet.locationType !== 'sea' || !route.seaIds?.includes(fleet.seaRegionId)) continue;
      if (fleet.ownerActorId === senderActorId || fleet.ownerActorId === targetActorId) continue;
      const owner = [...regionsById.values()].find((r) => actorId(r) === fleet.ownerActorId);
      const senderRegion = [...regionsById.values()].find((r) => actorId(r) === senderActorId);
      const hostile = senderRegion && owner ? attitudeToward(senderRegion, owner.id) < -0.35 : false;
      if (!hostile) continue;
      const missionFactor = fleet.mission === 'intercept' ? 0.18 : fleet.mission === 'patrol' ? 0.12 : fleet.mission === 'blockade' ? 0.15 : 0.05;
      risk += missionFactor * Math.min(1.5, Math.log2(1 + (fleet.ships?.length || 0)) / 2);
      hostileActors.add(fleet.ownerActorId);
    }
  }
  return { interceptChance: clamp(risk, 0, 0.8), hostileActors: [...hostileActors] };
}

export function sendWarInvitation(sender, target, enemy, regions, currentTick, options = {}) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(sender, target, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  ensureMailbox(sender); ensureMailbox(target);
  const message = {
    id: `dmsg-${nextMessageId++}`,
    type: 'join_war',
    senderRegionId: sender.id,
    senderActorId: actorId(sender),
    targetRegionId: target.id,
    targetActorId: actorId(target),
    enemyRegionId: enemy.id,
    enemyActorId: actorId(enemy),
    requestedPersonnel: Math.max(0, Math.round(options.requestedPersonnel || 0)),
    secrecy: clamp(options.secrecy ?? 0.4),
    departTick: currentTick,
    arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)),
    route,
    status: 'in_transit',
    intercepted: false,
    compromised: false,
    destroyed: false,
    response: null,
  };
  sender.diplomaticMessages.push(message);
  return { sent: true, message };
}

function acceptanceChance(message, sender, target, enemy) {
  const attitude = clamp((attitudeToward(target, sender.id) + 1) / 2);
  const enemyAttitude = enemy ? clamp((-attitudeToward(target, enemy.id) + 1) / 2) : 0.5;
  const available = Math.max(0, target.army?.personnel || 0);
  const requestedBurden = message.requestedPersonnel > 0 ? clamp(message.requestedPersonnel / Math.max(1, available)) : 0.35;
  const safety = clamp(target.safetyRating ?? 1);
  return clamp(0.08 + attitude * 0.44 + enemyAttitude * 0.3 + safety * 0.12 - requestedBurden * 0.28);
}

function createWarCommitment(message, sender, target, agreements, currentTick) {
  const existing = agreements.find((a) => a.active && a.type === 'war_commitment' &&
    ((a.fromId === target.id && a.toId === sender.id) || (a.fromId === sender.id && a.toId === target.id)) && a.enemyActorId === message.enemyActorId);
  if (existing) return existing;
  const available = Math.max(0, target.army?.personnel || 0);
  const personnel = Math.max(10, Math.min(available * 0.45, message.requestedPersonnel || available * 0.2));
  const agreement = {
    id: `war-${message.id}`,
    type: 'war_commitment',
    fromId: target.id,
    toId: sender.id,
    enemyActorId: message.enemyActorId,
    personnel: Math.round(personnel),
    startTick: currentTick,
    active: true,
    endedTick: null,
    sourceMessageId: message.id,
  };
  agreements.push(agreement);
  return agreement;
}

export function tickDiplomaticCouriers(regions, agreements, fleets, currentTick, elapsedDays = 7, rng = Math.random) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const events = [];
  for (const sender of regions) {
    ensureMailbox(sender);
    for (const message of sender.diplomaticMessages) {
      if (message.status !== 'in_transit') continue;
      const target = regionsById.get(message.targetRegionId);
      const enemy = regionsById.get(message.enemyRegionId);
      if (!target) { message.status = 'failed'; continue; }
      const risk = routeRisk(message.route, regionsById, fleets, message.senderActorId, message.targetActorId);
      const weeks = Math.max(0.01, elapsedDays / 7);
      const secrecyReduction = 1 - message.secrecy * 0.55;
      const tickIntercept = 1 - Math.pow(1 - risk.interceptChance * secrecyReduction, weeks);
      if (!message.intercepted && rng() < tickIntercept) {
        message.intercepted = true;
        message.compromised = true;
        const interceptingActorId = risk.hostileActors.length ? risk.hostileActors[Math.floor(rng() * risk.hostileActors.length)] : null;
        const destroyed = rng() < 0.38;
        message.destroyed = destroyed;
        if (destroyed) message.status = 'intercepted_lost';
        events.push({ type: 'diplomatic_message_intercepted', message, interceptingActorId, destroyed });
        if (destroyed) continue;
      }
      if (currentTick < message.arrivalTick) continue;
      const chance = acceptanceChance(message, sender, target, enemy);
      const accepted = rng() < chance;
      message.status = accepted ? 'accepted' : 'refused';
      message.response = { accepted, chance, tick: currentTick };
      let agreement = null;
      if (accepted) {
        agreement = createWarCommitment(message, sender, target, agreements, currentTick);
        if (!target.militaryStrategy || typeof target.militaryStrategy !== 'object') target.militaryStrategy = {};
        target.militaryStrategy.posture = 'prepare_war';
        target.militaryStrategy.targetRegionId = enemy?.id || message.enemyRegionId;
        target.militaryStrategy.targetPolityId = message.enemyActorId;
        target.militaryStrategy.garrisonFloor = Math.min(0.85, Math.max(0.45, Number(target.militaryStrategy.garrisonFloor) || 0.7));
        target.militaryStrategy.spendingPriority = Math.max(0.6, Number(target.militaryStrategy.spendingPriority) || 0);
        target.militaryStrategy.desiredPreparationWeeks = Math.min(26, Math.max(8, Number(target.militaryStrategy.desiredPreparationWeeks) || 20));
        changeAttitude(sender, target.id, 0.08, 'joined_war', currentTick);
        changeAttitude(target, sender.id, 0.12, 'joined_war', currentTick);
      } else {
        changeAttitude(sender, target.id, -0.025, 'refused_join_war', currentTick);
      }
      events.push({ type: 'join_war_response', message, accepted, agreement, targetName: target.name, enemyName: enemy?.name || message.enemyActorId });
    }
  }
  return events;
}
