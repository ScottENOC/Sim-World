import {
  PEACE_TERM_TYPES,
  createPeaceConferenceProposal,
  peaceProposalAssessment,
  enactPeaceConferenceProposal,
} from './peaceConferences.js?v=20260920-peace2';
import { attitudeToward } from './relations.js?v=20260920-intl-crisis1';
import {
  establishArmistice,
  prepareCampaignWithdrawalFromArmistice,
  releaseArmistice,
  tickArmistices,
} from './armistices.js?v=20260920-armistice1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (r) => r?.governance?.sovereignPolityId || r?.polityId || r?.controllingActorId || r?.id || null;

export const WITHDRAWAL_SEQUENCES = Object.freeze({
  SIMULTANEOUS: 'simultaneous',
  SIDE_A_FIRST: 'side_a_first',
  SIDE_B_FIRST: 'side_b_first',
  RECIPROCAL_STEPS: 'reciprocal_steps',
});

export const VERIFICATION_MODES = Object.freeze({
  TRUST: 'trust',
  OBSERVERS: 'observers',
  INSPECTIONS: 'inspections',
});

function polity(world, id) { return (world.polities || []).find(p => p.id === id) || null; }
function regionsFor(world, id) { return (world.regions || []).filter(r => actorId(r) === id); }
function capital(world, id) {
  const p = polity(world, id);
  return (world.regions || []).find(r => r.id === p?.capitalRegionId) || regionsFor(world, id)[0] || null;
}
function reliability(world, id) {
  const p = polity(world, id);
  if (!p) return .5;
  if (!Number.isFinite(p.diplomaticReliability)) p.diplomaticReliability = .58;
  return clamp(p.diplomaticReliability);
}
function adjustReliability(world, id, delta) {
  const p = polity(world, id);
  if (!p) return;
  p.diplomaticReliability = clamp(reliability(world, id) + delta);
}

export function bilateralPeaceTrust(world, actorA, actorB) {
  const a = capital(world, actorA), b = capital(world, actorB);
  const attitude = a && b ? clamp((attitudeToward(a, b.id) + 1) / 2) : .5;
  return clamp(attitude * .48 + reliability(world, actorA) * .26 + reliability(world, actorB) * .26);
}

function withdrawalTerm(proposal) { return proposal?.terms?.find(t => t.type === PEACE_TERM_TYPES.WITHDRAWAL) || null; }

export function configureImplementationTerms(proposal, crisis, world) {
  if (!proposal) return proposal;
  const trust = bilateralPeaceTrust(world, crisis.sideAActorId, crisis.sideBActorId);
  const withdrawal = withdrawalTerm(proposal);
  if (withdrawal && !withdrawal.implementation) {
    withdrawal.implementation = {
      sequence: trust >= .68 ? WITHDRAWAL_SEQUENCES.SIMULTANEOUS : WITHDRAWAL_SEQUENCES.RECIPROCAL_STEPS,
      verification: trust >= .62 ? VERIFICATION_MODES.TRUST : VERIFICATION_MODES.OBSERVERS,
      phases: trust >= .68 ? 1 : 2,
      intervalTicks: 2,
    };
  }
  proposal.armisticePlan ||= {
    verification: withdrawal?.implementation?.verification || (trust >= .62 ? VERIFICATION_MODES.TRUST : VERIFICATION_MODES.OBSERVERS),
    freezeFronts: true,
    dmzWidthKm: trust < .42 ? 12 : trust < .62 ? 6 : 0,
  };
  proposal.negotiation ||= { round: 1, maxRounds: 5, counteroffers: [], trustAtOpening: trust };
  return proposal;
}

function cloneTerms(terms = []) { return terms.map(term => ({ ...term, implementation: term.implementation ? { ...term.implementation } : undefined })); }

export function counterPeaceConferenceProposal(proposal, crisis, world, actor, changes = {}, currentTick = 0) {
  if (!proposal || !['offered', 'awaiting_player', 'negotiating'].includes(proposal.status)) return { changed: false, reason: 'not_negotiable' };
  configureImplementationTerms(proposal, crisis, world);
  if ((proposal.negotiation?.round || 1) >= (proposal.negotiation?.maxRounds || 5)) return { changed: false, reason: 'round_limit' };
  const terms = cloneTerms(proposal.terms);
  const remove = new Set(changes.removeTermTypes || []);
  let revised = terms.filter(term => !remove.has(term.type));
  if (Array.isArray(changes.addTerms)) revised.push(...cloneTerms(changes.addTerms));
  for (const term of revised) {
    if (term.type === PEACE_TERM_TYPES.REPARATIONS && Number.isFinite(changes.reparationsMultiplier)) {
      term.amount = Math.max(0, (Number(term.amount) || 0) * clamp(changes.reparationsMultiplier, 0, 2));
    }
    if (term.type === PEACE_TERM_TYPES.WITHDRAWAL) {
      term.implementation ||= {};
      if (changes.withdrawalSequence) term.implementation.sequence = changes.withdrawalSequence;
      if (changes.verification) term.implementation.verification = changes.verification;
      if (Number.isFinite(changes.phases)) term.implementation.phases = Math.max(1, Math.min(4, Math.round(changes.phases)));
    }
  }
  proposal.terms = revised;
  if (changes.verification) proposal.armisticePlan.verification = changes.verification;
  if (Number.isFinite(changes.dmzWidthKm)) proposal.armisticePlan.dmzWidthKm = Math.max(0, Math.min(50, changes.dmzWidthKm));
  proposal.responses = {};
  proposal.status = 'negotiating';
  proposal.negotiation.round += 1;
  proposal.negotiation.counteroffers.push({ actorId: actor, tick: currentTick, changes: { ...changes } });
  proposal.history.push({ type: 'counteroffer', actorId: actor, tick: currentTick, changes: { ...changes } });
  return { changed: true, proposal };
}

function npcCounter(actor, proposal, crisis, world) {
  const assessment = peaceProposalAssessment(actor, proposal, crisis, world);
  const trust = bilateralPeaceTrust(world, crisis.sideAActorId, crisis.sideBActorId);
  const changes = {};
  const reparations = proposal.terms.find(t => t.type === PEACE_TERM_TYPES.REPARATIONS && t.payerActorId === actor);
  if (reparations && assessment.concessions > .16) changes.reparationsMultiplier = .55;
  const withdrawal = withdrawalTerm(proposal);
  if (withdrawal && trust < .62) {
    changes.verification = VERIFICATION_MODES.OBSERVERS;
    changes.withdrawalSequence = WITHDRAWAL_SEQUENCES.RECIPROCAL_STEPS;
    changes.phases = 2;
    changes.dmzWidthKm = trust < .42 ? 12 : 6;
  }
  if (withdrawal && assessment.ownPressure + .16 < assessment.otherPressure) {
    changes.withdrawalSequence = actor === crisis.sideAActorId ? WITHDRAWAL_SEQUENCES.SIDE_B_FIRST : WITHDRAWAL_SEQUENCES.SIDE_A_FIRST;
  }
  if (!Object.keys(changes).length && assessment.concessions > .1) changes.removeTermTypes = [PEACE_TERM_TYPES.INSPECTIONS];
  return changes;
}

function recordResponse(proposal, actor, response, assessment, currentTick) {
  proposal.responses[actor] = { response, assessment, tick: currentTick };
  proposal.history.push({ type: 'negotiation_response', actorId: actor, response, acceptScore: assessment.acceptScore, tick: currentTick });
}

function createWithdrawalObligations(proposal, crisis, currentTick) {
  const term = withdrawalTerm(proposal);
  if (!term) return [];
  const plan = term.implementation || {};
  const phases = Math.max(1, Number(plan.phases) || 1);
  const interval = Math.max(1, Number(plan.intervalTicks) || 2);
  const a = crisis.sideAActorId, b = crisis.sideBActorId;
  const obligations = [];
  const push = (actor, phase, dueTick, dependsOn = null) => obligations.push({
    id: `${proposal.id}:withdraw:${actor}:${phase}`, type: 'withdrawal', actorId: actor, phase, phases,
    dueTick, dependsOn, verification: plan.verification || VERIFICATION_MODES.TRUST,
    status: 'pending', reportedStatus: 'pending', actualCompliance: 0,
  });
  if (plan.sequence === WITHDRAWAL_SEQUENCES.SIDE_A_FIRST || plan.sequence === WITHDRAWAL_SEQUENCES.SIDE_B_FIRST) {
    const first = plan.sequence === WITHDRAWAL_SEQUENCES.SIDE_A_FIRST ? a : b;
    const second = first === a ? b : a;
    for (let phase = 1; phase <= phases; phase++) {
      const firstId = `${proposal.id}:withdraw:${first}:${phase}`;
      push(first, phase, currentTick + phase * interval, phase > 1 ? `${proposal.id}:withdraw:${second}:${phase - 1}` : null);
      push(second, phase, currentTick + (phase + 1) * interval, firstId);
    }
  } else if (plan.sequence === WITHDRAWAL_SEQUENCES.RECIPROCAL_STEPS) {
    for (let phase = 1; phase <= phases; phase++) {
      const prevA = phase > 1 ? `${proposal.id}:withdraw:${b}:${phase - 1}` : null;
      const aId = `${proposal.id}:withdraw:${a}:${phase}`;
      push(a, phase, currentTick + (phase * 2 - 1) * interval, prevA);
      push(b, phase, currentTick + phase * 2 * interval, aId);
    }
  } else {
    for (let phase = 1; phase <= phases; phase++) {
      push(a, phase, currentTick + phase * interval);
      push(b, phase, currentTick + phase * interval);
    }
  }
  return obligations;
}

export function signPeaceFramework(proposal, crisis, world, currentTick = 0) {
  configureImplementationTerms(proposal, crisis, world);
  proposal.status = 'implementing';
  proposal.signedTick = currentTick;
  const armistice = establishArmistice(proposal, crisis, world, currentTick);
  proposal.implementation = {
    status: 'active',
    armisticeId: armistice?.id || null,
    obligations: createWithdrawalObligations(proposal, crisis, currentTick),
    breaches: [],
    reports: [],
  };
  crisis.history.push({ type: 'peace_framework_signed', proposalId: proposal.id, tick: currentTick, trust: proposal.negotiation.trustAtOpening, armisticeId: armistice?.id || null });
  return proposal.implementation;
}

function campaignActor(campaign, world) {
  const origin = (world.regions || []).find(r => r.id === campaign.attackerId);
  return actorId(origin);
}
function activeCampaignsFor(world, crisis, actor) {
  return (world.activeCampaigns || []).filter(c => !c.completed && c.warId === crisis.sourceId && campaignActor(c, world) === actor);
}
function fulfilWithdrawalPhase(obligation, proposal, crisis, world, currentTick) {
  const campaigns = activeCampaignsFor(world, crisis, obligation.actorId);
  const fraction = obligation.phase / Math.max(1, obligation.phases);
  const count = Math.ceil(campaigns.length * fraction);
  for (const campaign of campaigns.slice(0, count)) {
    prepareCampaignWithdrawalFromArmistice(campaign, currentTick);
    campaign.peaceFrameworkId = proposal.id;
  }
  obligation.actualCompliance = fraction;
  return count;
}
function dependencySatisfied(obligation, implementation) {
  if (!obligation.dependsOn) return true;
  const dep = implementation.obligations.find(o => o.id === obligation.dependsOn);
  if (!dep) return true;
  if ([VERIFICATION_MODES.OBSERVERS, VERIFICATION_MODES.INSPECTIONS].includes(obligation.verification)) return dep.status === 'fulfilled';
  return dep.reportedStatus === 'fulfilled';
}

function implementationTemptation(actor, crisis, world) {
  const ownPressure = actor === crisis.sideAActorId ? clamp(crisis.pressureA) : clamp(crisis.pressureB);
  const otherPressure = actor === crisis.sideAActorId ? clamp(crisis.pressureB) : clamp(crisis.pressureA);
  const active = activeCampaignsFor(world, crisis, actor).length;
  return clamp(.18 + Math.max(0, otherPressure - ownPressure) * .28 + Math.min(.25, active * .06) - ownPressure * .22);
}

export function implementationDecisionAssessment(actor, obligation, proposal, crisis, world) {
  const trust = bilateralPeaceTrust(world, crisis.sideAActorId, crisis.sideBActorId);
  const rel = reliability(world, actor);
  const temptation = implementationTemptation(actor, crisis, world);
  const verification = obligation.verification === VERIFICATION_MODES.TRUST ? 0 : obligation.verification === VERIFICATION_MODES.OBSERVERS ? .62 : .82;
  const comply = clamp(.26 + rel * .38 + trust * .16 + verification * .16 + (actor === crisis.sideAActorId ? crisis.pressureA : crisis.pressureB) * .18 - temptation * .22);
  const stall = clamp(.14 + temptation * .34 + (1 - verification) * .12);
  const deceive = clamp(.04 + temptation * .32 + (1 - rel) * .24 - verification * .28);
  return { comply, stall, deceive, trust, reliability: rel, temptation, verification };
}

export function resolveImplementationAction(actor, obligation, proposal, crisis, world, action, currentTick = 0, rng = Math.random) {
  if (!obligation || obligation.actorId !== actor || !['pending', 'stalled'].includes(obligation.status)) return { changed: false, reason: 'invalid_obligation' };
  if (!dependencySatisfied(obligation, proposal.implementation)) return { changed: false, reason: 'dependency_not_satisfied' };
  if (action === 'comply') {
    const affected = fulfilWithdrawalPhase(obligation, proposal, crisis, world, currentTick);
    obligation.status = 'fulfilled';
    obligation.reportedStatus = 'fulfilled';
    obligation.fulfilledTick = currentTick;
    adjustReliability(world, actor, .018);
    return { changed: true, action, affectedCampaigns: affected };
  }
  if (action === 'stall') {
    obligation.status = 'stalled';
    obligation.reportedStatus = 'pending';
    obligation.dueTick = currentTick + 2;
    obligation.stallCount = (obligation.stallCount || 0) + 1;
    return { changed: true, action };
  }
  if (action === 'deceive') {
    obligation.status = 'defected';
    obligation.reportedStatus = 'fulfilled';
    obligation.deceptionTick = currentTick;
    obligation.detected = false;
    obligation.detectionChance = obligation.verification === VERIFICATION_MODES.OBSERVERS ? .72 : obligation.verification === VERIFICATION_MODES.INSPECTIONS ? .9 : .18;
    proposal.implementation.reports.push({ actorId: actor, obligationId: obligation.id, claimed: 'fulfilled', actual: 'defected', tick: currentTick });
    if (rng() < obligation.detectionChance) detectImplementationBreach(obligation, proposal, crisis, world, currentTick);
    return { changed: true, action, detected: obligation.detected };
  }
  if (action === 'refuse') {
    obligation.status = 'defected';
    obligation.reportedStatus = 'refused';
    detectImplementationBreach(obligation, proposal, crisis, world, currentTick);
    return { changed: true, action, detected: true };
  }
  return { changed: false, reason: 'invalid_action' };
}

function detectImplementationBreach(obligation, proposal, crisis, world, currentTick) {
  if (obligation.detected) return;
  obligation.detected = true;
  obligation.detectedTick = currentTick;
  proposal.implementation.breaches.push({ actorId: obligation.actorId, obligationId: obligation.id, tick: currentTick });
  proposal.implementation.status = 'breached';
  crisis.severity = clamp(crisis.severity + .12);
  crisis.nuclearRisk = clamp(crisis.nuclearRisk + .05);
  adjustReliability(world, obligation.actorId, -.16);
  crisis.history.push({ type: 'peace_implementation_breach', proposalId: proposal.id, actorId: obligation.actorId, obligationId: obligation.id, tick: currentTick });
}

function maybeDetectOldDeception(obligation, proposal, crisis, world, currentTick, rng) {
  if (obligation.status !== 'defected' || obligation.detected) return false;
  const age = Math.max(0, currentTick - (obligation.deceptionTick || currentTick));
  const accumulated = clamp((obligation.detectionChance || .18) + age * .06);
  if (rng() < accumulated) {
    detectImplementationBreach(obligation, proposal, crisis, world, currentTick);
    return true;
  }
  return false;
}

function allActuallyFulfilled(implementation) {
  return implementation.obligations.every(o => o.status === 'fulfilled');
}

function npcImplementationAction(actor, obligation, proposal, crisis, world, rng) {
  const a = implementationDecisionAssessment(actor, obligation, proposal, crisis, world);
  if (a.comply >= .68) return 'comply';
  if (a.deceive >= .42 && rng() < a.deceive) return 'deceive';
  if (a.stall >= .42 && (obligation.stallCount || 0) < 2 && rng() < a.stall) return 'stall';
  return rng() < a.comply ? 'comply' : (a.verification > .5 ? 'stall' : 'deceive');
}

export function respondPeaceNegotiation(proposal, crisis, world, actor, response, currentTick = 0, changes = {}) {
  if (!proposal || ![crisis.sideAActorId, crisis.sideBActorId].includes(actor)) return { changed: false, reason: 'invalid_actor' };
  configureImplementationTerms(proposal, crisis, world);
  const assessment = peaceProposalAssessment(actor, proposal, crisis, world);
  if (response === 'counter') return counterPeaceConferenceProposal(proposal, crisis, world, actor, changes, currentTick);
  if (!['accept', 'reject'].includes(response)) return { changed: false, reason: 'invalid_response' };
  recordResponse(proposal, actor, response, assessment, currentTick);
  if (response === 'reject') {
    proposal.status = 'rejected';
    proposal.rejectedTick = currentTick;
    crisis.history.push({ type: 'peace_negotiation_rejected', proposalId: proposal.id, actorId: actor, tick: currentTick });
    return { changed: true, rejected: true, assessment };
  }
  const a = proposal.responses[crisis.sideAActorId]?.response;
  const b = proposal.responses[crisis.sideBActorId]?.response;
  if (a === 'accept' && b === 'accept') {
    const implementation = signPeaceFramework(proposal, crisis, world, currentTick);
    return { changed: true, signed: true, implementation, assessment };
  }
  proposal.status = 'negotiating';
  return { changed: true, pending: true, assessment };
}

export function tickPeaceNegotiations(world, currentTick = 0, elapsedDays = 7, rng = Math.random, options = {}) {
  const events = [...tickArmistices(world, currentTick, rng)];
  for (const crisis of world.internationalCrises || []) {
    crisis.peaceConferences ||= [];
    let proposal = [...crisis.peaceConferences].reverse().find(p => ['offered', 'awaiting_player', 'negotiating', 'implementing'].includes(p.status));
    if (!proposal && crisis.status === 'active' && currentTick - (crisis.createdTick || 0) >= 2 && (crisis.mediation >= .18 || crisis.restraint >= .28)) {
      proposal = createPeaceConferenceProposal(crisis, world, currentTick);
      if (proposal) {
        configureImplementationTerms(proposal, crisis, world);
        events.push({ type: 'peace_negotiation_opened', crisisId: crisis.id, proposal });
      }
    }
    if (!proposal) continue;
    configureImplementationTerms(proposal, crisis, world);

    if (proposal.status === 'implementing') {
      const impl = proposal.implementation;
      for (const obligation of impl.obligations) {
        maybeDetectOldDeception(obligation, proposal, crisis, world, currentTick, rng);
        if (!['pending', 'stalled'].includes(obligation.status) || currentTick < obligation.dueTick || !dependencySatisfied(obligation, impl)) continue;
        if (options.playerPolityId === obligation.actorId) {
          events.push({ type: 'peace_implementation_action_required', crisisId: crisis.id, proposalId: proposal.id, actorId: obligation.actorId, obligation, assessment: implementationDecisionAssessment(obligation.actorId, obligation, proposal, crisis, world) });
          continue;
        }
        const action = npcImplementationAction(obligation.actorId, obligation, proposal, crisis, world, rng);
        const result = resolveImplementationAction(obligation.actorId, obligation, proposal, crisis, world, action, currentTick, rng);
        events.push({ type: 'peace_implementation_action', crisisId: crisis.id, proposalId: proposal.id, actorId: obligation.actorId, obligationId: obligation.id, action, result });
      }
      if (impl.status !== 'breached' && allActuallyFulfilled(impl)) {
        const armistice = (world.activeArmistices || []).find(a => a.id === impl.armisticeId);
        if (armistice) releaseArmistice(world, armistice, currentTick, 'settlement_completed');
        const result = enactPeaceConferenceProposal(proposal, crisis, world, currentTick);
        impl.status = 'completed';
        events.push({ type: 'peace_implementation_completed', crisisId: crisis.id, proposalId: proposal.id, effects: result.effects });
      }
      continue;
    }

    if (currentTick > proposal.expiresTick) {
      proposal.status = 'expired';
      crisis.history.push({ type: 'peace_negotiation_expired', proposalId: proposal.id, tick: currentTick });
      events.push({ type: 'peace_negotiation_expired', crisisId: crisis.id, proposalId: proposal.id });
      continue;
    }

    for (const side of [crisis.sideAActorId, crisis.sideBActorId]) {
      if (!side || proposal.responses[side]) continue;
      const assessment = peaceProposalAssessment(side, proposal, crisis, world);
      if (options.playerPolityId === side) {
        proposal.status = 'awaiting_player';
        events.push({ type: 'peace_negotiation_action_required', crisisId: crisis.id, proposalId: proposal.id, actorId: side, proposal, assessment, choices: ['accept', 'counter', 'reject'] });
        continue;
      }
      const round = proposal.negotiation?.round || 1;
      let response = assessment.acceptScore >= .7 ? 'accept' : assessment.acceptScore <= .28 && round >= 3 ? 'reject' : 'counter';
      if (response === 'counter') {
        const result = counterPeaceConferenceProposal(proposal, crisis, world, side, npcCounter(side, proposal, crisis, world), currentTick);
        events.push({ type: 'peace_negotiation_counteroffer', crisisId: crisis.id, proposalId: proposal.id, actorId: side, result });
        break;
      }
      const result = respondPeaceNegotiation(proposal, crisis, world, side, response, currentTick);
      events.push({ type: 'peace_negotiation_response', crisisId: crisis.id, proposalId: proposal.id, actorId: side, response, result });
      if (result.signed || result.rejected) break;
    }
  }
  return events;
}
