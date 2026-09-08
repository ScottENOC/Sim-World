import { knowledgeOf, KNOWLEDGE_THRESHOLDS, directContactIds } from '../core/knowledge.js?v=20260906-scouting1';
import { activeAgreementBetween, attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { availableVassalLevies } from '../politics/polities.js?v=20260904-war1';
import { canCampaign } from './campaigns.js?v=20260905-projects1';

export const MILITARY_POSTURES = Object.freeze({
  PEACE: 'peace',
  GUARDED: 'guarded',
  PREPARE_WAR: 'prepare_war',
  MOBILISE_WAR: 'mobilise_war',
  EMERGENCY_DEFENCE: 'emergency_defence',
});

export const SUPPORT_ASSUMPTIONS = Object.freeze({
  NONE: 'none',
  CONSERVATIVE: 'conservative',
  NORMAL: 'normal',
  OPTIMISTIC: 'optimistic',
});

const SUPPORT_FACTOR = Object.freeze({ none: 0, conservative: 0.35, normal: 0.62, optimistic: 0.82 });
const POSTURE_FORCE = Object.freeze({ peace: 1, guarded: 1.2, prepare_war: 1.55, mobilise_war: 1.9, emergency_defence: 2.2 });
const POSTURE_READINESS = Object.freeze({ peace: 0.42, guarded: 0.58, prepare_war: 0.78, mobilise_war: 0.94, emergency_defence: 1 });

function clamp(v, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, Number(v) || 0)); }
function actorId(region) { return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id; }

export function ensureMilitaryStrategy(region) {
  if (!region.militaryStrategy || typeof region.militaryStrategy !== 'object') region.militaryStrategy = {};
  const s = region.militaryStrategy;
  if (!Object.values(MILITARY_POSTURES).includes(s.posture)) s.posture = MILITARY_POSTURES.PEACE;
  if (!Number.isFinite(s.garrisonFloor)) s.garrisonFloor = 1;
  s.garrisonFloor = clamp(s.garrisonFloor, 0.1, 1);
  if (!Number.isFinite(s.spendingPriority)) s.spendingPriority = 0.45;
  s.spendingPriority = clamp(s.spendingPriority, 0.1, 1);
  if (!Number.isFinite(s.desiredPreparationWeeks)) s.desiredPreparationWeeks = 26;
  s.desiredPreparationWeeks = Math.max(4, Math.min(260, Math.round(s.desiredPreparationWeeks)));
  if (!Object.values(SUPPORT_ASSUMPTIONS).includes(s.vassalAssumption)) s.vassalAssumption = SUPPORT_ASSUMPTIONS.CONSERVATIVE;
  if (!Object.values(SUPPORT_ASSUMPTIONS).includes(s.allyAssumption)) s.allyAssumption = SUPPORT_ASSUMPTIONS.CONSERVATIVE;
  if (!Number.isFinite(s.secrecy)) s.secrecy = 0.35;
  s.secrecy = clamp(s.secrecy);
  s.targetRegionId ||= null;
  s.targetPolityId ||= null;
  if (!s.planReport || typeof s.planReport !== 'object') s.planReport = {};
  return s;
}

export function setMilitaryStrategy(region, patch = {}) {
  const s = ensureMilitaryStrategy(region);
  Object.assign(s, patch);
  return ensureMilitaryStrategy(region);
}

function estimatedEnemyPersonnel(region, target) {
  if (!target) return 0;
  const familiarity = knowledgeOf(region, target.id);
  if (familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED) return Math.max(25, target.army?.personnel || 0);
  if (familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION) return Math.max(25, (target.demographics?.workingAge || target.population * 0.55) * 0.018);
  return Math.max(25, (target.population || 0) * 0.007);
}

function uncertaintyFor(region, target) {
  if (!target) return 0.2;
  const familiarity = knowledgeOf(region, target.id);
  if (familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED) return 0.12;
  if (familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION) return 0.28;
  if (familiarity >= KNOWLEDGE_THRESHOLDS.BORDER) return 0.45;
  return 0.65;
}

function normalDefenceEstablishment(region) {
  const working = Math.max(1, region.demographics?.workingAge || region.population * 0.55 || 1);
  const insecurity = 1 - clamp(region.safetyRating ?? 1);
  const coastal = region.isCoastal ? 0.0015 : 0;
  const fortSignal = (region.construction?.assets || []).filter((a) => ['hill_fort','coastal_fortifications','settlement_walls','watchtowers'].includes(a.typeId) && (a.condition ?? 1) > 0.45).length;
  return Math.max(20, working * (0.008 + insecurity * 0.008 + coastal) + fortSignal * 35);
}

function vassalContribution(region, regions, polities, currentTick, assumption) {
  const factor = SUPPORT_FACTOR[assumption] ?? 0;
  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };
  const offers = availableVassalLevies(region, regions, polities, currentTick) || [];
  let nominal = 0; let expected = 0;
  const sources = [];
  for (const offer of offers) {
    const available = Math.max(0, Number(offer.available) || 0);
    const governance = offer.region?.governance || {};
    const loyalty = clamp(governance.governor?.loyalty ?? (1 - (governance.autonomy || 0.5) * 0.35));
    const hist = governance.levyHistory || {};
    const survival = hist.sent > 0 ? clamp(hist.returned / hist.sent) : 0.72;
    const confidence = clamp(0.35 + loyalty * 0.4 + survival * 0.25);
    nominal += available;
    const discounted = available * factor * confidence;
    expected += discounted;
    if (available > 0) sources.push({ regionId: offer.region.id, nominal: available, expected: discounted, confidence });
  }
  return { nominal, expected, sources };
}

function allyContribution(region, regions, agreements, assumption) {
  const factor = SUPPORT_FACTOR[assumption] ?? 0;
  if (factor <= 0) return { nominal: 0, expected: 0, sources: [] };
  let nominal = 0; let expected = 0; const sources = [];
  for (const other of regions) {
    if (other.id === region.id) continue;
    const active = activeAgreementBetween(agreements, region.id, other.id, 'war_commitment') || activeAgreementBetween(agreements, region.id, other.id, 'military_support');
    if (!active) continue;
    const personnel = active.type === 'war_commitment'
      ? Math.max(0, active.personnel || 0)
      : Math.max(0, Math.min(active.personnel || 0, (other.army?.personnel || 0) * 0.45));
    if (personnel <= 0) continue;
    const attitude = clamp((attitudeToward(other, region.id) + 1) / 2);
    const confidence = clamp(0.35 + attitude * 0.5 + (active.type === 'war_commitment' ? 0.15 : 0));
    nominal += personnel;
    const discounted = personnel * factor * confidence;
    expected += discounted;
    sources.push({ regionId: other.id, nominal: personnel, expected: discounted, confidence, agreementId: active.id });
  }
  return { nominal, expected, sources };
}

function campaignNeed(region, target, activeCampaigns, regions, polities) {
  if (!target) return { reachable: false, viaSea: false, enemy: 0, ratio: 1.25 };
  const reach = canCampaign(region, target, activeCampaigns || [], regions, polities || []);
  const enemy = estimatedEnemyPersonnel(region, target);
  const uncertainty = uncertaintyFor(region, target);
  const defenderAdvantage = 1.18 + uncertainty * 0.34;
  const ratio = 1.18 + uncertainty * 0.42 + (reach?.viaSea ? 0.22 : 0);
  return { reachable: Boolean(reach?.possible), viaSea: Boolean(reach?.viaSea), enemy: enemy * defenderAdvantage, ratio };
}

export function reviewMilitaryStrategy(region, context = {}) {
  const strategy = ensureMilitaryStrategy(region);
  const { regions = [], polities = [], agreements = [], activeCampaigns = [], currentTick = 0 } = context;
  const target = regions.find((r) => r.id === strategy.targetRegionId) || null;
  const working = Math.max(1, region.demographics?.workingAge || region.population * 0.55 || 1);
  const normalGarrison = normalDefenceEstablishment(region);
  const garrisonFloor = strategy.posture === MILITARY_POSTURES.PEACE ? 1 : strategy.garrisonFloor;
  const retainedGarrison = normalGarrison * garrisonFloor;
  const campaign = campaignNeed(region, target, activeCampaigns, regions, polities);
  const vassals = vassalContribution(region, regions, polities, currentTick, strategy.vassalAssumption);
  const allies = allyContribution(region, regions, agreements, strategy.allyAssumption);
  const supportExpected = vassals.expected + allies.expected;

  const peacetimeField = working * 0.0025;
  let desiredField = peacetimeField;
  if (strategy.posture === MILITARY_POSTURES.GUARDED) desiredField = working * 0.0045;
  if ((strategy.posture === MILITARY_POSTURES.PREPARE_WAR || strategy.posture === MILITARY_POSTURES.MOBILISE_WAR) && target) {
    desiredField = Math.max(peacetimeField, campaign.enemy * campaign.ratio - supportExpected);
  }
  if (strategy.posture === MILITARY_POSTURES.EMERGENCY_DEFENCE) desiredField = Math.max(working * 0.012, normalGarrison * 1.4);

  const postureScale = POSTURE_FORCE[strategy.posture] || 1;
  let establishment = retainedGarrison + desiredField * postureScale;
  const mobilisationCeiling = working * (0.012 + strategy.spendingPriority * 0.045);
  establishment = Math.max(retainedGarrison, Math.min(establishment, mobilisationCeiling));
  establishment = Math.round(establishment);
  region.targetArmySize = establishment;

  const current = Math.max(0, region.army?.personnel || 0);
  const manpowerReadiness = establishment > 0 ? clamp(current / establishment) : 1;
  const readinessTarget = POSTURE_READINESS[strategy.posture] || 0.5;
  const preparationGap = Math.max(0, establishment - current);
  const recruitPerWeekNeeded = preparationGap / Math.max(1, strategy.desiredPreparationWeeks);
  const estimatedWeeklyPayroll = establishment * 0.012;
  const estimatedPreparationSpend = preparationGap * (0.25 + readinessTarget * 0.55);

  strategy.planReport = {
    reviewedTick: currentTick,
    targetRegionId: target?.id || null,
    targetName: target?.name || null,
    reachable: campaign.reachable,
    viaSea: campaign.viaSea,
    estimatedEnemy: Math.round(campaign.enemy),
    enemyUncertainty: target ? uncertaintyFor(region, target) : 0,
    normalGarrison: Math.round(normalGarrison),
    retainedGarrison: Math.round(retainedGarrison),
    desiredFieldArmy: Math.round(desiredField),
    expectedVassalSupport: Math.round(vassals.expected),
    nominalVassalSupport: Math.round(vassals.nominal),
    expectedAllySupport: Math.round(allies.expected),
    nominalAllySupport: Math.round(allies.nominal),
    establishment,
    currentPersonnel: Math.round(current),
    manpowerReadiness,
    readinessTarget,
    recruitPerWeekNeeded,
    estimatedWeeklyPayroll,
    estimatedPreparationSpend,
  };
  return strategy.planReport;
}

export function chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns = []) {
  const strategy = ensureMilitaryStrategy(region);
  const known = [...directContactIds(region)].map((id) => regions.find((r) => r.id === id)).filter(Boolean);
  let threat = null;
  let threatScore = 0;
  for (const other of known) {
    const hostility = Math.max(0, -attitudeToward(region, other.id));
    if (hostility <= 0.2) continue;
    const enemy = estimatedEnemyPersonnel(region, other);
    const score = hostility * enemy / Math.max(25, region.army?.personnel || 25);
    if (score > threatScore) { threatScore = score; threat = other; }
  }
  if (threatScore > 1.4) {
    strategy.posture = MILITARY_POSTURES.EMERGENCY_DEFENCE;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 1;
  } else if (threatScore > 0.7) {
    strategy.posture = MILITARY_POSTURES.GUARDED;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 0.8;
  } else if (strategy.posture === MILITARY_POSTURES.EMERGENCY_DEFENCE || strategy.posture === MILITARY_POSTURES.GUARDED) {
    strategy.posture = MILITARY_POSTURES.PEACE;
    strategy.targetRegionId = null;
    strategy.garrisonFloor = 1;
  }
  reviewMilitaryStrategy(region, { regions, agreements, polities, currentTick, activeCampaigns });
  return strategy;
}
