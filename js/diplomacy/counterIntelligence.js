import { residentDiplomatFor } from './diplomats.js?v=20260909-diplomats1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;

export function ensureCounterIntelligence(region) {
  region.counterIntelligence ||= {};
  const ci = region.counterIntelligence;
  if (!Number.isFinite(ci.credentialSecurity)) ci.credentialSecurity = 0.38;
  if (!Number.isFinite(ci.codePractice)) ci.codePractice = 0.16;
  if (!Number.isFinite(ci.verificationCaution)) ci.verificationCaution = 0.45;
  ci.credentialSecurity = clamp(ci.credentialSecurity);
  ci.codePractice = clamp(ci.codePractice);
  ci.verificationCaution = clamp(ci.verificationCaution);
  ci.compromisedCredentialActors ||= [];
  ci.detectedForgeries ||= [];
  return ci;
}

export function setCounterIntelligencePolicy(region, patch = {}) {
  const ci = ensureCounterIntelligence(region);
  for (const key of ['credentialSecurity','codePractice','verificationCaution']) {
    if (Number.isFinite(patch[key])) ci[key] = clamp(patch[key]);
  }
  return ci;
}

export function credentialQuality(region) {
  const ci = ensureCounterIntelligence(region);
  const admin = region.governance?.administrativeControl ?? region.polityAdministration?.recordKeeping ?? 0.25;
  return clamp(0.24 + ci.credentialSecurity * 0.42 + ci.codePractice * 0.18 + clamp(admin) * 0.16);
}

export function genuineAuthentication(sender, options = {}) {
  return {
    genuine: true,
    actualSenderActorId: actorId(sender),
    claimedSenderActorId: actorId(sender),
    credentialQuality: credentialQuality(sender),
    coded: Boolean(options.coded),
    strategicTruth: options.strategicTruth !== false,
  };
}

export function forgeryAuthentication(forger, purportedSender, options = {}) {
  const ci = ensureCounterIntelligence(forger);
  const stolenCredentials = ci.compromisedCredentialActors.includes(actorId(purportedSender));
  const craft = clamp(options.forgeryQuality ?? (0.28 + ci.credentialSecurity * 0.22 + ci.codePractice * 0.18 + (stolenCredentials ? 0.24 : 0)));
  return {
    genuine: false,
    actualSenderActorId: actorId(forger),
    claimedSenderActorId: actorId(purportedSender),
    credentialQuality: clamp(options.apparentCredentialQuality ?? craft),
    forgeryQuality: craft,
    stolenCredentials,
    coded: Boolean(options.coded),
    strategicTruth: false,
  };
}

export function assessMessageAuthenticity(receiver, message, regions = [], rng = Math.random) {
  const ci = ensureCounterIntelligence(receiver);
  const auth = message.authentication || {};
  const purported = regions.find((r) => actorId(r) === (auth.claimedSenderActorId || message.senderActorId));
  const resident = purported ? residentDiplomatFor(purported, receiver.id) : null;
  const residentVerification = resident && !resident.compromised ? (0.12 + resident.localFamiliarity * 0.08) : 0;
  const admin = clamp(receiver.governance?.administrativeControl ?? 0.25);
  const defence = clamp(0.2 + ci.credentialSecurity * 0.34 + ci.codePractice * 0.2 + ci.verificationCaution * 0.14 + admin * 0.12 + residentVerification);
  const apparent = clamp(auth.credentialQuality ?? 0.4);

  if (auth.genuine !== false) {
    const falseSuspicion = clamp(ci.verificationCaution * 0.08 - apparent * 0.04, 0, 0.07);
    const suspicious = rng() < falseSuspicion;
    return { detectedForgery: false, verdict: suspicious ? 'uncertain' : 'likely_authentic', confidenceAuthentic: clamp(0.58 + apparent * 0.32 + residentVerification - (suspicious ? 0.22 : 0)) };
  }

  const forgery = clamp(auth.forgeryQuality ?? apparent);
  const detectChance = clamp(0.08 + defence * 0.72 - forgery * 0.58 + (auth.coded ? ci.codePractice * 0.12 : 0), 0.03, 0.92);
  const detected = rng() < detectChance;
  if (detected) {
    ci.detectedForgeries.push({ sourceMessageId: message.id, claimedSenderActorId: auth.claimedSenderActorId, detectedTick: message.receivedTick ?? null });
    if (ci.detectedForgeries.length > 30) ci.detectedForgeries.shift();
    return { detectedForgery: true, verdict: 'forgery_detected', confidenceAuthentic: clamp(0.12 + (1 - defence) * 0.15), detectChance };
  }
  return { detectedForgery: false, verdict: 'likely_authentic', confidenceAuthentic: clamp(0.48 + apparent * 0.35 - defence * 0.12), detectChance };
}

export function intelligenceCredibilityFromMessage(receiver, message, regions = [], rng = Math.random) {
  const assessment = assessMessageAuthenticity(receiver, message, regions, rng);
  const secrecyPenalty = clamp(message.secrecy ?? 0.5) * 0.08;
  const routeContext = message.intercepted ? 0.06 : 0;
  return {
    ...assessment,
    intelligenceConfidence: assessment.detectedForgery ? 0.08 : clamp(assessment.confidenceAuthentic - secrecyPenalty + routeContext),
    strategicTruthKnown: false,
  };
}

export function compromiseCredentials(region, actor) {
  const ci = ensureCounterIntelligence(region);
  const id = typeof actor === 'string' ? actor : actorId(actor);
  if (id && !ci.compromisedCredentialActors.includes(id)) ci.compromisedCredentialActors.push(id);
  return ci.compromisedCredentialActors;
}
