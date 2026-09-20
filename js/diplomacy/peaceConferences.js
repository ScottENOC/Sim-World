import { WAR_STANCES } from '../military/warTheatres.js?v=20260920-peace1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id || null;

export const PEACE_TERM_TYPES = Object.freeze({
  CEASEFIRE: 'ceasefire',
  WITHDRAWAL: 'withdrawal',
  PRISONER_EXCHANGE: 'prisoner_exchange',
  REPARATIONS: 'reparations',
  INSPECTIONS: 'inspections',
  OBSERVERS: 'observers',
  HUMANITARIAN_CORRIDOR: 'humanitarian_corridor',
  TERRITORIAL_STATUS_QUO: 'territorial_status_quo',
  TERRITORIAL_TRANSFER: 'territorial_transfer',
});

function polity(world, id) { return (world.polities || []).find((candidate) => candidate.id === id) || null; }
function regionsFor(world, id) { return (world.regions || []).filter((region) => actorId(region) === id); }
function capital(world, id) {
  const p = polity(world, id);
  return (world.regions || []).find((region) => region.id === p?.capitalRegionId) || regionsFor(world, id)[0] || null;
}
function warForCrisis(world, crisis) {
  if (crisis.type !== 'war') return null;
  return (world.activeWars || []).find((war) => war.id === crisis.sourceId) || null;
}
function campaignsForWar(world, war) {
  if (!war) return [];
  return (world.activeCampaigns || []).filter((campaign) => !campaign.completed && campaign.warId === war.id);
}
function warWeariness(world, id) { return clamp(polity(world, id)?.warSociety?.warWeariness || 0); }
function treasuryAvailable(world, id) {
  return regionsFor(world, id).reduce((sum, region) => sum + Math.max(0, Number(region.treasury) || 0), 0);
}
function transferTreasury(world, fromId, toId, requested) {
  let remaining = Math.max(0, Number(requested) || 0);
  let paid = 0;
  const recipients = regionsFor(world, toId);
  if (!recipients.length) return 0;
  for (const region of regionsFor(world, fromId)) {
    if (remaining <= 0) break;
    const amount = Math.min(remaining, Math.max(0, Number(region.treasury) || 0));
    region.treasury = Math.max(0, (Number(region.treasury) || 0) - amount);
    remaining -= amount;
    paid += amount;
  }
  recipients[0].treasury = Math.max(0, Number(recipients[0].treasury) || 0) + paid;
  return paid;
}

function captiveRecords(world, captorActorId, captiveActorId = null) {
  const records = [];
  for (const region of regionsFor(world, captorActorId)) {
    for (const captive of region.specialForces?.captives || []) {
      const home = captive.homeActorId || captive.polityId || captive.actorId || captive.targetActorId || null;
      if (!captiveActorId || home === captiveActorId) records.push({ region, captive, home });
    }
  }
  return records;
}

function releaseCaptives(world, captorId, recipientId) {
  let released = 0;
  for (const { region, captive, home } of [...captiveRecords(world, captorId, recipientId)]) {
    const list = region.specialForces?.captives || [];
    const index = list.indexOf(captive);
    if (index >= 0) list.splice(index, 1);
    const destination = capital(world, home || recipientId);
    if (destination && captive.id) {
      destination.governance ||= {};
      destination.governance.vipStatus ||= {};
      destination.governance.vipStatus[captive.id] = { status: 'released', sinceTick: null, source: 'peace_conference' };
    }
    released += 1;
  }
  return released;
}

function mediatorFor(crisis) {
  const organisation = [...(crisis.bodyPositions || [])].reverse().find((position) =>
    position.bodyType === 'international_organisation' && position.passed && position.motionType === 'mediate_peace');
  if (organisation) return { type: 'international_organisation', id: organisation.bodyId, name: organisation.organisationName || organisation.bodyId };
  const religious = [...(crisis.bodyPositions || [])].reverse().find((position) =>
    position.bodyType === 'religious_authority' && ['mediate', 'call_peace'].includes(position.position));
  if (religious) return { type: 'religious_authority', id: religious.bodyId, name: religious.bodyName || religious.bodyId };
  const state = [...(crisis.interventions || [])].reverse().find((intervention) => intervention.action === 'mediate');
  if (state) return { type: 'state', id: state.actorId, name: state.actorId };
  return null;
}

function disputedRegionIds(crisis, world) {
  const explicit = crisis.disputedRegionIds || crisis.territorialRegionIds || [];
  if (explicit.length) return explicit.filter((id) => (world.regions || []).some((region) => region.id === id));
  const war = warForCrisis(world, crisis);
  return campaignsForWar(world, war).map((campaign) => campaign.defenderId).filter((id, index, array) => array.indexOf(id) === index);
}

export function buildPeaceConferenceTerms(crisis, world, options = {}) {
  const terms = [{ type: PEACE_TERM_TYPES.CEASEFIRE }];
  const war = warForCrisis(world, crisis);
  if (war) terms.push({ type: PEACE_TERM_TYPES.WITHDRAWAL, scope: 'all_campaigns' });
  if (captiveRecords(world, crisis.sideAActorId, crisis.sideBActorId).length || captiveRecords(world, crisis.sideBActorId, crisis.sideAActorId).length) {
    terms.push({ type: PEACE_TERM_TYPES.PRISONER_EXCHANGE });
  }
  if (crisis.humanitarianRisk >= .22 || crisis.severity >= .75) {
    terms.push({ type: PEACE_TERM_TYPES.HUMANITARIAN_CORRIDOR, durationTicks: 13 });
  }
  if (crisis.nuclearRisk >= .22 || crisis.type === 'nuclear_test') {
    terms.push({ type: PEACE_TERM_TYPES.INSPECTIONS, durationTicks: 52, scope: crisis.type === 'nuclear_test' ? 'nuclear' : 'military' });
  }
  if (crisis.mediation >= .18 || options.mediator?.type === 'international_organisation') {
    terms.push({ type: PEACE_TERM_TYPES.OBSERVERS, durationTicks: 26 });
  }
  const disputed = disputedRegionIds(crisis, world);
  if (disputed.length) terms.push({ type: PEACE_TERM_TYPES.TERRITORIAL_STATUS_QUO, regionIds: disputed });

  const pressuredA = clamp(crisis.pressureA || 0);
  const pressuredB = clamp(crisis.pressureB || 0);
  const payer = pressuredA > pressuredB + .18 ? crisis.sideAActorId : pressuredB > pressuredA + .18 ? crisis.sideBActorId : null;
  if (payer && (crisis.humanitarianRisk >= .35 || crisis.type === 'atrocity')) {
    const recipient = payer === crisis.sideAActorId ? crisis.sideBActorId : crisis.sideAActorId;
    const available = treasuryAvailable(world, payer);
    const amount = Math.max(1, Math.min(available * .12, 75));
    if (amount >= 1) terms.push({ type: PEACE_TERM_TYPES.REPARATIONS, payerActorId: payer, recipientActorId: recipient, amount });
  }
  return terms;
}

let nextProposalId = 1;
export function createPeaceConferenceProposal(crisis, world, currentTick = 0, options = {}) {
  if (!crisis || crisis.status !== 'active') return null;
  crisis.peaceConferences ||= [];
  if (crisis.peaceConferences.some((proposal) => ['offered', 'awaiting_player'].includes(proposal.status))) return null;
  const mediator = options.mediator || mediatorFor(crisis);
  if (!mediator && clamp(crisis.mediation) < .20) return null;
  const proposal = {
    id: `peace-proposal-${nextProposalId++}`,
    crisisId: crisis.id,
    mediator,
    offeredTick: currentTick,
    expiresTick: currentTick + 13,
    status: 'offered',
    terms: options.terms || buildPeaceConferenceTerms(crisis, world, { mediator }),
    responses: {},
    history: [{ tick: currentTick, type: 'offered' }],
  };
  crisis.peaceConferences.push(proposal);
  crisis.history.push({ type: 'peace_conference_opened', proposalId: proposal.id, mediator, tick: currentTick });
  return proposal;
}

function burdenFor(actor, term, crisis, world) {
  if (term.type === PEACE_TERM_TYPES.REPARATIONS && term.payerActorId === actor) {
    return clamp((term.amount || 0) / Math.max(1, treasuryAvailable(world, actor))) * .34;
  }
  if (term.type === PEACE_TERM_TYPES.INSPECTIONS) return .07;
  if (term.type === PEACE_TERM_TYPES.WITHDRAWAL) return .05;
  if (term.type === PEACE_TERM_TYPES.TERRITORIAL_TRANSFER && term.fromActorId === actor) return .42;
  return 0;
}
function benefitFor(actor, term) {
  if (term.type === PEACE_TERM_TYPES.REPARATIONS && term.recipientActorId === actor) return .12;
  if (term.type === PEACE_TERM_TYPES.PRISONER_EXCHANGE) return .08;
  if (term.type === PEACE_TERM_TYPES.HUMANITARIAN_CORRIDOR) return .05;
  if (term.type === PEACE_TERM_TYPES.TERRITORIAL_TRANSFER && term.toActorId === actor) return .30;
  return 0;
}

export function peaceProposalAssessment(actor, proposal, crisis, world) {
  const ownPressure = actor === crisis.sideAActorId ? clamp(crisis.pressureA) : clamp(crisis.pressureB);
  const otherPressure = actor === crisis.sideAActorId ? clamp(crisis.pressureB) : clamp(crisis.pressureA);
  const weariness = warWeariness(world, actor);
  const concessions = proposal.terms.reduce((sum, term) => sum + burdenFor(actor, term, crisis, world), 0);
  const benefits = proposal.terms.reduce((sum, term) => sum + benefitFor(actor, term), 0);
  const settlementNeed = clamp(.20 + ownPressure * .34 + weariness * .24 + clamp(crisis.nuclearRisk) * .20 +
    clamp(crisis.humanitarianRisk) * .10 + clamp(crisis.mediation) * .14 + clamp(crisis.restraint) * .10);
  const relativePosition = clamp(.5 + (ownPressure - otherPressure) * .35);
  const acceptScore = clamp(settlementNeed + benefits + relativePosition * .08 - concessions);
  return { acceptScore, settlementNeed, concessions, benefits, ownPressure, otherPressure, weariness };
}

function recordResponse(proposal, actor, response, assessment, currentTick) {
  proposal.responses[actor] = { response, tick: currentTick, assessment };
  proposal.history.push({ tick: currentTick, type: 'response', actorId: actor, response, acceptScore: assessment?.acceptScore });
}

function enactCeasefire(crisis, world, proposal, currentTick) {
  const war = warForCrisis(world, crisis);
  if (!war) return { warEnded: false, campaignsWithdrawn: 0 };
  war.active = false;
  war.endedTick = currentTick;
  war.endReason = 'negotiated_settlement';
  war.settlementProposalId = proposal.id;
  for (const participant of war.participants || []) {
    for (const other of war.participants || []) {
      if (participant.actorId !== other.actorId && participant.stances?.[other.actorId] === WAR_STANCES.HOSTILE) {
        participant.stances[other.actorId] = WAR_STANCES.AVOID;
      }
    }
  }
  war.history ||= [];
  war.history.push({ type: 'negotiated_ceasefire', tick: currentTick, proposalId: proposal.id });
  let campaignsWithdrawn = 0;
  for (const campaign of campaignsForWar(world, war)) {
    if (!campaign.withdrawRequested) campaignsWithdrawn += 1;
    campaign.withdrawRequested = true;
    campaign.peaceSettlementId = proposal.id;
  }
  return { warEnded: true, campaignsWithdrawn };
}

function enactTerritorialTransfer(term, crisis, world, currentTick) {
  const region = (world.regions || []).find((candidate) => candidate.id === term.regionId);
  if (!region || !term.toActorId || actorId(region) !== term.fromActorId) return false;
  const recipient = polity(world, term.toActorId);
  if (!recipient) return false;
  region.governance ||= {};
  region.governance.localPolityId ||= term.fromActorId;
  region.governance.sovereignPolityId = term.toActorId;
  region.governance.relationship = 'integrated';
  region.governance.autonomy = Math.max(.25, Number(region.governance.autonomy) || 0);
  region.governance.administrativeControl = Math.min(.65, Math.max(.45, Number(region.governance.administrativeControl) || .5));
  region.controllingActorId = recipient.capitalRegionId || term.toActorId;
  region.peaceSettlementHistory ||= [];
  region.peaceSettlementHistory.push({ tick: currentTick, crisisId: crisis.id, fromActorId: term.fromActorId, toActorId: term.toActorId });
  return true;
}

export function enactPeaceConferenceProposal(proposal, crisis, world, currentTick = 0) {
  if (!proposal || proposal.status === 'accepted') return { enacted: false, reason: 'invalid_or_already_enacted' };
  const effects = { warEnded: false, campaignsWithdrawn: 0, prisonersReleased: 0, reparationsPaid: 0, territorialTransfers: 0 };
  for (const term of proposal.terms) {
    if (term.type === PEACE_TERM_TYPES.CEASEFIRE || term.type === PEACE_TERM_TYPES.WITHDRAWAL) {
      const result = enactCeasefire(crisis, world, proposal, currentTick);
      effects.warEnded ||= result.warEnded;
      effects.campaignsWithdrawn = Math.max(effects.campaignsWithdrawn, result.campaignsWithdrawn);
    } else if (term.type === PEACE_TERM_TYPES.PRISONER_EXCHANGE) {
      effects.prisonersReleased += releaseCaptives(world, crisis.sideAActorId, crisis.sideBActorId);
      effects.prisonersReleased += releaseCaptives(world, crisis.sideBActorId, crisis.sideAActorId);
    } else if (term.type === PEACE_TERM_TYPES.REPARATIONS) {
      const paid = transferTreasury(world, term.payerActorId, term.recipientActorId, term.amount);
      term.paidAmount = paid;
      effects.reparationsPaid += paid;
    } else if (term.type === PEACE_TERM_TYPES.INSPECTIONS) {
      crisis.inspectionRegime = { scope: term.scope || 'military', mediator: proposal.mediator, startedTick: currentTick, untilTick: currentTick + (term.durationTicks || 52) };
    } else if (term.type === PEACE_TERM_TYPES.OBSERVERS) {
      crisis.observerMission = { mediator: proposal.mediator, startedTick: currentTick, untilTick: currentTick + (term.durationTicks || 26), active: true };
    } else if (term.type === PEACE_TERM_TYPES.HUMANITARIAN_CORRIDOR) {
      crisis.humanitarianCorridor = { startedTick: currentTick, untilTick: currentTick + (term.durationTicks || 13), active: true };
    } else if (term.type === PEACE_TERM_TYPES.TERRITORIAL_STATUS_QUO) {
      crisis.territorialSettlement = { mode: 'status_quo', regionIds: [...(term.regionIds || [])], tick: currentTick };
    } else if (term.type === PEACE_TERM_TYPES.TERRITORIAL_TRANSFER) {
      if (enactTerritorialTransfer(term, crisis, world, currentTick)) effects.territorialTransfers += 1;
    }
  }
  proposal.status = 'accepted';
  proposal.acceptedTick = currentTick;
  proposal.effects = effects;
  crisis.status = 'settled';
  crisis.settlement = { proposalId: proposal.id, mediator: proposal.mediator, tick: currentTick, terms: proposal.terms, effects };
  crisis.severity = clamp(crisis.severity - .35);
  crisis.nuclearRisk = clamp(crisis.nuclearRisk - .45);
  crisis.history.push({ type: 'peace_conference_settled', proposalId: proposal.id, mediator: proposal.mediator, effects, tick: currentTick });
  return { enacted: true, effects };
}

function maybeCompleteProposal(proposal, crisis, world, currentTick) {
  const a = proposal.responses[crisis.sideAActorId]?.response;
  const b = proposal.responses[crisis.sideBActorId]?.response;
  if (a === 'accept' && b === 'accept') return enactPeaceConferenceProposal(proposal, crisis, world, currentTick);
  if (a === 'reject' || b === 'reject') {
    proposal.status = 'rejected';
    proposal.rejectedTick = currentTick;
    crisis.severity = clamp(crisis.severity + .04);
    crisis.nuclearRisk = clamp(crisis.nuclearRisk + .025);
    crisis.history.push({ type: 'peace_conference_failed', proposalId: proposal.id, tick: currentTick });
    return { enacted: false, rejected: true };
  }
  return { enacted: false, pending: true };
}

export function respondPeaceConferenceProposal(proposal, crisis, world, actor, response, currentTick = 0) {
  if (!proposal || !['offered', 'awaiting_player'].includes(proposal.status) || ![crisis.sideAActorId, crisis.sideBActorId].includes(actor)) {
    return { changed: false, reason: 'invalid_response' };
  }
  if (!['accept', 'reject'].includes(response)) return { changed: false, reason: 'invalid_choice' };
  const assessment = peaceProposalAssessment(actor, proposal, crisis, world);
  recordResponse(proposal, actor, response, assessment, currentTick);
  const result = maybeCompleteProposal(proposal, crisis, world, currentTick);
  return { changed: true, response, assessment, ...result };
}

function npcResponse(actor, proposal, crisis, world, rng) {
  const assessment = peaceProposalAssessment(actor, proposal, crisis, world);
  const probability = clamp(.08 + assessment.acceptScore * .88);
  const response = assessment.acceptScore >= .68 ? 'accept' : assessment.acceptScore <= .34 ? 'reject' : (rng() < probability ? 'accept' : 'reject');
  return { response, assessment };
}

export function tickPeaceConferences(world, currentTick = 0, elapsedDays = 7, rng = Math.random, options = {}) {
  const events = [];
  for (const crisis of world.internationalCrises || []) {
    if (crisis.status !== 'active') continue;
    crisis.peaceConferences ||= [];
    let proposal = [...crisis.peaceConferences].reverse().find((candidate) => ['offered', 'awaiting_player'].includes(candidate.status));
    if (!proposal && currentTick - (crisis.createdTick || 0) >= 2 && (crisis.mediation >= .18 || crisis.restraint >= .28)) {
      proposal = createPeaceConferenceProposal(crisis, world, currentTick);
      if (proposal) events.push({ type: 'peace_conference_opened', crisisId: crisis.id, proposal });
    }
    if (!proposal) continue;
    if (currentTick > proposal.expiresTick) {
      proposal.status = 'expired';
      crisis.history.push({ type: 'peace_conference_expired', proposalId: proposal.id, tick: currentTick });
      events.push({ type: 'peace_conference_expired', crisisId: crisis.id, proposalId: proposal.id });
      continue;
    }
    for (const side of [crisis.sideAActorId, crisis.sideBActorId]) {
      if (!side || proposal.responses[side]) continue;
      if (options.playerPolityId === side) {
        proposal.status = 'awaiting_player';
        events.push({
          type: 'peace_conference_proposal_available', crisisId: crisis.id, proposalId: proposal.id, actorId: side,
          proposal, assessment: peaceProposalAssessment(side, proposal, crisis, world),
        });
        continue;
      }
      const decision = npcResponse(side, proposal, crisis, world, rng);
      recordResponse(proposal, side, decision.response, decision.assessment, currentTick);
      events.push({ type: 'peace_conference_response', crisisId: crisis.id, proposalId: proposal.id, actorId: side, response: decision.response, assessment: decision.assessment });
      const completion = maybeCompleteProposal(proposal, crisis, world, currentTick);
      if (completion.enacted) {
        events.push({ type: 'peace_conference_settlement', crisisId: crisis.id, proposalId: proposal.id, effects: completion.effects });
        break;
      }
      if (completion.rejected) {
        events.push({ type: 'peace_conference_failed', crisisId: crisis.id, proposalId: proposal.id });
        break;
      }
    }
  }
  return events;
}
