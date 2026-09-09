import { culturalIdentity } from '../society/culture.js?v=20260907-culture1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const finite = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

function cultureGroups(region) {
  const groups = Array.isArray(region?.cultureGroups) ? region.cultureGroups : [];
  return groups.length ? groups : [{ identityId: `culture:${region?.id || 'unknown'}`, share: 1 }];
}

function languageForCulture(group) {
  const id = group?.identityId || group?.cultureId || group?.ancestryId || 'unknown';
  const identity = culturalIdentity(id) || { id, familyId: id };
  return { languageId: `lang:${identity.id}`, familyId: `langfam:${identity.familyId || identity.id}` };
}

export function ensureLanguageNetwork(region) {
  region.languageNetwork ||= {};
  const n = region.languageNetwork;
  n.communities ||= {};
  n.secondLanguage ||= {};
  n.specialists ||= {};
  n.institutions ||= { court: [], administration: [], legal: [], military: [], trade: [], religious: [], cultural: [] };
  for (const key of ['court','administration','legal','military','trade','religious','cultural']) n.institutions[key] ||= [];
  n.culturalExposure ||= {};
  n.culturalPrestige ||= {};
  n.mediaPractices ||= { oral: 0.12, manuscript: 0, print: 0, recorded: 0, broadcast: 0, screen: 0, networked: 0 };
  return n;
}

export function refreshNativeLanguageCommunities(region) {
  const n = ensureLanguageNetwork(region);
  const next = {};
  for (const group of cultureGroups(region)) {
    const lang = languageForCulture(group);
    const share = Math.max(0, finite(group.share, 0));
    if (!next[lang.languageId]) next[lang.languageId] = { share: 0, familyId: lang.familyId };
    next[lang.languageId].share += share;
  }
  const total = Object.values(next).reduce((s, x) => s + x.share, 0) || 1;
  for (const entry of Object.values(next)) entry.share /= total;
  n.communities = next;
  const dominant = Object.entries(next).sort((a,b) => b[1].share - a[1].share)[0]?.[0];
  if (dominant && n.institutions.court.length === 0) n.institutions.court = [dominant];
  if (dominant && n.institutions.administration.length === 0) n.institutions.administration = [dominant];
  return n.communities;
}

export function dominantLanguageId(region) {
  const c = refreshNativeLanguageCommunities(region);
  return Object.entries(c).sort((a,b) => b[1].share - a[1].share)[0]?.[0] || `lang:culture:${region?.id || 'unknown'}`;
}

export function nativeShare(region, languageId) {
  return refreshNativeLanguageCommunities(region)[languageId]?.share || 0;
}

function ensureSecond(region, languageId) {
  const n = ensureLanguageNetwork(region);
  n.secondLanguage[languageId] ||= { passive: 0, basic: 0, working: 0, fluent: 0, literate: 0 };
  return n.secondLanguage[languageId];
}

function ensureSpecialist(region, languageId) {
  const n = ensureLanguageNetwork(region);
  n.specialists[languageId] ||= { conversational: 0, working: 0, fluent: 0, literate: 0, scribes: 0, interpreters: 0 };
  return n.specialists[languageId];
}

export function languagePopulationProfile(region, languageId) {
  const native = nativeShare(region, languageId);
  const second = ensureSecond(region, languageId);
  return {
    nativeShare: native,
    passiveShare: clamp(native + second.passive),
    basicShare: clamp(native + second.basic),
    workingShare: clamp(native + second.working),
    fluentShare: clamp(native + second.fluent),
    literateShare: clamp(second.literate + (native * (region?.education?.writingTradition ? 0.08 : 0))),
  };
}

export function specialistLanguageCapability(region, languageId) {
  const native = nativeShare(region, languageId);
  const s = ensureSpecialist(region, languageId);
  const population = Math.max(1, finite(region?.population, 1));
  return {
    ...s,
    nativePopulation: Math.round(population * native),
    available: native > 0 || s.working > 0 || s.interpreters > 0 || s.scribes > 0,
  };
}

export function recordLanguageContactPopulation(region, foreign, weight = 1, channel = 'trade') {
  if (!region || !foreign || region.id === foreign.id) return;
  const foreignLang = dominantLanguageId(foreign);
  const profile = ensureSecond(region, foreignLang);
  const specialists = ensureSpecialist(region, foreignLang);
  const w = Math.max(0.01, Math.min(10, finite(weight, 1)));
  const multipliers = {
    trade: { pop: 0.000012, spec: 0.12 }, diplomacy: { pop: 0.000001, spec: 0.35 },
    war: { pop: 0.000006, spec: 0.18 }, migration: { pop: 0.00008, spec: 0.08 },
    administration: { pop: 0.000025, spec: 0.24 }, culture: { pop: 0.00002, spec: 0.03 },
  }[channel] || { pop: 0.000008, spec: 0.1 };
  profile.passive = clamp(profile.passive + w * multipliers.pop * 3.2);
  profile.basic = clamp(profile.basic + w * multipliers.pop * 1.6);
  profile.working = clamp(profile.working + w * multipliers.pop * 0.45);
  profile.fluent = clamp(profile.fluent + w * multipliers.pop * 0.12);
  const populationScale = Math.max(1, Math.log10(Math.max(10, finite(region.population, 1000))));
  specialists.conversational += w * multipliers.spec * populationScale;
  specialists.working += w * multipliers.spec * 0.48 * populationScale;
  specialists.fluent += w * multipliers.spec * 0.12 * populationScale;
  if (channel === 'diplomacy' || channel === 'administration') specialists.interpreters += w * multipliers.spec * 0.035 * populationScale;
}

export function recordWrittenLanguageTraining(region, foreign, weight = 1) {
  const languageId = dominantLanguageId(foreign);
  const profile = ensureSecond(region, languageId);
  const specialists = ensureSpecialist(region, languageId);
  const w = Math.max(0.01, Math.min(10, finite(weight, 1)));
  profile.literate = clamp(profile.literate + w * 0.0000025);
  specialists.literate += w * 0.12;
  specialists.scribes += w * 0.025;
}

export function courtLanguageCompetence(region, languageId, mode = 'spoken') {
  const n = ensureLanguageNetwork(region);
  if (nativeShare(region, languageId) > 0) return 1;
  const s = specialistLanguageCapability(region, languageId);
  const institutional = Object.values(n.institutions).some(list => list.includes(languageId));
  if (mode === 'written') {
    if (s.scribes >= 1 || s.literate >= 1) return clamp(0.62 + Math.log1p(s.scribes + s.literate) * 0.1);
    return institutional ? 0.35 : 0;
  }
  if (s.interpreters >= 1 || s.fluent >= 1) return clamp(0.68 + Math.log1p(s.interpreters + s.fluent) * 0.09);
  if (s.working >= 1) return clamp(0.42 + Math.log1p(s.working) * 0.08);
  if (s.conversational >= 1) return 0.25;
  return institutional ? 0.22 : 0;
}

export function sharedCommunicationLanguage(sender, receiver, mode = 'spoken') {
  if (!sender || !receiver) return { languageId: null, competence: 0, linguaFranca: false };
  const senderNet = ensureLanguageNetwork(sender); const receiverNet = ensureLanguageNetwork(receiver);
  refreshNativeLanguageCommunities(sender); refreshNativeLanguageCommunities(receiver);
  const candidates = new Set([
    ...Object.keys(senderNet.communities), ...Object.keys(receiverNet.communities),
    ...Object.keys(senderNet.specialists), ...Object.keys(receiverNet.specialists),
    ...Object.values(senderNet.institutions).flat(), ...Object.values(receiverNet.institutions).flat(),
  ]);
  let best = { languageId: null, competence: 0, linguaFranca: false };
  for (const languageId of candidates) {
    const a = courtLanguageCompetence(sender, languageId, mode);
    const b = courtLanguageCompetence(receiver, languageId, mode);
    const competence = Math.min(a, b);
    const neitherNative = nativeShare(sender, languageId) === 0 && nativeShare(receiver, languageId) === 0;
    const institutional = Object.values(senderNet.institutions).some(x => x.includes(languageId)) || Object.values(receiverNet.institutions).some(x => x.includes(languageId));
    const score = competence > 0 ? competence + (institutional ? 0.035 : 0) : 0;
    if (score > best.competence) best = { languageId, competence: clamp(score), linguaFranca: neitherNative };
  }
  return best;
}

export function adoptInstitutionalLanguage(region, domain, languageId) {
  const n = ensureLanguageNetwork(region);
  if (!n.institutions[domain]) return false;
  if (!n.institutions[domain].includes(languageId)) n.institutions[domain].push(languageId);
  return true;
}

export function recordCulturalExposure(region, source, weight = 1, medium = 'oral') {
  if (!region || !source || region.id === source.id) return;
  const sourceLang = dominantLanguageId(source);
  const n = ensureLanguageNetwork(region);
  const w = Math.max(0.01, Math.min(20, finite(weight, 1)));
  const reach = { oral: 0.18, manuscript: 0.3, print: 0.55, recorded: 0.7, broadcast: 0.86, screen: 0.92, networked: 1 }[medium] || 0.18;
  n.culturalExposure[sourceLang] = clamp((n.culturalExposure[sourceLang] || 0) + w * 0.0008 * reach);
  const profile = ensureSecond(region, sourceLang);
  profile.passive = clamp(profile.passive + w * 0.000025 * reach);
  profile.basic = clamp(profile.basic + w * 0.000006 * reach);
  recordLanguageContactPopulation(region, source, w * reach * 0.15, 'culture');
}

export function updateCulturalLanguageReach(region, elapsedDays = 7) {
  const n = ensureLanguageNetwork(region);
  const tech = region?.unlockedTechIds instanceof Set ? region.unlockedTechIds : new Set(region?.unlockedTechIds || []);
  const art = Math.max(0, finite(region?.art?.prestige ?? region?.culturalPrestige ?? region?.prestige?.cultural, 0));
  const religion = Math.max(0, finite(region?.religion?.prestige ?? region?.religiousPrestige, 0));
  const oral = clamp(0.08 + Math.log1p(art + religion) * 0.04);
  n.mediaPractices.oral = Math.max(n.mediaPractices.oral, oral);
  if (tech.has('writing')) n.mediaPractices.manuscript = Math.max(n.mediaPractices.manuscript, 0.08);
  if (tech.has('printing_press')) n.mediaPractices.print = Math.max(n.mediaPractices.print, 0.25);
  if (tech.has('recorded_sound')) n.mediaPractices.recorded = Math.max(n.mediaPractices.recorded, 0.35);
  if (tech.has('radio')) n.mediaPractices.broadcast = Math.max(n.mediaPractices.broadcast, 0.5);
  if (tech.has('cinema') || tech.has('television')) n.mediaPractices.screen = Math.max(n.mediaPractices.screen, 0.55);
  if (tech.has('internet')) n.mediaPractices.networked = Math.max(n.mediaPractices.networked, 0.7);
  const lang = dominantLanguageId(region);
  n.culturalPrestige[lang] = clamp((n.culturalPrestige[lang] || 0) * 0.995 + oral * Math.max(0.01, elapsedDays / 365));
  return n.mediaPractices;
}
