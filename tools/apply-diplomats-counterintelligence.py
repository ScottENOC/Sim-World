from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))

# ---- courier authentication, deception, forgery and resident delegated diplomats ----
p = Path('js/diplomacy/couriers.js')
text = p.read_text()
old = "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';"
new = old + "\nimport { diplomatCanCommit, residentDiplomatFor } from './diplomats.js?v=20260909-diplomats1';\nimport { assessMessageAuthenticity, forgeryAuthentication, genuineAuthentication, intelligenceCredibilityFromMessage } from './counterIntelligence.js?v=20260909-counterintel1';"
if new not in text:
    text = text.replace(old, new, 1)

# Add resident diplomat route and authentication to joint proposals.
old = """  const route = routeFor(sender, target, regionsById);\n  if (!route) return { sent: false, reason: 'no_route' };\n  ensureMailbox(sender); ensureMailbox(target);\n  const leadWeeks = Math.max(2, Math.round(options.leadWeeks ?? 12));\n  const statedFraction = clamp(options.commitmentFraction ?? 0.55, 0.1, 0.95);"""
new = """  const statedFraction = clamp(options.commitmentFraction ?? 0.55, 0.1, 0.95);\n  const residentDiplomat = residentDiplomatFor(target, sender.id);\n  const delegated = diplomatCanCommit(residentDiplomat, 'joint_operation', statedFraction);\n  const route = delegated ? { mode: 'resident', days: 0, diplomatId: residentDiplomat.id } : routeFor(sender, target, regionsById);\n  if (!route) return { sent: false, reason: 'no_route' };\n  ensureMailbox(sender); ensureMailbox(target);\n  const leadWeeks = Math.max(2, Math.round(options.leadWeeks ?? 12));"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('joint proposal route anchor missing')
old = """    secrecy: clamp(options.secrecy ?? 0.65), departTick: currentTick,\n    arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,\n    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,"""
new = """    secrecy: clamp(options.secrecy ?? 0.65), departTick: currentTick,\n    arrivalTick: delegated ? currentTick : currentTick + Math.max(1, Math.ceil(route.days / 7)), route,\n    residentDiplomatId: delegated ? residentDiplomat.id : null, delegatedAuthority: delegated ? residentDiplomat.authority : null,\n    authentication: genuineAuthentication(sender, { coded: Boolean(options.coded), strategicTruth: options.strategicTruth !== false }),\n    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('joint proposal state anchor missing')

# Joint acceptance recognizes delegated authority and authentication uncertainty.
old = """function jointOperationAcceptance(message, sender, target, enemy) {\n  const friend = clamp((attitudeToward(target, sender.id) + 1) / 2);"""
new = """function jointOperationAcceptance(message, sender, target, enemy, authenticity = null) {\n  const friend = clamp((attitudeToward(target, sender.id) + 1) / 2);"""
if old in text:
    text = text.replace(old, new, 1)
old = """  return clamp(0.06 + friend * 0.38 + enemyHostility * 0.28 + readiness * 0.16 + warning * 0.12);\n}"""
new = """  const delegatedBonus = message.residentDiplomatId ? 0.12 : 0;\n  const authenticityPenalty = authenticity?.verdict === 'uncertain' ? 0.16 : authenticity?.detectedForgery ? 0.8 : 0;\n  return clamp(0.06 + friend * 0.38 + enemyHostility * 0.28 + readiness * 0.16 + warning * 0.12 + delegatedBonus - authenticityPenalty);\n}"""
if old in text:
    text = text.replace(old, new, 1)

# Add authentication to reply, with immediate resident response where delegated.
old = """function sendJointOperationReply(original, sender, target, accepted, agreement, regionsById, currentTick) {\n  const route = routeFor(target, sender, regionsById);\n  if (!route) return null;"""
new = """function sendJointOperationReply(original, sender, target, accepted, agreement, regionsById, currentTick) {\n  const resident = Boolean(original.residentDiplomatId);\n  const route = resident ? { mode: 'resident', days: 0, diplomatId: original.residentDiplomatId } : routeFor(target, sender, regionsById);\n  if (!route) return null;"""
if old in text:
    text = text.replace(old, new, 1)
old = """    proposedAttackTick: original.proposedAttackTick, secrecy: original.secrecy,\n    departTick: currentTick, arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,\n    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,"""
new = """    proposedAttackTick: original.proposedAttackTick, secrecy: original.secrecy,\n    departTick: currentTick, arrivalTick: resident ? currentTick : currentTick + Math.max(1, Math.ceil(route.days / 7)), route,\n    residentDiplomatId: original.residentDiplomatId || null,\n    authentication: genuineAuthentication(target, { coded: Boolean(original.authentication?.coded) }),\n    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,"""
if old in text:
    text = text.replace(old, new, 1)

# Add authentication to ordinary war invitations.
old = """    requestedPersonnel: Math.max(0, Math.round(options.requestedPersonnel || 0)),\n    secrecy: clamp(options.secrecy ?? 0.4),"""
new = """    requestedPersonnel: Math.max(0, Math.round(options.requestedPersonnel || 0)),\n    secrecy: clamp(options.secrecy ?? 0.4),\n    authentication: genuineAuthentication(sender, { coded: Boolean(options.coded) }),"""
if old in text:
    text = text.replace(old, new, 1)

# New false-letter APIs before sendWarInvitation.
anchor = "export function sendWarInvitation(sender, target, enemy, regions, currentTick, options = {}) {"
insert = r'''export function sendForgedJointOperationLetter(forger, purportedSender, target, allegedEnemy, regions, currentTick, options = {}) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(forger, target, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  ensureMailbox(forger); ensureMailbox(target);
  const message = {
    id: `dmsg-${nextMessageId++}`, type: 'forged_joint_operation_letter',
    senderRegionId: forger.id, senderActorId: actorId(forger),
    purportedSenderRegionId: purportedSender.id, claimedSenderActorId: actorId(purportedSender),
    targetRegionId: target.id, targetActorId: actorId(target),
    enemyRegionId: allegedEnemy.id, enemyActorId: actorId(allegedEnemy),
    proposedAttackTick: Math.max(currentTick + 2, Math.round(options.attackTick ?? currentTick + 12)),
    declaredCommitmentFraction: clamp(options.commitmentFraction ?? 0.6, 0.1, 0.95),
    objective: options.objective || 'subjugation', secrecy: clamp(options.secrecy ?? 0.45),
    authentication: forgeryAuthentication(forger, purportedSender, options),
    departTick: currentTick, arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,
    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,
  };
  forger.diplomaticMessages.push(message);
  return { sent: true, message };
}

export function sendDeceptionJointOperationLetter(sender, target, falseEnemy, regions, currentTick, options = {}) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(sender, target, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  ensureMailbox(sender); ensureMailbox(target);
  const message = {
    id: `dmsg-${nextMessageId++}`, type: 'deception_joint_operation_letter',
    senderRegionId: sender.id, senderActorId: actorId(sender),
    targetRegionId: target.id, targetActorId: actorId(target),
    enemyRegionId: falseEnemy.id, enemyActorId: actorId(falseEnemy),
    proposedAttackTick: Math.max(currentTick + 2, Math.round(options.attackTick ?? currentTick + 10)),
    declaredCommitmentFraction: clamp(options.commitmentFraction ?? 0.65, 0.1, 0.95),
    objective: options.objective || 'subjugation', secrecy: clamp(options.secrecy ?? 0.12),
    authentication: genuineAuthentication(sender, { coded: Boolean(options.coded), strategicTruth: false }),
    departTick: currentTick, arrivalTick: currentTick + Math.max(1, Math.ceil(route.days / 7)), route,
    status: 'in_transit', intercepted: false, compromised: false, destroyed: false, response: null,
  };
  sender.diplomaticMessages.push(message);
  return { sent: true, message };
}

function recordApparentPlan(receiver, message, currentTick, assessment, sourceType) {
  recordDiplomaticIntelligence(receiver, {
    type: sourceType, claimedSenderActorId: message.authentication?.claimedSenderActorId || message.claimedSenderActorId || message.senderActorId,
    actualSenderActorId: assessment.detectedForgery ? message.authentication?.actualSenderActorId || null : null,
    enemyActorId: message.enemyActorId, enemyRegionId: message.enemyRegionId, attackTick: message.proposedAttackTick,
    declaredCommitmentFraction: message.declaredCommitmentFraction, authenticityVerdict: assessment.verdict,
    confidence: assessment.intelligenceConfidence ?? assessment.confidenceAuthentic ?? 0.4,
    learnedTick: currentTick, sourceMessageId: message.id,
  });
}

'''
if insert not in text:
    text = text.replace(anchor, insert + anchor, 1)

# Intercepts assess credibility rather than receiving truth labels.
old = """        if (interceptorRegion && ['joint_operation_proposal','joint_operation_reply'].includes(message.type)) {\n          recordDiplomaticIntelligence(interceptorRegion, { type: 'intercepted_joint_operation', senderActorId: message.senderActorId,\n            targetActorId: message.targetActorId, enemyActorId: message.enemyActorId, attackTick: message.proposedAttackTick,\n            accepted: message.accepted ?? null, learnedTick: currentTick, sourceMessageId: message.id });\n        }"""
new = """        if (interceptorRegion && ['joint_operation_proposal','joint_operation_reply','forged_joint_operation_letter','deception_joint_operation_letter'].includes(message.type)) {\n          const credibility = intelligenceCredibilityFromMessage(interceptorRegion, message, regions, rng);\n          recordApparentPlan(interceptorRegion, message, currentTick, credibility, 'intercepted_joint_operation');\n          if (credibility.detectedForgery) events.push({ type: 'forged_letter_detected', message, detectingActorId: interceptingActorId, assessment: credibility });\n        }"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('intercept intel anchor missing')

# Delivery branches for false letters, and authenticity-aware genuine proposals.
old = """      if (message.type === 'joint_operation_reply') {"""
insert = """      if (message.type === 'forged_joint_operation_letter') {\n        message.receivedTick = currentTick;\n        const assessment = intelligenceCredibilityFromMessage(target, message, regions, rng);\n        message.authenticityAssessment = assessment;\n        if (assessment.detectedForgery) {\n          message.status = 'forgery_detected';\n          events.push({ type: 'forged_letter_detected', message, detectingActorId: message.targetActorId, assessment });\n        } else {\n          message.status = 'forgery_believed';\n          recordApparentPlan(target, message, currentTick, assessment, 'reported_joint_operation');\n          if ((assessment.intelligenceConfidence || 0) >= 0.48) {\n            target.militaryStrategy ||= {};\n            target.militaryStrategy.posture = 'guarded';\n            target.militaryStrategy.targetRegionId = message.enemyRegionId;\n          }\n          events.push({ type: 'forged_letter_believed', message, assessment });\n        }\n        continue;\n      }\n      if (message.type === 'deception_joint_operation_letter') {\n        message.receivedTick = currentTick;\n        const assessment = intelligenceCredibilityFromMessage(target, message, regions, rng);\n        message.status = 'deception_delivered';\n        recordApparentPlan(target, message, currentTick, assessment, 'reported_joint_operation');\n        events.push({ type: 'deception_letter_delivered', message, assessment });\n        continue;\n      }\n      if (message.type === 'joint_operation_reply') {"""
if insert not in text:
    if old not in text:
        raise SystemExit('false delivery insertion anchor missing')
    text = text.replace(old, insert, 1)

old = """      if (message.type === 'joint_operation_proposal') {\n        const chance = jointOperationAcceptance(message, sender, target, enemy);"""
new = """      if (message.type === 'joint_operation_proposal') {\n        message.receivedTick = currentTick;\n        const authenticity = assessMessageAuthenticity(target, message, regions, rng);\n        const chance = jointOperationAcceptance(message, sender, target, enemy, authenticity);"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('proposal authenticity anchor missing')

# Annotate agreement when a resident diplomat bound the state.
old = """    createdTick: currentTick, sourceMessageId: message.id, execution: {},\n  };"""
new = """    createdTick: currentTick, sourceMessageId: message.id, execution: {},\n    sourceDiplomatId: message.residentDiplomatId || null, delegatedAuthority: message.delegatedAuthority || null,\n  };"""
if old in text:
    text = text.replace(old, new, 1)
p.write_text(text)

# ---- player joint-operation council uses resident-diplomat reports as physical evidence ----
p = Path('js/military/playerJointOperationAdvisor.js')
text = p.read_text()
old = """  } else if (reply?.accepted) {\n    allySignal = 'confirmed_words';\n    allySummary = `${ally?.name || 'Our ally'} formally accepted the plan, but words are not troops; we have not yet confirmed a field army moving.`;"""
new = """  } else {\n    const diplomatObservation = [...relevantIntel].reverse().find((entry) => entry.type === 'diplomat_military_observation' && entry.hostRegionId === ally?.id);\n    if (diplomatObservation && ['prepare_war','mobilise_war'].includes(diplomatObservation.observedPosture) &&\n        (!diplomatObservation.observedTargetRegionId || diplomatObservation.observedTargetRegionId === plan.enemyRegionId)) {\n      allySignal = 'physical_signs';\n      allySummary = `Our envoy at ${ally?.name || 'the allied court'} reports visible military preparations${diplomatObservation.observedTargetRegionId === plan.enemyRegionId ? ' consistent with the agreed target' : ''}.`;\n    } else if (reply?.accepted) {\n      allySignal = 'confirmed_words';\n      allySummary = `${ally?.name || 'Our ally'} formally accepted the plan, but words are not troops; we have not yet confirmed a field army moving.`;\n    } else if (reply && reply.accepted === false) {\n      allySignal = 'refused';\n      allySummary = `${ally?.name || 'Our ally'} refused the operation.`;\n    } else if (relevantIntel.some((entry) => entry.type === 'intercepted_joint_operation' && entry.accepted === true)) {\n      allySignal = 'indirect';\n      allySummary = 'Our intelligence suggests the ally accepted, but the normal reply has not reached us.';\n    }\n  }\n  if (false) {"""
# Replace the whole old else-if chain through indirect branch carefully.
old_full = """  } else if (reply?.accepted) {\n    allySignal = 'confirmed_words';\n    allySummary = `${ally?.name || 'Our ally'} formally accepted the plan, but words are not troops; we have not yet confirmed a field army moving.`;\n  } else if (reply && reply.accepted === false) {\n    allySignal = 'refused';\n    allySummary = `${ally?.name || 'Our ally'} refused the operation.`;\n  } else if (relevantIntel.some((entry) => entry.type === 'intercepted_joint_operation' && entry.accepted === true)) {\n    allySignal = 'indirect';\n    allySummary = 'Our intelligence suggests the ally accepted, but the normal reply has not reached us.';\n  }"""
new_full = """  } else {\n    const diplomatObservation = [...relevantIntel].reverse().find((entry) => entry.type === 'diplomat_military_observation' && entry.hostRegionId === ally?.id);\n    if (diplomatObservation && ['prepare_war','mobilise_war'].includes(diplomatObservation.observedPosture) &&\n        (!diplomatObservation.observedTargetRegionId || diplomatObservation.observedTargetRegionId === plan.enemyRegionId)) {\n      allySignal = 'physical_signs';\n      allySummary = `Our envoy at ${ally?.name || 'the allied court'} reports visible military preparations${diplomatObservation.observedTargetRegionId === plan.enemyRegionId ? ' consistent with the agreed target' : ''}.`;\n    } else if (reply?.accepted) {\n      allySignal = 'confirmed_words';\n      allySummary = `${ally?.name || 'Our ally'} formally accepted the plan, but words are not troops; we have not yet confirmed a field army moving.`;\n    } else if (reply && reply.accepted === false) {\n      allySignal = 'refused';\n      allySummary = `${ally?.name || 'Our ally'} refused the operation.`;\n    } else if (relevantIntel.some((entry) => entry.type === 'intercepted_joint_operation' && entry.accepted === true)) {\n      allySignal = 'indirect';\n      allySummary = 'Our intelligence suggests the ally accepted, but the normal reply has not reached us.';\n    }\n  }"""
if old_full in text:
    text = text.replace(old_full, new_full, 1)
elif new_full not in text:
    raise SystemExit('ally signal anchor missing')
p.write_text(text)

# ---- AI posts envoys and delegates modest authority ----
p = Path('js/diplomacy/diplomats.js')
text = p.read_text()
append = r'''
export function chooseNpcDiplomatPosting(home, regions, currentTick, rng = Math.random) {
  const service = ensureService(home);
  const diplomat = service.diplomats.find((d) => d.status === 'home');
  if (!diplomat || rng() > 0.18) return null;
  const candidates = regions.filter((r) => r.id !== home.id &&
    ((home.neighbors || []).includes(r.id) || (home.adjacentSeaIds || []).some((id) => (r.adjacentSeaIds || []).includes(id))));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(attitudeToward(home, b.id)) - Math.abs(attitudeToward(home, a.id)));
  const target = candidates[0];
  const feeling = attitudeToward(home, target.id);
  const authority = feeling > 0.65 ? DIPLOMAT_AUTHORITY.MILITARY : feeling > 0.15 ? DIPLOMAT_AUTHORITY.NEGOTIATE : DIPLOMAT_AUTHORITY.OBSERVE;
  setDiplomatAuthority(home, diplomat.id, authority, { maxMilitaryCommitmentFraction: feeling > 0.75 ? 0.35 : 0.18 });
  return dispatchDiplomat(home, target, regions, diplomat.id, currentTick);
}
'''
if append not in text:
    text += append
p.write_text(text)

p = Path('js/ai/nationAi.js')
text = p.read_text()
old = "import { coordinateExpeditionRelief } from '../military/expeditionReliefAi.js?v=20260909-relief1';"
new = old + "\nimport { chooseNpcDiplomatPosting } from '../diplomacy/diplomats.js?v=20260909-diplomats1';"
if new not in text:
    text = text.replace(old, new, 1)
old = """    maybeScout(region, regionsById, currentTick, rng);\n    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));"""
new = """    maybeScout(region, regionsById, currentTick, rng);\n    chooseNpcDiplomatPosting(region, regions, currentTick, rng);\n    maybeMakeAgreement(region, regionsById, playerRegionId, agreements, polities, currentTick, toolTypes, rng, chance(DIPLOMACY_CONSIDERATION_CHANCE_PER_WEEK));"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('nation diplomat posting anchor missing')
p.write_text(text)

# ---- main ticking, load ids, false-plan APIs exposed, player events ----
p = Path('js/main.js')
text = p.read_text()
old = "import { sendJointOperationProposal, sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260909-joint-player1';"
new = "import { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter, sendJointOperationProposal, sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260909-counterintel1';\nimport { dispatchDiplomat, ensureDiplomaticService, recallDiplomat, setDiplomatAuthority, syncNextDiplomatId, tickDiplomats } from './diplomacy/diplomats.js?v=20260909-diplomats1';\nimport { ensureCounterIntelligence, setCounterIntelligencePolicy } from './diplomacy/counterIntelligence.js?v=20260909-counterintel1';"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main courier import anchor missing')

old = """  initialiseKnowledge(regions, seaRegions);\n  const toolTypes = await"""
new = """  initialiseKnowledge(regions, seaRegions);\n  for (const region of regions) { ensureDiplomaticService(region); ensureCounterIntelligence(region); }\n  const toolTypes = await"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main init diplomat anchor missing')

old = """    syncNextDiplomaticMessageId(regions);\n    syncNextProjectId(regions);"""
new = """    syncNextDiplomaticMessageId(regions);\n    syncNextDiplomatId(regions);\n    for (const region of regions) { ensureDiplomaticService(region); ensureCounterIntelligence(region); }\n    syncNextProjectId(regions);"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main load diplomat sync anchor missing')

old = """    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);"""
new = """    const diplomatEvents = tickDiplomats(regions, calendarWeek, time.elapsedDays, Math.random);\n    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);"""
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('main diplomat tick anchor missing')

old = """      ...jointOperationAdvisorEvents,"""
new = """      ...jointOperationAdvisorEvents,\n      ...diplomatEvents.filter((event) => event.homeRegionId === playerRegionId && event.type !== 'diplomat_report'),"""
if old in text:
    text = text.replace(old, new, 1)

old = """    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },\n    agreements,"""
new = """    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },\n    diplomatApi: { dispatchDiplomat, recallDiplomat, setDiplomatAuthority, setCounterIntelligencePolicy, sendForgedJointOperationLetter, sendDeceptionJointOperationLetter },\n    agreements,"""
if old in text:
    text = text.replace(old, new, 1)

# Generic event handling for diplomat arrivals/detention before campaign events.
anchor = """  if (event.type === 'campaign_arrived') {"""
insert = """  if (event.type === 'diplomat_posted') {\n    document.getElementById('event-title').textContent = 'Envoy reaches a foreign court';\n    document.getElementById('event-body').textContent = `${event.diplomat.name} has reached the assigned court and begun building local familiarity. Reports will be imperfect and periodic, not omniscient.`;\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'diplomat_returned') {\n    document.getElementById('event-title').textContent = 'Envoy returns';\n    document.getElementById('event-body').textContent = `${event.diplomat.name} has returned home and is available for reassignment.`;\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'diplomat_detained') {\n    document.getElementById('event-title').textContent = 'Envoy detained';\n    document.getElementById('event-body').textContent = `${event.diplomat.name} has been detained by the foreign court. Their reporting and delegated authority are unavailable while held.`;\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (['forged_letter_detected','forged_letter_believed'].includes(event.type)) {\n    document.getElementById('event-title').textContent = event.type === 'forged_letter_detected' ? 'Suspected forged letter' : 'Intelligence from a diplomatic letter';\n    document.getElementById('event-body').textContent = event.type === 'forged_letter_detected'\n      ? 'Our officials found inconsistencies in a letter presented as genuine. The alleged sender may have been impersonated.'\n      : 'A letter has been accepted as probably genuine. Its operational claims remain intelligence, not certainty.';\n    wireEventContinue(clock, eventQueue); return;\n  }\n"""
if insert not in text:
    if anchor not in text: raise SystemExit('main diplomat event anchor missing')
    text = text.replace(anchor, insert + anchor, 1)
p.write_text(text)
