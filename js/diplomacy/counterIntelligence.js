import { residentDiplomatFor } from './diplomats.js?v=20260909-diplomats1';
import { communicationCapabilities } from './languageCommunication.js?v=20260909-language1';
import { cryptographicCapabilities, ensureInformationIntegrity } from './informationIntegrity.js?v=20260922-info1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;

export function ensureCounterIntelligence(region) {
  region.counterIntelligence ||= {};
  const ci = region.counterIntelligence;
  const caps = communicationCapabilities(region);
  if (!Number.isFinite(ci.credentialSecurity)) ci.credentialSecurity = caps.seals ? 0.38 : 0.16;
  if (!Number.isFinite(ci.codePractice)) ci.codePractice = caps.ciphers ? 0.18 : caps.challengePhrases ? 0.07 : 0;
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
  const caps = communicationCapabilities(region);
  const crypto = cryptographicCapabilities(region);
  const info = ensureInformationIntegrity(region);
  const admin = region.governance?.administrativeControl ?? region.polityAdministration?.recordKeeping ?? 0.25;
  const seal = caps.seals ? 0.12 + caps.sealPractice * 0.18 : 0;
  const challenge = caps.challengePhrases ? caps.challengePhrasePractice * 0.08 : 0;
  // Medieval seals/challenge phrases remain useful, but modern signatures and
  // public-key infrastructure can make provenance much stronger than a seal.
  const digital = crypto.authentication * 0.16 + crypto.digitalSignatures * 0.12 + crypto.publicKeyInfrastructure * 0.08 + info.provenanceCoverage * 0.05;
  return clamp(0.16 + ci.credentialSecurity * 0.30 + clamp(admin) * 0.14 + seal + challenge + digital);
}

export function genuineAuthentication(sender, options = {}) {
  const crypto = cryptographicCapabilities(sender);
  return {
    genuine: true,
    actualSenderActorId: actorId(sender),
    claimedSenderActorId: actorId(sender),
    credentialQuality: credentialQuality(sender),
    sealed: communicationCapabilities(sender).seals,
    coded: Boolean(options.coded) && (communicationCapabilities(sender).ciphers || crypto.confidentiality > 0.45),
    digitallySigned: crypto.digitalSignatures > 0.42,
    strategicTruth: options.strategicTruth !== false,
  };
}

export function forgeryAuthentication(forger, purportedSender, options = {}) {
  const ci = ensureCounterIntelligence(forger);
  const crypto = cryptographicCapabilities(forger);
  const stolenCredentials = ci.compromisedCredentialActors.includes(actorId(purportedSender));
  const craft = clamp(options.forgeryQuality ?? (0.28 + ci.credentialSecurity * 0.18 + ci.codePractice * 0.15 + crypto.codebreaking * 0.10 + (stolenCredentials ? 0.24 : 0)));
  return {
    genuine: false,
    actualSenderActorId: actorId(forger),
    claimedSenderActorId: actorId(purportedSender),
    credentialQuality: clamp(options.apparentCredentialQuality ?? craft),
    forgeryQuality: craft,
    stolenCredentials,
    coded: Boolean(options.coded),
    digitallySigned: Boolean(options.digitallySigned),
    strategicTruth: false,
  };
}

export function assessMessageAuthenticity(receiver, message, regions = [], rng = Math.random) {
  const ci = ensureCounterIntelligence(receiver);
  const crypto = cryptographicCapabilities(receiver);
  const info = ensureInformationIntegrity(receiver);
  const auth = message.authentication || {};
  const purported = regions.find((r) => actorId(r) === (auth.claimedSenderActorId || message.senderActorId));
  const resident = purported ? residentDiplomatFor(purported, receiver.id) : null;
  const residentVerification = resident && !resident.compromised ? (0.12 + resident.localFamiliarity * 0.08) : 0;
  const admin = clamp(receiver.governance?.administrativeControl ?? 0.25);
  const modernVerification = crypto.authentication * 0.12 + crypto.digitalSignatures * 0.10 + crypto.publicKeyInfrastructure * 0.08 + info.sourceVerification * 0.06;
  const defence = clamp(0.18 + ci.credentialSecurity * 0.28 + ci.codePractice * 0.16 + ci.verificationCaution * 0.12 + admin * 0.10 + residentVerification + modernVerification);
  const apparent = clamp(auth.credentialQuality ?? 0.4);

  if (auth.genuine !== false) {
    const signedConfidence = auth.digitallySigned ? crypto.digitalSignatures * 0.12 + crypto.publicKeyInfrastructure * 0.08 : 0;
    const falseSuspicion = clamp(ci.verificationCaution * 0.08 + info.postTruthPressure * 0.025 - apparent * 0.04 - signedConfidence * 0.25, 0, 0.09);
    const suspicious = rng() < falseSuspicion;
    return { detectedForgery: false, verdict: suspicious ? 'uncertain' : 'likely_authentic', confidenceAuthentic: clamp(0.58 + apparent * 0.28 + residentVerification + signedConfidence - (suspicious ? 0.22 : 0)) };
  }

  const forgery = clamp(auth.forgeryQuality ?? apparent);
  const caps = communicationCapabilities(receiver);
  const sealCheck = auth.sealed && caps.seals ? 0.1 + caps.sealPractice * 0.12 : 0;
  const codeCheck = auth.coded && (caps.ciphers || crypto.confidentiality > 0.4) ? 0.08 + Math.max(caps.cipherPractice, crypto.authentication) * 0.12 : 0;
  const signatureCheck = auth.digitallySigned ? crypto.digitalSignatures * 0.22 + crypto.publicKeyInfrastructure * 0.14 : 0;
  const detectChance = clamp(0.06 + defence * 0.56 + sealCheck + codeCheck + signatureCheck - forgery * 0.58, 0.02, 0.98);
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
  const info = ensureInformationIntegrity(receiver);
  const secrecyPenalty = clamp(message.secrecy ?? 0.5) * 0.08;
  const routeContext = message.intercepted ? 0.06 : 0;
  // Authenticity is not truth. In the post-truth era a genuine message may still
  // contain bad intelligence or deliberate deception, so public epistemic health
  // modifies confidence but never reveals the hidden strategic truth.
  const epistemicPenalty = info.postTruthPressure * 0.10;
  return {
    ...assessment,
    intelligenceConfidence: assessment.detectedForgery ? 0.08 : clamp(assessment.confidenceAuthentic - secrecyPenalty + routeContext - epistemicPenalty),
    strategicTruthKnown: false,
  };
}

export function compromiseCredentials(region, actor) {
  const ci = ensureCounterIntelligence(region);
  const id = typeof actor === 'string' ? actor : actorId(actor);
  if (id && !ci.compromisedCredentialActors.includes(id)) ci.compromisedCredentialActors.push(id);
  return ci.compromisedCredentialActors;
}
