from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        if new in text:
            return
        raise SystemExit(f'anchor not found in {path}: {old[:80]!r}')
    p.write_text(text.replace(old, new, 1))

# --- couriers: negotiated operations, replies, interception intelligence, leaks ---
p = Path('js/diplomacy/couriers.js')
text = p.read_text()
anchor = "export function sendWarInvitation(sender, target, enemy, regions, currentTick, options = {}) {"
insert = r'''export function sendJointOperationProposal(sender, target, enemy, regions, currentTick, options = {}) {
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

'''
if insert not in text:
    text = text.replace(anchor, insert + anchor, 1)

# Interception should reveal useful intelligence to the interceptor.
old = """        events.push({ type: 'diplomatic_message_intercepted', message, interceptingActorId, destroyed });\n        if (destroyed) continue;"""
new = """        const interceptorRegion = [...regionsById.values()].find((r) => actorId(r) === interceptingActorId);\n        if (interceptorRegion && ['joint_operation_proposal','joint_operation_reply'].includes(message.type)) {\n          recordDiplomaticIntelligence(interceptorRegion, { type: 'intercepted_joint_operation', senderActorId: message.senderActorId,\n            targetActorId: message.targetActorId, enemyActorId: message.enemyActorId, attackTick: message.proposedAttackTick,\n            accepted: message.accepted ?? null, learnedTick: currentTick, sourceMessageId: message.id });\n        }\n        events.push({ type: 'diplomatic_message_intercepted', message, interceptingActorId, destroyed });\n        if (destroyed) continue;"""
if old in text:
    text = text.replace(old, new, 1)

# Branch before legacy join-war resolution.
old = """      if (currentTick < message.arrivalTick) continue;\n      const chance = acceptanceChance(message, sender, target, enemy);"""
new = """      if (currentTick < message.arrivalTick) continue;\n      if (message.type === 'joint_operation_reply') {\n        message.status = 'delivered';\n        message.response = { delivered: true, tick: currentTick, accepted: message.accepted };\n        events.push({ type: 'joint_operation_reply_delivered', message, accepted: message.accepted, jointOperationId: message.jointOperationId });\n        continue;\n      }\n      if (message.type === 'joint_operation_proposal') {\n        const chance = jointOperationAcceptance(message, sender, target, enemy);\n        const accepted = rng() < chance;\n        message.status = accepted ? 'accepted_pending_reply' : 'refused_pending_reply';\n        const partnerIntent = choosePrivateJointIntent(message, sender, target, enemy, rng);\n        let agreement = null;\n        if (accepted) {\n          agreement = createJointOperationAgreement(message, sender, target, agreements, currentTick, partnerIntent);\n          target.militaryStrategy ||= {};\n          target.militaryStrategy.posture = 'prepare_war';\n          target.militaryStrategy.targetRegionId = enemy?.id || message.enemyRegionId;\n          target.militaryStrategy.targetPolityId = message.enemyActorId;\n          target.militaryStrategy.desiredPreparationWeeks = Math.max(1, message.proposedAttackTick - currentTick);\n          maybeLeakJointPlan(message, sender, target, enemy, currentTick, rng, events);\n        }\n        const reply = sendJointOperationReply(message, sender, target, accepted, agreement, regionsById, currentTick);\n        message.response = { accepted, chance, tick: currentTick, replyMessageId: reply?.id || null };\n        events.push({ type: 'joint_operation_response_sent', message, accepted, agreement, reply });\n        continue;\n      }\n      const chance = acceptanceChance(message, sender, target, enemy);"""
if old not in text and new not in text:
    raise SystemExit('courier arrival anchor missing')
text = text.replace(old, new, 1) if old in text else text
p.write_text(text)

# --- nation AI: execute plans when due ---
p = Path('js/ai/nationAi.js')
text = p.read_text()
old = "import { coordinateExpeditionRelief } from '../military/expeditionReliefAi.js?v=20260909-relief1';"
new = old + "\nimport { activateJointOperations } from '../military/jointOperations.js?v=20260909-joint-ops1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options);\n  for (const region of regions) {"""
new = """  manageCampaigns(activeCampaigns, regionsById, playerRegionId, rng, currentTick, options);\n  for (const region of regions) {\n    if (region.controllingActorId !== playerRegionId) {\n      activateJointOperations(region, regionsById, agreements, activeCampaigns, polities, currentTick, rng);\n    }"""
if old not in text and new not in text:
    raise SystemExit('nation ai loop anchor missing')
text = text.replace(old, new, 1) if old in text else text
p.write_text(text)

# --- battle engine: only committed elements enter battle, reserves remain separate ---
p = Path('js/military/subregionalArmyBattles.js')
text = p.read_text()
old = "import { desperateAttackProfile } from './supplyAwareAi.js?v=20260908-supply-ai1';"
new = old + "\nimport { battleParticipationFraction } from './jointOperations.js?v=20260909-joint-ops1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """function effectiveCampaignPower(campaign, region, node) {\n  const personnel = Math.max(1, campaign.personnel || 0);"""
new = """function effectiveCampaignPower(campaign, region, node) {\n  const participation = battleParticipationFraction(campaign, region);\n  const personnel = Math.max(1, (campaign.personnel || 0) * participation);"""
if old not in text and new not in text:
    raise SystemExit('battle power anchor missing')
text = text.replace(old, new, 1) if old in text else text
old = """  return personnel * (0.58 + supply * 0.42) * (0.62 + morale * 0.38) * fortHold * garrisonSupport * professional * fatigue * pressure;"""
new = """  campaign.lastBattleParticipationFraction = participation;\n  return personnel * (0.58 + supply * 0.42) * (0.62 + morale * 0.38) * fortHold * garrisonSupport * professional * fatigue * pressure;"""
if old in text:
    text = text.replace(old, new, 1)
old = """    const baseLosses = (campaign.personnel || 0) * casualtyRate(ownPower, enemyPower, campaign, rng);"""
new = """    const committedPersonnel = (campaign.personnel || 0) * battleParticipationFraction(campaign, member.region);\n    const baseLosses = committedPersonnel * casualtyRate(ownPower, enemyPower, campaign, rng);"""
if old not in text and new not in text:
    raise SystemExit('battle losses anchor missing')
text = text.replace(old, new, 1) if old in text else text
p.write_text(text)
