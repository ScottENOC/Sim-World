import { culturalIdentity } from '../society/culture.js?v=20260907-culture1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function dominantCulture(region) {
  const groups = Array.isArray(region?.cultureGroups) ? [...region.cultureGroups] : [];
  groups.sort((a, b) => (b.share || 0) - (a.share || 0));
  return groups[0] || null;
}

function identityFor(region) {
  const group = dominantCulture(region);
  const id = group?.identityId || group?.cultureId || `culture:${region?.id || 'unknown'}`;
  return culturalIdentity(id) || { id, familyId: id };
}

export function ensureCommunicationState(region) {
  region.communicationState ||= {};
  const state = region.communicationState;
  const identity = identityFor(region);
  state.languageId ||= `lang:${identity.id}`;
  state.languageFamilyId ||= `langfam:${identity.familyId || identity.id}`;
  state.spokenComprehension ||= {};
  state.writtenComprehension ||= {};
  state.contactExperience ||= {};
  state.breakthroughs ||= [];
  state.diplomaticTraffic = Math.max(0, Number(state.diplomaticTraffic) || 0);
  state.interceptionExperience = Math.max(0, Number(state.interceptionExperience) || 0);
  state.forgeryExperience = Math.max(0, Number(state.forgeryExperience) || 0);
  state.messengerExperience = Math.max(0, Number(state.messengerExperience) || 0);
  state.sealPractice = clamp(state.sealPractice || 0);
  state.challengePhrasePractice = clamp(state.challengePhrasePractice || 0);
  state.cipherPractice = clamp(state.cipherPractice || 0);
  state.writingAvailable = Boolean(state.writingAvailable);
  state.archiveAvailable = Boolean(state.archiveAvailable);
  return state;
}

function hasBreakthrough(state, id) { return state.breakthroughs.includes(id); }
function addBreakthrough(state, id) { if (!hasBreakthrough(state, id)) state.breakthroughs.push(id); }

export function communicationCapabilities(region) {
  const state = ensureCommunicationState(region);
  return {
    writing: state.writingAvailable,
    seals: hasBreakthrough(state, 'seal_authentication'),
    trainedInterpreters: hasBreakthrough(state, 'trained_interpreters'),
    challengePhrases: hasBreakthrough(state, 'challenge_phrases'),
    ciphers: hasBreakthrough(state, 'cipher_conventions'),
    oralDispatches: true,
    sealPractice: state.sealPractice,
    challengePhrasePractice: state.challengePhrasePractice,
    cipherPractice: state.cipherPractice,
  };
}

export function languageComprehension(observer, foreign, mode = 'spoken') {
  if (!observer || !foreign) return 0;
  const a = ensureCommunicationState(observer);
  const b = ensureCommunicationState(foreign);
  if (a.languageId === b.languageId) return 1;
  const map = mode === 'written' ? a.writtenComprehension : a.spokenComprehension;
  const learned = clamp(map[b.languageId] || 0);
  const related = a.languageFamilyId === b.languageFamilyId ? (mode === 'written' ? 0.18 : 0.32) : 0;
  const interpreterBonus = hasBreakthrough(a, 'trained_interpreters') ? 0.12 : 0;
  if (mode === 'written' && (!a.writingAvailable || !b.writingAvailable)) return 0;
  return clamp(Math.max(learned, related) + interpreterBonus);
}

export function recordLanguageContact(observer, foreign, weight = 1, channels = {}) {
  if (!observer || !foreign || observer.id === foreign.id) return;
  const a = ensureCommunicationState(observer);
  const b = ensureCommunicationState(foreign);
  const w = Math.max(0.05, Math.min(6, Number(weight) || 1));
  const prior = clamp(a.spokenComprehension[b.languageId] || 0);
  const familyFloor = a.languageFamilyId === b.languageFamilyId ? 0.32 : 0;
  const gain = (1 - Math.max(prior, familyFloor)) * 0.0065 * w;
  a.spokenComprehension[b.languageId] = clamp(Math.max(prior, familyFloor) + gain);
  a.contactExperience[b.languageId] = Math.max(0, Number(a.contactExperience[b.languageId]) || 0) + w;

  if (channels.written && a.writingAvailable && b.writingAvailable) {
    const writtenPrior = clamp(a.writtenComprehension[b.languageId] || 0);
    const writtenGain = (1 - writtenPrior) * 0.0045 * w;
    a.writtenComprehension[b.languageId] = clamp(writtenPrior + writtenGain);
  }
}

export function diplomatLanguageComprehension(diplomat, home, host) {
  if (!diplomat || !host) return 0;
  diplomat.languageSkills ||= {};
  const hostState = ensureCommunicationState(host);
  if (home) {
    const base = languageComprehension(home, host, 'spoken');
    diplomat.languageSkills[hostState.languageId] = Math.max(clamp(diplomat.languageSkills[hostState.languageId] || 0), base);
  }
  return clamp(diplomat.languageSkills[hostState.languageId] || 0);
}

export function trainDiplomatLanguage(diplomat, home, host, elapsedDays = 7) {
  if (!diplomat || !host) return 0;
  diplomat.languageSkills ||= {};
  const state = ensureCommunicationState(host);
  const current = diplomatLanguageComprehension(diplomat, home, host);
  const daily = 0.0008 * (0.6 + clamp(diplomat.localFamiliarity || 0) * 0.6);
  const next = clamp(current + (1 - current) * daily * Math.max(0, elapsedDays));
  diplomat.languageSkills[state.languageId] = next;
  if (home) {
    const homeState = ensureCommunicationState(home);
    homeState.spokenComprehension[state.languageId] = Math.max(clamp(homeState.spokenComprehension[state.languageId] || 0), next * 0.45);
  }
  return next;
}

export function chooseMessageMedium(sender, target, complexity = 0.5, options = {}) {
  const senderCaps = communicationCapabilities(sender);
  const writtenUnderstanding = languageComprehension(target, sender, 'written');
  const spokenUnderstanding = languageComprehension(target, sender, 'spoken');
  if (options.forceOral) return { medium: 'oral_memorised', comprehension: spokenUnderstanding };
  if (senderCaps.writing && (writtenUnderstanding >= 0.2 || options.interpreterAvailable)) {
    return { medium: senderCaps.seals ? 'sealed_written' : 'written', comprehension: writtenUnderstanding };
  }
  return { medium: 'oral_memorised', comprehension: spokenUnderstanding, memoryBurden: clamp(complexity) };
}

export function courierProfile(sender, medium, complexity = 0.5) {
  const state = ensureCommunicationState(sender);
  const experience = clamp(1 - Math.exp(-state.messengerExperience / 80));
  return {
    loyalty: clamp(0.58 + experience * 0.2),
    resolve: clamp(0.48 + experience * 0.24),
    memoryAccuracy: medium === 'oral_memorised' ? clamp(0.78 + experience * 0.18 - clamp(complexity) * 0.12) : 1,
    knowsFullContents: medium === 'oral_memorised',
  };
}

export function interceptedContentChance(message, pressure = 0.5) {
  const courier = message?.courier || {};
  if (message?.medium === 'oral_memorised') {
    const divulge = clamp(0.1 + clamp(pressure) * 0.38 + (1 - clamp(courier.resolve || 0.5)) * 0.32);
    return divulge;
  }
  if (message?.medium === 'sealed_written') return 0.88;
  if (message?.medium === 'written') return 0.96;
  return 0.55;
}

export function tickCommunicationPractices(regions, polities = [], agreements = [], campaigns = [], currentTick = 0, elapsedDays = 7) {
  const polityById = new Map(polities.map((p) => [p.id, p]));
  const byId = new Map(regions.map((r) => [r.id, r]));
  const weekScale = Math.max(0.01, elapsedDays / 7);

  for (const region of regions) {
    const state = ensureCommunicationState(region);
    const polity = polityById.get(region.governance?.sovereignPolityId || region.polityId);
    const admin = polity?.administration;
    state.writingAvailable = Boolean(admin?.breakthroughs?.has?.('writing') || region.education?.writingTradition || region.unlockedTechIds?.has?.('writing'));
    state.archiveAvailable = Boolean(admin?.breakthroughs?.has?.('palace_archives'));

    const tradeWeight = Math.log1p(Math.max(0, region.tradeEconomy?.weeklyImports || 0) + Math.max(0, region.tradeEconomy?.weeklyExports || 0));
    const traffic = (region.diplomaticMessages || []).filter((m) => (m.departTick ?? -Infinity) >= currentTick - 52).length;
    state.diplomaticTraffic += traffic * 0.025 * weekScale;
    state.messengerExperience += (traffic * 0.18 + (admin?.communications || 0) * 0.08) * weekScale;

    if (state.writingAvailable && (admin?.recordKeeping || 0) >= 0.22 && ((admin?.accounting || 0) >= 0.18 || tradeWeight >= 3.5)) {
      state.sealPractice = clamp(state.sealPractice + 0.0018 * weekScale * (0.5 + tradeWeight / 6));
      if (state.sealPractice >= 0.12) addBreakthrough(state, 'seal_authentication');
    }
    if (state.messengerExperience + state.interceptionExperience >= 20) {
      state.challengePhrasePractice = clamp(state.challengePhrasePractice + 0.0012 * weekScale);
      if (state.challengePhrasePractice >= 0.1) addBreakthrough(state, 'challenge_phrases');
    }
    const foreignExperience = Object.values(state.contactExperience).reduce((sum, n) => sum + (Number(n) || 0), 0);
    if (foreignExperience >= 18 && ((admin?.officialdom || 0) >= 0.08 || state.diplomaticTraffic >= 4)) addBreakthrough(state, 'trained_interpreters');
    if (state.writingAvailable && state.archiveAvailable && state.interceptionExperience + state.forgeryExperience >= 35 && state.diplomaticTraffic >= 10) {
      state.cipherPractice = clamp(state.cipherPractice + 0.0008 * weekScale);
      if (state.cipherPractice >= 0.12) addBreakthrough(state, 'cipher_conventions');
    }
  }

  for (const region of regions) {
    const recent = region.recentTradePartners instanceof Map ? [...region.recentTradePartners.keys()] : [...(region.tradePartnerIds || [])];
    for (const otherId of recent.slice(0, 12)) {
      const other = byId.get(otherId); if (!other) continue;
      recordLanguageContact(region, other, 0.35 * weekScale, { written: communicationCapabilities(region).writing && communicationCapabilities(other).writing });
    }
  }
  for (const agreement of agreements || []) {
    if (!agreement?.active) continue;
    const a = byId.get(agreement.fromId || agreement.proposerRegionId);
    const b = byId.get(agreement.toId || agreement.partnerRegionId);
    if (a && b) {
      recordLanguageContact(a, b, 0.45 * weekScale, { written: true });
      recordLanguageContact(b, a, 0.45 * weekScale, { written: true });
    }
  }
  for (const campaign of campaigns || []) {
    if (campaign.completed) continue;
    const a = byId.get(campaign.attackerId); const b = byId.get(campaign.defenderId);
    if (a && b) {
      recordLanguageContact(a, b, 0.22 * weekScale, { written: false });
      recordLanguageContact(b, a, 0.3 * weekScale, { written: false });
    }
  }
}
