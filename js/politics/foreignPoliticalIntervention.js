import { ensureCounterIntelligence } from '../diplomacy/counterIntelligence.js?v=20260917-intervention1';
import { chooseNpcInstitutionalApprovals } from './institutionalActions.js?v=20260917-intervention1';
import { ensureInstitutionalCrisisState } from './institutionalCrises.js?v=20260917-intervention1';
import { transferRegion } from './continuity.js?v=20260917-intervention1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function sovereignRegions(polityId, regions) {
  return (regions || []).filter((region) => region.governance?.sovereignPolityId === polityId);
}

function capitalRegion(polity, regions) {
  return (regions || []).find((region) => region.id === polity?.capitalRegionId) || null;
}

export function restorationTarget(exilePolity, polities) {
  if (!exilePolity) return null;
  const displaced = [...(exilePolity.regimeHistory || [])]
    .reverse()
    .find((entry) => String(entry.kind || '').endsWith('_displaced') && entry.successorPolityId);
  const targetId = displaced?.successorPolityId;
  if (targetId) return (polities || []).find((candidate) => candidate.id === targetId) || null;
  return (polities || []).find((candidate) => candidate.predecessorPolityId === exilePolity.id) || null;
}

export function ensureRestorationOperation(exilePolity, targetPolityId = null) {
  exilePolity.continuity ||= {};
  exilePolity.continuity.restorationOperations ||= {};
  const key = targetPolityId || 'unknown';
  exilePolity.continuity.restorationOperations[key] ||= {
    targetPolityId,
    sponsorPolityId: null,
    funding: 0,
    network: 0,
    materialSupport: 0,
    propaganda: 0,
    exposure: 0,
    detected: false,
    lastSupportTick: null,
    lastUprisingTick: null,
  };
  return exilePolity.continuity.restorationOperations[key];
}

function targetCounterIntelligence(targetPolity, regions) {
  const capital = capitalRegion(targetPolity, regions);
  if (!capital) return 0.25;
  const ci = ensureCounterIntelligence(capital);
  const admin = clamp(capital.governance?.administrativeControl ?? targetPolity.administration?.officialdom ?? 0.25);
  return clamp(0.12 + ci.credentialSecurity * 0.3 + ci.codePractice * 0.22 + ci.verificationCaution * 0.18 + admin * 0.18);
}

function sponsorTradecraft(sponsorPolity, regions) {
  const capital = capitalRegion(sponsorPolity, regions);
  if (!capital) return 0.2;
  const ci = ensureCounterIntelligence(capital);
  const officialdom = clamp(sponsorPolity.administration?.officialdom ?? capital.governance?.administrativeControl ?? 0.2);
  return clamp(0.18 + ci.codePractice * 0.28 + ci.credentialSecurity * 0.18 + officialdom * 0.28);
}

export function fundRestorationOperation(sponsorPolity, exilePolity, targetPolity, regions, currentTick, amount = 10, rng = Math.random) {
  if (!sponsorPolity || !exilePolity || !targetPolity || sponsorPolity.id === targetPolity.id) {
    return { funded: false, reason: 'invalid_parties' };
  }
  if (exilePolity.continuity?.status !== 'exile') return { funded: false, reason: 'claimant_not_in_exile' };
  const sponsorCapital = capitalRegion(sponsorPolity, regions);
  if (!sponsorCapital) return { funded: false, reason: 'no_sponsor_capital' };
  const spend = Math.max(0, Math.min(Number(amount) || 0, sponsorCapital.treasury || 0));
  if (spend < 1) return { funded: false, reason: 'insufficient_treasury' };

  sponsorCapital.treasury -= spend;
  const operation = ensureRestorationOperation(exilePolity, targetPolity.id);
  operation.sponsorPolityId = sponsorPolity.id;
  operation.funding += spend;
  operation.lastSupportTick = currentTick;

  const tradecraft = sponsorTradecraft(sponsorPolity, regions);
  const defence = targetCounterIntelligence(targetPolity, regions);
  const backing = clamp(exilePolity.continuity?.exileSupport?.[sponsorPolity.id] || 0);
  const efficiency = clamp(0.25 + tradecraft * 0.42 + backing * 0.2 - defence * 0.18, 0.08, 0.75);
  const gain = clamp((spend / 100) * efficiency, 0, 0.18);
  operation.network = clamp(operation.network + gain * 0.48);
  operation.materialSupport = clamp(operation.materialSupport + gain * 0.34);
  operation.propaganda = clamp(operation.propaganda + gain * 0.42);

  const detectionChance = clamp(0.025 + defence * 0.24 + spend / 500 * 0.18 - tradecraft * 0.2, 0.01, 0.55);
  const detected = rng() < detectionChance;
  operation.exposure = clamp(operation.exposure + detectionChance * (detected ? 0.65 : 0.08));
  if (detected) operation.detected = true;

  const crisis = ensureInstitutionalCrisisState(targetPolity);
  crisis.pressure = clamp(crisis.pressure + operation.propaganda * 0.018);
  crisis.revolutionRisk = clamp(crisis.revolutionRisk + operation.network * 0.012);

  return { funded: true, amount: spend, gain, detected, detectionChance, operation };
}

function uprisingCandidate(exilePolity, targetPolity, regions) {
  const claims = exilePolity.continuity?.claims || {};
  return sovereignRegions(targetPolity.id, regions)
    .map((region) => {
      const claim = clamp(claims[region.id] || 0);
      const grievance = clamp(region.popularWellbeing?.grievance || 0.25);
      const mobilisation = clamp(region.popularWellbeing?.mobilisationPotential || 0.2);
      const localControl = clamp(region.governance?.administrativeControl ?? 0.5);
      const score = claim * 0.45 + grievance * 0.28 + mobilisation * 0.2 + (1 - localControl) * 0.07;
      return { region, claim, grievance, mobilisation, score };
    })
    .filter((item) => item.claim >= 0.35)
    .sort((a, b) => b.score - a.score)[0] || null;
}

export function attemptRestorationUprising(exilePolity, targetPolity, polities, regions, currentTick, rng = Math.random) {
  if (exilePolity?.continuity?.status !== 'exile' || !targetPolity) return { attempted: false, reason: 'invalid_claimant' };
  if (targetPolity.regimeConflict?.status === 'active' || exilePolity.regimeConflict?.status === 'active') {
    return { attempted: false, reason: 'already_in_regime_conflict' };
  }
  const operation = ensureRestorationOperation(exilePolity, targetPolity.id);
  if (operation.network < 0.22 || operation.materialSupport < 0.1) return { attempted: false, reason: 'network_too_weak' };
  const candidate = uprisingCandidate(exilePolity, targetPolity, regions);
  if (!candidate) return { attempted: false, reason: 'no_viable_claim' };

  const defence = targetCounterIntelligence(targetPolity, regions);
  const legitimacy = clamp(targetPolity.continuity?.legitimacy ?? targetPolity.administration?.legitimacy ?? 0.4);
  const support = clamp(operation.network * 0.34 + operation.materialSupport * 0.18 + operation.propaganda * 0.16 +
    candidate.claim * 0.16 + candidate.grievance * 0.1 + candidate.mobilisation * 0.1 - defence * 0.12 - legitimacy * 0.08);
  const successChance = clamp(0.04 + support * 0.78, 0.03, 0.82);
  operation.lastUprisingTick = currentTick;
  if (rng() >= successChance) {
    operation.network = clamp(operation.network * 0.82);
    operation.materialSupport = clamp(operation.materialSupport * 0.76);
    operation.exposure = clamp(operation.exposure + 0.12);
    const crisis = ensureInstitutionalCrisisState(targetPolity);
    crisis.pressure = clamp(crisis.pressure + 0.04);
    return { attempted: true, succeeded: false, successChance, targetRegionId: candidate.region.id };
  }

  const result = transferRegion(candidate.region, targetPolity, exilePolity, regions, polities, currentTick, 'restoration');
  if (!result.transferred) return { attempted: true, succeeded: false, reason: result.reason || 'transfer_failed', successChance };

  candidate.region.governance.relationship = 'core';
  candidate.region.governance.autonomy = 0;
  candidate.region.governance.administrativeControl = Math.max(0.5, candidate.region.governance.administrativeControl || 0);
  candidate.region.governance.tributeRate = 0;
  candidate.region.controllingActorId = candidate.region.id;
  exilePolity.capitalRegionId = candidate.region.id;
  exilePolity.rulerRegionId = candidate.region.id;
  exilePolity.continuity.status = 'claimant';
  exilePolity.continuity.seatRegionId = candidate.region.id;
  exilePolity.continuity.hostPolityId = null;
  exilePolity.continuity.exilePopulation = 0;

  const conflict = {
    type: 'restoration',
    startedTick: currentTick,
    incumbentPolityId: targetPolity.id,
    revolutionaryPolityId: exilePolity.id,
    contestedRegionIds: sovereignRegions(targetPolity.id, regions).map((region) => region.id).concat(candidate.region.id),
    status: 'active',
    sponsorPolityId: operation.sponsorPolityId,
  };
  targetPolity.regimeConflict = { ...conflict };
  exilePolity.regimeConflict = { ...conflict };
  operation.network = clamp(operation.network * 0.55);
  operation.materialSupport = clamp(operation.materialSupport * 0.45);

  return {
    attempted: true,
    succeeded: true,
    successChance,
    targetRegionId: candidate.region.id,
    claimantPolityId: exilePolity.id,
    incumbentPolityId: targetPolity.id,
    sponsorPolityId: operation.sponsorPolityId,
    conflict,
  };
}

export function tickForeignPoliticalIntervention(polities, regions, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const events = [];
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  if (years <= 0) return events;

  for (const exile of polities || []) {
    if (exile.continuity?.status !== 'exile') continue;
    const target = restorationTarget(exile, polities);
    const host = (polities || []).find((candidate) => candidate.id === exile.continuity?.hostPolityId);
    if (!target || !host || host.id === options.playerPolityId) continue;
    const backing = clamp(exile.continuity?.exileSupport?.[host.id] || 0);
    if (backing < 0.62) continue;

    const sponsorCapital = capitalRegion(host, regions);
    if (!sponsorCapital || (sponsorCapital.treasury || 0) < 4) continue;
    const operation = ensureRestorationOperation(exile, target.id);
    const approval = chooseNpcInstitutionalApprovals(host, 'order_intelligence_operation', {
      publicSupport: backing * 0.6,
      threat: clamp(0.25 + backing * 0.45),
      fiscalStress: clamp(1 - Math.min(1, (sponsorCapital.treasury || 0) / 120)),
    }, rng);
    if (!approval.approved) continue;

    const annualSpend = Math.min(36, Math.max(8, (sponsorCapital.treasury || 0) * 0.035));
    const support = fundRestorationOperation(host, exile, target, regions, currentTick, annualSpend * years, rng);
    if (support.funded && support.detected) {
      events.push({
        type: 'foreign_restoration_support_detected',
        targetPolityId: target.id,
        exilePolityId: exile.id,
        sponsorPolityId: host.id,
        amount: support.amount,
        playerRelevant: options.playerPolityId === target.id || options.playerPolityId === exile.id || options.playerPolityId === host.id,
        summary: `${target.name} has detected signs that ${host.name} is materially supporting the restoration network of ${exile.name}.`,
      });
    }

    const uprisingHazard = operation.network >= 0.22 && operation.materialSupport >= 0.1
      ? clamp((0.18 + operation.network * 0.55 + operation.materialSupport * 0.25) * years)
      : 0;
    if (uprisingHazard <= 0 || rng() >= uprisingHazard) continue;
    const uprising = attemptRestorationUprising(exile, target, polities, regions, currentTick, rng);
    if (!uprising.attempted) continue;
    events.push({
      type: uprising.succeeded ? 'foreign_backed_restoration_uprising' : 'restoration_uprising_failed',
      ...uprising,
      targetPolityId: target.id,
      exilePolityId: exile.id,
      playerRelevant: options.playerPolityId === target.id || options.playerPolityId === exile.id || options.playerPolityId === host.id,
      summary: uprising.succeeded
        ? `${exile.name} has re-established territorial government in ${regions.find((r) => r.id === uprising.targetRegionId)?.name || 'claimed territory'} with material backing from ${host.name}. A restoration civil war has begun.`
        : `An attempted restoration uprising for ${exile.name} has failed, exposing parts of its underground network.`,
    });
  }
  return events;
}
