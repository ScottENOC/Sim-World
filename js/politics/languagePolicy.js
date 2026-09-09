import { adoptInstitutionalLanguage, courtLanguageCompetence, dominantLanguageId, ensureLanguageNetwork, languagePopulationProfile, nativeShare } from '../diplomacy/languageNetworks.js?v=20260909-language-policy1';

export const LANGUAGE_POLICIES = Object.freeze({
  LOCAL: 'local',
  BILINGUAL: 'bilingual',
  STATE: 'state',
});

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const finite = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

function polityById(polities, id) { return (polities || []).find((p) => p.id === id) || null; }
function capitalFor(region, regions, polities) {
  const polity = polityById(polities, region?.governance?.sovereignPolityId || region?.polityId);
  return polity ? (regions || []).find((r) => r.id === polity.capitalRegionId) || null : null;
}

export function ensureRegionalLanguagePolicy(region) {
  if (!region?.governance) return null;
  region.governance.languagePolicy ||= {
    mode: LANGUAGE_POLICIES.LOCAL,
    lockedByPlayer: false,
    lastReviewedTick: null,
    weeklyCost: 0,
    fundedRatio: 1,
  };
  region.governance.languagePolicy.mode ||= LANGUAGE_POLICIES.LOCAL;
  return region.governance.languagePolicy;
}

export function setRegionalLanguagePolicy(region, mode, options = {}) {
  if (!region?.governance || region.governance.relationship === 'core') return { changed: false, reason: 'not_administered_region' };
  if (!Object.values(LANGUAGE_POLICIES).includes(mode)) return { changed: false, reason: 'unknown_policy' };
  if (region.governance.relationship === 'vassal' && mode !== LANGUAGE_POLICIES.LOCAL) {
    return { changed: false, reason: 'local_ruler_controls_administration' };
  }
  const policy = ensureRegionalLanguagePolicy(region);
  policy.mode = mode;
  if (options.playerChoice) policy.lockedByPlayer = true;
  if (Number.isFinite(options.currentTick)) policy.lastReviewedTick = options.currentTick;
  return { changed: true, mode };
}

function languageContext(region, capital) {
  const localLanguageId = dominantLanguageId(region);
  const stateLanguageId = capital ? dominantLanguageId(capital) : localLanguageId;
  const mismatch = localLanguageId !== stateLanguageId;
  const localShare = nativeShare(region, localLanguageId);
  const stateNativeShare = nativeShare(region, stateLanguageId);
  const stateProfile = languagePopulationProfile(region, stateLanguageId);
  const stateCourtCompetence = courtLanguageCompetence(region, stateLanguageId, 'spoken');
  const capitalLocalCompetence = capital ? courtLanguageCompetence(capital, localLanguageId, 'spoken') : 1;
  return { localLanguageId, stateLanguageId, mismatch, localShare, stateNativeShare, stateProfile, stateCourtCompetence, capitalLocalCompetence };
}

export function regionalLanguagePolicyAssessment(region, capital, polity = null) {
  const policy = ensureRegionalLanguagePolicy(region);
  const ctx = languageContext(region, capital);
  const admin = polity?.administration || {};
  const pop = Math.max(1, finite(region?.population, 1));
  const directness = clamp((region?.governance?.administrativeControl || 0) * (1 - (region?.governance?.autonomy || 0) * 0.55));
  const localMismatchWeight = ctx.mismatch ? clamp(ctx.localShare - ctx.stateNativeShare * 0.35) : 0;
  const stateWorking = ctx.stateProfile.workingShare;
  const officialCapacity = clamp((admin.officialdom || 0) * 0.55 + (admin.communications || 0) * 0.25 + (admin.recordKeeping || 0) * 0.2);

  let effects;
  if (!ctx.mismatch) {
    effects = { controlMultiplier: 1, reportDelayMultiplier: 1, corruptionDelta: 0, stabilityWeekly: 0, attitudeWeekly: 0, stateShiftPressure: 0, localRetentionBonus: 0, costPerWeek: 0 };
  } else if (policy.mode === LANGUAGE_POLICIES.LOCAL) {
    effects = {
      controlMultiplier: 0.82 + ctx.capitalLocalCompetence * 0.12,
      reportDelayMultiplier: 1.18 - ctx.capitalLocalCompetence * 0.12,
      corruptionDelta: 0.025 - ctx.capitalLocalCompetence * 0.04,
      stabilityWeekly: 0.00022 * localMismatchWeight,
      attitudeWeekly: 0.00018 * localMismatchWeight,
      stateShiftPressure: -0.22,
      localRetentionBonus: 0.2,
      costPerWeek: pop * 0.000018 * (0.7 + directness),
    };
  } else if (policy.mode === LANGUAGE_POLICIES.BILINGUAL) {
    const capability = clamp(officialCapacity * 0.58 + Math.min(ctx.capitalLocalCompetence, ctx.stateCourtCompetence) * 0.42);
    effects = {
      controlMultiplier: 0.9 + capability * 0.18,
      reportDelayMultiplier: 1.04 - capability * 0.18,
      corruptionDelta: 0.02 - capability * 0.075,
      stabilityWeekly: 0.00012 * localMismatchWeight,
      attitudeWeekly: 0.0001 * localMismatchWeight,
      stateShiftPressure: 0.05,
      localRetentionBonus: 0.12,
      costPerWeek: pop * 0.000065 * (0.8 + directness * 0.8) * (1.18 - capability * 0.25),
      staffingCapability: capability,
    };
  } else {
    const usable = clamp(stateWorking * 2.4 + ctx.stateCourtCompetence * 0.3 + officialCapacity * 0.2);
    effects = {
      controlMultiplier: 0.72 + usable * 0.43,
      reportDelayMultiplier: 1.34 - usable * 0.52,
      corruptionDelta: 0.085 - usable * 0.12,
      stabilityWeekly: -0.00042 * localMismatchWeight * (1 - stateWorking),
      attitudeWeekly: -0.00034 * localMismatchWeight * (1 - stateWorking),
      stateShiftPressure: 0.34 * directness,
      localRetentionBonus: -0.12 * directness,
      costPerWeek: pop * 0.000011 * (0.7 + directness),
      stateLanguageUsability: usable,
    };
  }
  return { mode: policy.mode, ...ctx, directness, officialCapacity, ...effects };
}

export function languagePolicyAdministrativeEffects(region) {
  return region?.governance?.languagePolicyEffects || {
    controlMultiplier: 1, reportDelayMultiplier: 1, corruptionDelta: 0,
  };
}

function setInstitutionalPolicy(region, assessment) {
  const n = ensureLanguageNetwork(region);
  const local = assessment.localLanguageId;
  const state = assessment.stateLanguageId;
  if (assessment.mode === LANGUAGE_POLICIES.LOCAL) {
    n.institutions.administration = [local];
    n.institutions.legal = [local];
  } else if (assessment.mode === LANGUAGE_POLICIES.BILINGUAL) {
    n.institutions.administration = [...new Set([local, state])];
    n.institutions.legal = [...new Set([local, state])];
  } else {
    n.institutions.administration = [state];
    n.institutions.legal = [state];
    adoptInstitutionalLanguage(region, 'court', state);
  }
  n.languagePolicyPressure ||= {};
  n.languagePolicyPressure[state] = assessment.stateShiftPressure;
  n.languagePolicyRetention ||= {};
  n.languagePolicyRetention[local] = assessment.localRetentionBonus;
}

function npcPolicyChoice(region, capital, polity) {
  if (region.governance.relationship === 'vassal') return LANGUAGE_POLICIES.LOCAL;
  const a = regionalLanguagePolicyAssessment(region, capital, polity);
  if (!a.mismatch) return LANGUAGE_POLICIES.LOCAL;
  const admin = polity?.administration || {};
  const treasury = Math.max(0, finite(capital?.treasury, 0));
  const bilingualAffordable = treasury > a.costPerWeek * 10 && (admin.officialdom || 0) >= 0.16;
  if (region.governance.relationship === 'integrated' && a.stateProfile.workingShare >= 0.18 && (admin.officialdom || 0) >= 0.35) return LANGUAGE_POLICIES.STATE;
  if (bilingualAffordable && region.governance.administrativeControl >= 0.22) return LANGUAGE_POLICIES.BILINGUAL;
  return LANGUAGE_POLICIES.LOCAL;
}

export function tickRegionalLanguagePolicies(regions, polities, currentTick = 0, elapsedDays = 7, options = {}) {
  const weekScale = Math.max(0.01, finite(elapsedDays, 7) / 7);
  const events = [];
  for (const region of regions || []) {
    if (!region?.governance || region.governance.relationship === 'core') continue;
    const policy = ensureRegionalLanguagePolicy(region);
    const polity = polityById(polities, region.governance.sovereignPolityId);
    const capital = capitalFor(region, regions, polities);
    if (!polity || !capital) continue;
    if (region.governance.relationship === 'vassal' && policy.mode !== LANGUAGE_POLICIES.LOCAL) policy.mode = LANGUAGE_POLICIES.LOCAL;
    if (!policy.lockedByPlayer && polity.id !== options.playerPolityId && (policy.lastReviewedTick === null || currentTick - policy.lastReviewedTick >= 52)) {
      const next = npcPolicyChoice(region, capital, polity);
      if (next !== policy.mode) events.push({ type: 'language_policy_changed', regionId: region.id, polityId: polity.id, from: policy.mode, to: next });
      policy.mode = next;
      policy.lastReviewedTick = currentTick;
    }
    const assessment = regionalLanguagePolicyAssessment(region, capital, polity);
    const required = Math.max(0, assessment.costPerWeek * weekScale);
    const paid = Math.min(required, Math.max(0, finite(capital.treasury, 0)));
    capital.treasury = Math.max(0, finite(capital.treasury, 0) - paid);
    policy.weeklyCost = assessment.costPerWeek;
    policy.fundedRatio = required > 0 ? paid / required : 1;
    const fundingPenalty = assessment.mode === LANGUAGE_POLICIES.BILINGUAL ? 0.72 + policy.fundedRatio * 0.28 : 0.9 + policy.fundedRatio * 0.1;
    region.governance.languagePolicyEffects = {
      ...assessment,
      controlMultiplier: assessment.controlMultiplier * fundingPenalty,
      reportDelayMultiplier: assessment.reportDelayMultiplier / Math.max(0.72, fundingPenalty),
      corruptionDelta: assessment.corruptionDelta + (1 - policy.fundedRatio) * (assessment.mode === LANGUAGE_POLICIES.BILINGUAL ? 0.08 : 0.025),
      fundedRatio: policy.fundedRatio,
    };
    setInstitutionalPolicy(region, assessment);
    region.stability = clamp((region.stability ?? 0.5) + assessment.stabilityWeekly * weekScale * (0.35 + assessment.directness * 0.65));
    const attitudeTarget = capital.id;
    if (region.attitudes instanceof Map) {
      const existing = region.attitudes.get(attitudeTarget) || 0;
      region.attitudes.set(attitudeTarget, clamp(existing + assessment.attitudeWeekly * weekScale, -1, 1));
    }
  }
  return events;
}
