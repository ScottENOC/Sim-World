import { enterGovernmentInExile, initialisePoliticalContinuity } from './continuityCore.js?v=20260916-regime1';
import { ensureInstitutionalGovernment } from './institutionalPowers.js?v=20260916-regime1';
import { ensureInstitutionalCrisisState } from './institutionalCrises.js?v=20260916-regime1';
import { polityPopularWellbeing } from './popularWellbeing.js?v=20260916-regime1';

const DAYS_PER_YEAR = 365.2425;
const COOLDOWN_WEEKS = 156;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function sovereignTerritories(polity, regions) {
  return (regions || []).filter((region) => region.governance?.sovereignPolityId === polity?.id);
}

function averageMobilisation(polity, regions) {
  const territories = sovereignTerritories(polity, regions);
  if (!territories.length) return 0;
  let population = 0;
  let total = 0;
  for (const region of territories) {
    const weight = Math.max(1, Number(region.population) || 1);
    population += weight;
    total += clamp(region.popularWellbeing?.mobilisationPotential || 0) * weight;
  }
  return population ? total / population : 0;
}

function militaryLoyalty(polity, regions) {
  const territories = sovereignTerritories(polity, regions);
  if (!territories.length) return 0.5;
  let forces = 0;
  let loyal = 0;
  for (const region of territories) {
    const personnel = Math.max(1, Number(region.army?.personnel || 0) + Number(region.army?.away || 0));
    const localStability = clamp(region.stability ?? 0.55);
    const grievance = clamp(region.popularWellbeing?.grievance || 0.3);
    const cohesion = clamp(region.army?.cohesion ?? 0.65);
    forces += personnel;
    loyal += personnel * clamp(localStability * 0.42 + cohesion * 0.38 + (1 - grievance) * 0.2);
  }
  return forces ? loyal / forces : 0.5;
}

export function regimeChangeAssessment(polity, regions) {
  const crisis = ensureInstitutionalCrisisState(polity);
  const wellbeing = polityPopularWellbeing(polity.id, regions);
  const court = polity.stateAdministration?.court || {};
  const legitimacy = clamp(polity.continuity?.legitimacy ?? polity.administration?.legitimacy ?? 0.3);
  const mobilisation = averageMobilisation(polity, regions);
  const armyLoyalty = militaryLoyalty(polity, regions);
  const eliteCohesion = clamp(1 - (court.factionalism ?? 0.25));
  const coerciveCapacity = clamp((polity.administration?.officialdom || 0) * 0.32 + armyLoyalty * 0.44 + legitimacy * 0.24);
  const revolutionaryStrength = clamp(crisis.revolutionRisk * 0.42 + mobilisation * 0.33 + clamp(wellbeing.grievance) * 0.25 - coerciveCapacity * 0.18);
  const coupStrength = clamp(crisis.coupRisk * 0.46 + (1 - eliteCohesion) * 0.24 + (1 - armyLoyalty) * 0.18 + (1 - legitimacy) * 0.12);
  return {
    grievance: clamp(wellbeing.grievance),
    satisfaction: clamp(wellbeing.satisfaction),
    mobilisation,
    armyLoyalty,
    eliteCohesion,
    coerciveCapacity,
    revolutionaryStrength,
    coupStrength,
    revolutionRisk: clamp(crisis.revolutionRisk),
    coupRisk: clamp(crisis.coupRisk),
  };
}

function successorId(polity, kind, currentTick, polities) {
  const base = `${polity.id}:${kind}:${currentTick}`;
  if (!(polities || []).some((candidate) => candidate.id === base)) return base;
  let suffix = 2;
  while ((polities || []).some((candidate) => candidate.id === `${base}:${suffix}`)) suffix++;
  return `${base}:${suffix}`;
}

function createSuccessorGovernment(polity, kind, currentTick, polities, legitimacy) {
  const successor = {
    ...clone(polity),
    id: successorId(polity, kind, currentTick, polities),
    name: kind === 'coup' ? `${polity.name} successor government` : `${polity.name} revolutionary government`,
    subjectToPolityId: null,
    formedTick: currentTick,
    administration: clone(polity.administration || {}),
    report: clone(polity.report || {}),
    continuity: undefined,
    institutionalCrisis: undefined,
    regimeConflict: null,
    predecessorPolityId: polity.id,
    regimeOrigin: { kind, tick: currentTick },
  };
  successor.administration ||= {};
  successor.administration.legitimacy = clamp(legitimacy);
  successor.administration.breakthroughs = new Set(polity.administration?.breakthroughs || []);
  successor.report ||= { tributeReceived: 0, subjectCount: 0, administrativeLoad: 0, administrativeCapacity: 0 };
  ensureInstitutionalGovernment(successor);
  return successor;
}

function setRegionGovernment(region, successor, isCapital, contested = false) {
  region.governance ||= {};
  region.governance.sovereignPolityId = successor.id;
  if (isCapital) {
    region.governance.localPolityId = successor.id;
    region.governance.localRulerId = region.id;
    region.governance.relationship = 'core';
    region.governance.autonomy = 0;
    region.governance.administrativeControl = Math.max(0.72, Number(region.governance.administrativeControl) || 0);
  } else if (contested) {
    region.governance.relationship = 'integrated';
    region.governance.autonomy = Math.min(0.55, Number(region.governance.autonomy) || 0.4);
    region.governance.administrativeControl = Math.max(0.42, Number(region.governance.administrativeControl) || 0.42);
  }
  region.controllingActorId = successor.capitalRegionId;
}

function completeReplacement(polity, successor, regions, polities, currentTick, kind, assessment) {
  const territories = sovereignTerritories(polity, regions);
  if (!territories.length) return null;
  const capital = territories.find((region) => region.id === polity.capitalRegionId) || territories[0];
  successor.capitalRegionId = capital.id;
  successor.rulerRegionId = capital.id;
  polities.push(successor);
  for (const region of territories) setRegionGovernment(region, successor, region.id === capital.id, false);
  initialisePoliticalContinuity([successor], regions, currentTick);
  successor.continuity.status = 'sovereign';
  successor.continuity.legitimacy = clamp(successor.administration.legitimacy);
  successor.continuity.regimeOrigin = { kind, predecessorPolityId: polity.id, tick: currentTick };
  const exile = enterGovernmentInExile(polity, regions, polities, currentTick, successor.id);
  polity.regimeHistory ||= [];
  successor.regimeHistory = [...(polity.regimeHistory || []), { kind, tick: currentTick, predecessorPolityId: polity.id, successorPolityId: successor.id }];
  polity.regimeHistory.push({ kind: `${kind}_displaced`, tick: currentTick, successorPolityId: successor.id });
  const crisis = ensureInstitutionalCrisisState(polity);
  crisis.lastRegimeChangeTick = currentTick;
  const type = kind === 'coup' ? 'coup_succeeded' : 'revolution_succeeded';
  return {
    type,
    polityId: polity.id,
    successorPolityId: successor.id,
    successorName: successor.name,
    hostPolityId: exile.hostPolityId || null,
    hostRegionId: exile.hostRegionId || null,
    assessment,
    summary: kind === 'coup'
      ? 'A coup has removed the incumbent government. The displaced government survives through the political-continuity and exile system.'
      : 'A mass uprising has overthrown the incumbent government. The displaced government survives through the political-continuity and exile system.',
  };
}

function revolutionaryRegionScore(region) {
  const wellbeing = region.popularWellbeing || {};
  return clamp((wellbeing.revolutionaryPressure || 0) * 0.48 + (wellbeing.mobilisationPotential || 0) * 0.34 + (wellbeing.grievance || 0) * 0.18);
}

function startRevolutionaryCivilWar(polity, successor, regions, polities, currentTick, assessment) {
  const territories = sovereignTerritories(polity, regions);
  if (territories.length < 2) return null;
  const ranked = territories
    .map((region) => ({ region, score: revolutionaryRegionScore(region) }))
    .sort((a, b) => b.score - a.score);
  const desiredShare = clamp(0.18 + assessment.revolutionaryStrength * 0.48, 0.18, 0.58);
  const count = Math.max(1, Math.min(territories.length - 1, Math.round(territories.length * desiredShare)));
  const supporters = ranked.slice(0, count).map((item) => item.region);
  const capital = supporters[0];
  successor.capitalRegionId = capital.id;
  successor.rulerRegionId = capital.id;
  polities.push(successor);
  for (const region of supporters) setRegionGovernment(region, successor, region.id === capital.id, true);
  const incumbentTerritories = sovereignTerritories(polity, regions);
  if (incumbentTerritories.length && !incumbentTerritories.some((region) => region.id === polity.capitalRegionId)) {
    const newSeat = incumbentTerritories.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
    polity.capitalRegionId = newSeat.id;
    polity.rulerRegionId = newSeat.id;
    if (polity.continuity) polity.continuity.seatRegionId = newSeat.id;
  }
  initialisePoliticalContinuity([successor], regions, currentTick);
  successor.continuity.status = 'claimant';
  successor.continuity.legitimacy = clamp(successor.administration.legitimacy);
  successor.continuity.claims ||= {};
  polity.continuity ||= {};
  polity.continuity.claims ||= {};
  for (const region of territories) {
    successor.continuity.claims[region.id] = Math.max(successor.continuity.claims[region.id] || 0, supporters.includes(region) ? 0.9 : 0.62);
    polity.continuity.claims[region.id] = Math.max(polity.continuity.claims[region.id] || 0, 0.88);
  }
  const conflict = {
    type: 'revolution',
    startedTick: currentTick,
    incumbentPolityId: polity.id,
    revolutionaryPolityId: successor.id,
    contestedRegionIds: territories.map((region) => region.id),
    status: 'active',
  };
  polity.regimeConflict = conflict;
  successor.regimeConflict = clone(conflict);
  const crisis = ensureInstitutionalCrisisState(polity);
  crisis.lastRegimeChangeTick = currentTick;
  crisis.pressure = clamp(Math.max(crisis.pressure, 0.72));
  return {
    type: 'revolution_civil_war_started',
    polityId: polity.id,
    successorPolityId: successor.id,
    successorName: successor.name,
    revolutionaryRegionIds: supporters.map((region) => region.id),
    incumbentSeatRegionId: polity.capitalRegionId,
    assessment,
    summary: 'A revolution has gained enough support to establish a rival government, but not enough to decide the country immediately. The state is divided between incumbent and revolutionary authorities.',
  };
}

function failedAttempt(polity, kind, currentTick, assessment) {
  const crisis = ensureInstitutionalCrisisState(polity);
  crisis.lastRegimeChangeTick = currentTick;
  crisis.pressure = clamp(crisis.pressure + (kind === 'revolution' ? 0.05 : 0.035));
  crisis.protests = clamp(crisis.protests + (kind === 'revolution' ? 0.08 : 0.025));
  if (kind === 'revolution') crisis.revolutionRisk = clamp(crisis.revolutionRisk * 0.86);
  else crisis.coupRisk = clamp(crisis.coupRisk * 0.82);
  polity.institutionalPolicy ||= {};
  polity.institutionalPolicy.repression = clamp((polity.institutionalPolicy.repression || 0) + (kind === 'revolution' ? 0.05 : 0.025));
  return {
    type: kind === 'coup' ? 'coup_failed' : 'revolution_failed',
    polityId: polity.id,
    assessment,
    summary: kind === 'coup'
      ? 'A coup attempt has failed. Political pressure remains high and the government becomes more repressive.'
      : 'A revolutionary attempt has failed to displace the government. Protests and repression intensify rather than vanishing without consequence.',
  };
}

export function resolveRegimeChangeAttempt(polity, kind, regions, polities, currentTick, assessment = regimeChangeAssessment(polity, regions), rng = Math.random) {
  if (!polity || polity.continuity?.status === 'exile' || polity.regimeConflict?.status === 'active') return null;
  if (kind === 'coup') {
    const successChance = clamp(0.08 + assessment.coupStrength * 0.78, 0.05, 0.82);
    if (rng() >= successChance) return failedAttempt(polity, kind, currentTick, { ...assessment, successChance });
    const legitimacy = clamp(0.18 + assessment.eliteCohesion * 0.2 + (1 - assessment.grievance) * 0.22 + assessment.armyLoyalty * 0.1);
    const successor = createSuccessorGovernment(polity, kind, currentTick, polities, legitimacy);
    return completeReplacement(polity, successor, regions, polities, currentTick, kind, { ...assessment, successChance });
  }

  const successChance = clamp(0.04 + assessment.revolutionaryStrength * 0.82, 0.03, 0.88);
  if (rng() >= successChance) return failedAttempt(polity, kind, currentTick, { ...assessment, successChance });
  const legitimacy = clamp(0.22 + assessment.mobilisation * 0.34 + assessment.grievance * 0.18 + (1 - assessment.coerciveCapacity) * 0.12);
  const successor = createSuccessorGovernment(polity, kind, currentTick, polities, legitimacy);
  if (assessment.revolutionaryStrength >= 0.72 || sovereignTerritories(polity, regions).length < 2) {
    return completeReplacement(polity, successor, regions, polities, currentTick, kind, { ...assessment, successChance });
  }
  return startRevolutionaryCivilWar(polity, successor, regions, polities, currentTick, { ...assessment, successChance }) ||
    failedAttempt(polity, kind, currentTick, { ...assessment, successChance });
}

export function tickRegimeChange(polities, regions, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const events = [];
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  const snapshot = [...(polities || [])];
  for (const polity of snapshot) {
    if (!polity?.id || polity.continuity?.status === 'exile' || polity.regimeConflict?.status === 'active') continue;
    const crisis = ensureInstitutionalCrisisState(polity);
    if (Number.isFinite(crisis.lastRegimeChangeTick) && currentTick - crisis.lastRegimeChangeTick < COOLDOWN_WEEKS) continue;
    const assessment = regimeChangeAssessment(polity, regions);
    const revolutionHazard = assessment.revolutionRisk >= 0.58
      ? clamp((assessment.revolutionRisk - 0.5) * (0.18 + assessment.mobilisation * 0.42) * years)
      : 0;
    const coupHazard = assessment.coupRisk >= 0.58
      ? clamp((assessment.coupRisk - 0.5) * (0.14 + (1 - assessment.eliteCohesion) * 0.38) * years)
      : 0;
    if (revolutionHazard <= 0 && coupHazard <= 0) continue;


    const revolutionFirst = revolutionHazard >= coupHazard;
    const primaryKind = revolutionFirst ? 'revolution' : 'coup';
    const primaryHazard = revolutionFirst ? revolutionHazard : coupHazard;
    if (rng() >= primaryHazard) continue;
    const event = resolveRegimeChangeAttempt(polity, primaryKind, regions, polities, currentTick, assessment, rng);
    if (!event) continue;
    event.playerRelevant = polity.id === options.playerPolityId;
    events.push(event);
  }
  return events;
}
