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

export function sendJointOperationProposal(sender, target, enemy, regions, currentTick, options = {}) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(sender, target, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  ensureMailbox(sender); ensureMailbox(target);
  const leadWeeks = Math.max(2, Math.round(options.leadWeeks ?? 12));
  const statedFraction = clamp(options.commitmentFraction ?? 0.55, 0.1, 0.95);
  const message = {
    id: `dmsg-${nextMessageId++}`, type: 'joint_operation_proposal',
    senderRegionId: sender.id, senderActorId: actorId(sender),
    targetRegionId: target.id, targetActorId: actorId(target),
    enemyRegionId: enemy.id, enemyActorId: actorId(enemy),
    proposedAttackTick: Math.max(currentTick + 2, Math.round(options.attackTick ?? currentTick + leadWeeks)),
    objective: options.objective || 'subjugation', subregionalObjective: options.subregionalObjective || 'capital',
    declaredCommitmentFraction: statedFraction,
    privateIntent: {
      honour: options.honour !== false,
      commitmentFraction: clamp(options.actualCommitmentFraction ?? statedFraction, 0, 0.95),
      delayWeeks: Math.max(0, Math.round(options.delayWeeks || 0)),
    },
    secrecy: clamp(options.secrecy ?? 0.65), departTick: currentTick,
    arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,
    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,
  };
  sender.diplomaticMessages.push(message);
  return { sent: true, message };
}

function jointOperationAcceptance(message, sender, target, enemy) {
  const friend = clamp((attitudeToward(target, sender.id) + 1) / 2);
  const enemyHostility = enemy ? clamp((-attitudeToward(target, enemy.id) + 1) / 2) : 0.45;
  const readiness = clamp((target.army?.personnel || 0) / Math.max(100, (target.population || 1) * 0.012));
  const warning = clamp((message.proposedAttackTick - message.arrivalTick) / 20);
  return clamp(0.06 + friend * 0.38 + enemyHostility * 0.28 + readiness * 0.16 + warning * 0.12);
}

function choosePrivateJointIntent(message, sender, target, enemy, rng) {
  const loyalty = clamp((attitudeToward(target, sender.id) + 1) / 2);
  const enemyFear = enemy ? clamp((-attitudeToward(target, enemy.id) + 1) / 2) : 0.4;
  const honourChance = clamp(0.18 + loyalty * 0.48 + enemyFear * 0.30);
  const honour = rng() < honourChance;
  const declared = clamp(message.declaredCommitmentFraction || 0.5, 0.1, 0.95);
  const actual = honour ? clamp(declared * (0.62 + rng() * 0.5), 0.08, 0.95) : clamp(declared * rng() * 0.18, 0, 0.15);
  const delayWeeks = honour ? (rng() < 0.18 ? 1 + Math.floor(rng() * 3) : 0) : Math.floor(rng() * 5);
  return { honour, commitmentFraction: actual, delayWeeks, honourChance };
}

function recordDiplomaticIntelligence(region, entry) {
  if (!region) return;
  region.diplomaticIntelligence ||= [];
  region.diplomaticIntelligence.push(entry);
  if (region.diplomaticIntelligence.length > 40) region.diplomaticIntelligence.shift();
}

function maybeLeakJointPlan(message, sender, target, enemy, currentTick, rng, events) {
  if (!enemy) return false;
  const likesEnemy = clamp((attitudeToward(target, enemy.id) + 1) / 2);
  const dislikesSender = clamp((-attitudeToward(target, sender.id) + 1) / 2);
  const chance = clamp(likesEnemy * 0.16 + dislikesSender * 0.22 - message.secrecy * 0.12, 0, 0.32);
  if (rng() >= chance) return false;
  recordDiplomaticIntelligence(enemy, {
    type: 'joint_operation_leak', sourceRegionId: target.id, senderActorId: message.senderActorId,
    partnerActorId: message.targetActorId, attackTick: message.proposedAttackTick,
    objective: message.objective, learnedTick: currentTick, sourceMessageId: message.id,
  });
  events.push({ type: 'joint_operation_leaked_to_enemy', message, leakingRegionId: target.id, enemyRegionId: enemy.id });
  return true;
}

function createJointOperationAgreement(message, sender, target, agreements, currentTick, partnerIntent) {
  const agreement = {
    id: `joint-${message.id}`, type: 'joint_operation', active: true,
    proposerRegionId: sender.id, partnerRegionId: target.id,
    proposerActorId: message.senderActorId, partnerActorId: message.targetActorId,
    enemyRegionId: message.enemyRegionId, enemyActorId: message.enemyActorId,
    attackTick: message.proposedAttackTick, objective: message.objective,
    subregionalObjective: message.subregionalObjective,
    proposerDeclaredFraction: message.declaredCommitmentFraction,
    partnerDeclaredFraction: clamp(message.declaredCommitmentFraction * (0.75 + partnerIntent.commitmentFraction * 0.45), 0.1, 0.95),
    proposerPrivateIntent: message.privateIntent,
    partnerPrivateIntent: partnerIntent,
    createdTick: currentTick, sourceMessageId: message.id, execution: {},
  };
  agreements.push(agreement);
  return agreement;
}

function sendJointOperationReply(original, sender, target, accepted, agreement, regionsById, currentTick) {
  const route = routeFor(target, sender, regionsById);
  if (!route) return null;
  const reply = {
    id: `dmsg-${nextMessageId++}`, type: 'joint_operation_reply',
    senderRegionId: target.id, senderActorId: actorId(target),
    targetRegionId: sender.id, targetActorId: actorId(sender),
    enemyRegionId: original.enemyRegionId, enemyActorId: original.enemyActorId,
    inReplyTo: original.id, accepted, jointOperationId: agreement?.id || null,
    declaredCommitmentFraction: agreement?.partnerDeclaredFraction || 0,
    proposedAttackTick: original.proposedAttackTick, secrecy: original.secrecy,
    departTick: currentTick, arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,
    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,
  };
  target.diplomaticMessages.push(reply);
  return reply;
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
        const interceptorRegion = [...regionsById.values()].find((r) => actorId(r) === interceptingActorId);
        if (interceptorRegion && ['joint_operation_proposal','joint_operation_reply'].includes(message.type)) {
          recordDiplomaticIntelligence(interceptorRegion, { type: 'intercepted_joint_operation', senderActorId: message.senderActorId,
            targetActorId: message.targetActorId, enemyActorId: message.enemyActorId, attackTick: message.proposedAttackTick,
            accepted: message.accepted ?? null, learnedTick: currentTick, sourceMessageId: message.id });
        }
        events.push({ type: 'diplomatic_message_intercepted', message, interceptingActorId, destroyed });
        if (destroyed) continue;
      }
      if (currentTick < message.arrivalTick) continue;
      if (message.type === 'joint_operation_reply') {
        message.status = 'delivered';
        message.response = { delivered: true, tick: currentTick, accepted: message.accepted };
        recordDiplomaticIntelligence(target, { type: 'joint_operation_reply_received', jointOperationId: message.jointOperationId,
          senderActorId: message.senderActorId, targetActorId: message.targetActorId, enemyActorId: message.enemyActorId,
          attackTick: message.proposedAttackTick, accepted: message.accepted, declaredCommitmentFraction: message.declaredCommitmentFraction,
          learnedTick: currentTick, sourceMessageId: message.id });
        events.push({ type: 'joint_operation_reply_delivered', message, accepted: message.accepted, jointOperationId: message.jointOperationId });
        continue;
      }
      if (message.type === 'joint_operation_proposal') {
        const chance = jointOperationAcceptance(message, sender, target, enemy);
        const accepted = rng() < chance;
        message.status = accepted ? 'accepted_pending_reply' : 'refused_pending_reply';
        const partnerIntent = choosePrivateJointIntent(message, sender, target, enemy, rng);
        let agreement = null;
        if (accepted) {
          agreement = createJointOperationAgreement(message, sender, target, agreements, currentTick, partnerIntent);
          target.militaryStrategy ||= {};
          target.militaryStrategy.posture = 'prepare_war';
          target.militaryStrategy.targetRegionId = enemy?.id || message.enemyRegionId;
          target.militaryStrategy.targetPolityId = message.enemyActorId;
          target.militaryStrategy.desiredPreparationWeeks = Math.max(1, message.proposedAttackTick - currentTick);
          maybeLeakJointPlan(message, sender, target, enemy, currentTick, rng, events);
        }
        const reply = sendJointOperationReply(message, sender, target, accepted, agreement, regionsById, currentTick);
        message.response = { accepted, chance, tick: currentTick, replyMessageId: reply?.id || null };
        events.push({ type: 'joint_operation_response_sent', message, accepted, agreement, reply });
        continue;
      }
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
