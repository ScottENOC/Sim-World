import {
  adoptInstitutionalLanguage,
  courtLanguageCompetence,
  dominantLanguageId,
  ensureLanguageNetwork,
  recordCulturalExposure,
  recordLanguageContactPopulation,
  recordWrittenLanguageTraining,
  refreshNativeLanguageCommunities,
  sharedCommunicationLanguage,
  specialistLanguageCapability,
  updateCulturalLanguageReach,
} from './languageNetworks.js?v=20260909-language-networks1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function ensureCommunicationState(region) {
  region.communicationState ||= {};
  const state = region.communicationState;
  const network = ensureLanguageNetwork(region);
  refreshNativeLanguageCommunities(region);
  state.languageId = dominantLanguageId(region);
  state.languageFamilyId ||= network.communities[state.languageId]?.familyId || state.languageId;
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

// Compatibility API: this no longer means a percentage of the whole population.
// It means whether the observer's court can find people capable of communicating
// with the foreign court, potentially through a third/shared language.
export function languageComprehension(observer, foreign, mode = 'spoken') {
  if (!observer || !foreign) return 0;
  ensureCommunicationState(observer); ensureCommunicationState(foreign);
  const shared = sharedCommunicationLanguage(observer, foreign, mode);
  if (shared.competence > 0) return shared.competence;
  const foreignLanguage = dominantLanguageId(foreign);
  return courtLanguageCompetence(observer, foreignLanguage, mode);
}

export function communicationLanguage(observer, foreign, mode = 'spoken') {
  return sharedCommunicationLanguage(observer, foreign, mode);
}

export function recordLanguageContact(observer, foreign, weight = 1, channels = {}) {
  if (!observer || !foreign || observer.id === foreign.id) return;
  ensureCommunicationState(observer); ensureCommunicationState(foreign);
  let channel = 'trade';
  if (channels.diplomacy) channel = 'diplomacy';
  else if (channels.war) channel = 'war';
  else if (channels.migration) channel = 'migration';
  else if (channels.administration) channel = 'administration';
  else if (channels.culture) channel = 'culture';
  recordLanguageContactPopulation(observer, foreign, weight, channel);
  if (channels.written && observer.communicationState.writingAvailable && foreign.communicationState.writingAvailable) {
    recordWrittenLanguageTraining(observer, foreign, weight);
  }
  const foreignLanguage = dominantLanguageId(foreign);
  const court = courtLanguageCompetence(observer, foreignLanguage, 'spoken');
  observer.communicationState.spokenComprehension[foreignLanguage] = court;
  observer.communicationState.contactExperience[foreignLanguage] = Math.max(0, Number(observer.communicationState.contactExperience[foreignLanguage]) || 0) + weight;
  if (channels.written) observer.communicationState.writtenComprehension[foreignLanguage] = courtLanguageCompetence(observer, foreignLanguage, 'written');
}

export function diplomatLanguageComprehension(diplomat, home, host) {
  if (!diplomat || !host) return 0;
  diplomat.languageSkills ||= {};
  const hostLanguage = dominantLanguageId(host);
  const base = home ? courtLanguageCompetence(home, hostLanguage, 'spoken') : 0;
  diplomat.languageSkills[hostLanguage] = Math.max(clamp(diplomat.languageSkills[hostLanguage] || 0), base);
  return clamp(diplomat.languageSkills[hostLanguage] || 0);
}

export function trainDiplomatLanguage(diplomat, home, host, elapsedDays = 7) {
  if (!diplomat || !host) return 0;
  diplomat.languageSkills ||= {};
  const hostLanguage = dominantLanguageId(host);
  const current = diplomatLanguageComprehension(diplomat, home, host);
  const daily = 0.0008 * (0.6 + clamp(diplomat.localFamiliarity || 0) * 0.6);
  const next = clamp(current + (1 - current) * daily * Math.max(0, elapsedDays));
  diplomat.languageSkills[hostLanguage] = next;
  if (home) {
    recordLanguageContactPopulation(home, host, Math.max(0, elapsedDays) / 28, 'diplomacy');
    const specialist = specialistLanguageCapability(home, hostLanguage);
    specialist.interpreters += Math.max(0, elapsedDays) / 365 * 0.35;
  }
  return next;
}

export function chooseMessageMedium(sender, target, complexity = 0.5, options = {}) {
  const senderCaps = communicationCapabilities(sender);
  const written = sharedCommunicationLanguage(sender, target, 'written');
  const spoken = sharedCommunicationLanguage(sender, target, 'spoken');
  if (options.forceOral) return { medium: 'oral_memorised', comprehension: spoken.competence, languageId: spoken.languageId, linguaFranca: spoken.linguaFranca };
  if (senderCaps.writing && (written.competence >= 0.2 || options.interpreterAvailable) && written.languageId) {
    return { medium: senderCaps.seals ? 'sealed_written' : 'written', comprehension: written.competence, languageId: written.languageId, linguaFranca: written.linguaFranca };
  }
  return { medium: 'oral_memorised', comprehension: spoken.competence, languageId: spoken.languageId, linguaFranca: spoken.linguaFranca, memoryBurden: clamp(complexity) };
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
  if (message?.medium === 'oral_memorised') return clamp(0.1 + clamp(pressure) * 0.38 + (1 - clamp(courier.resolve || 0.5)) * 0.32);
  if (message?.medium === 'sealed_written') return 0.88;
  if (message?.medium === 'written') return 0.96;
  return 0.55;
}

function culturalMedium(source) {
  const practices = updateCulturalLanguageReach(source, 7);
  const entries = Object.entries(practices).sort((a,b) => b[1] - a[1]);
  return entries[0]?.[0] || 'oral';
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
    const specialistCount = Object.values(ensureLanguageNetwork(region).specialists).reduce((sum, s) => sum + (s.interpreters || 0) + (s.working || 0), 0);
    if (specialistCount >= 2 && ((admin?.officialdom || 0) >= 0.08 || state.diplomaticTraffic >= 4)) addBreakthrough(state, 'trained_interpreters');
    if (state.writingAvailable && state.archiveAvailable && state.interceptionExperience + state.forgeryExperience >= 35 && state.diplomaticTraffic >= 10) {
      state.cipherPractice = clamp(state.cipherPractice + 0.0008 * weekScale);
      if (state.cipherPractice >= 0.12) addBreakthrough(state, 'cipher_conventions');
    }
    updateCulturalLanguageReach(region, elapsedDays);
  }

  for (const region of regions) {
    const recent = region.recentTradePartners instanceof Map ? [...region.recentTradePartners.keys()] : [...(region.tradePartnerIds || [])];
    for (const otherId of recent.slice(0, 12)) {
      const other = byId.get(otherId); if (!other) continue;
      recordLanguageContact(region, other, 0.35 * weekScale, { written: communicationCapabilities(region).writing && communicationCapabilities(other).writing });
      const medium = culturalMedium(other);
      const prestige = ensureLanguageNetwork(other).culturalPrestige[dominantLanguageId(other)] || 0.05;
      recordCulturalExposure(region, other, (0.12 + prestige) * weekScale, medium);
    }
  }
  for (const agreement of agreements || []) {
    if (!agreement?.active) continue;
    const a = byId.get(agreement.fromId || agreement.proposerRegionId);
    const b = byId.get(agreement.toId || agreement.partnerRegionId);
    if (a && b) {
      recordLanguageContact(a, b, 0.45 * weekScale, { written: true, diplomacy: true });
      recordLanguageContact(b, a, 0.45 * weekScale, { written: true, diplomacy: true });
    }
  }
  for (const campaign of campaigns || []) {
    if (campaign.completed) continue;
    const a = byId.get(campaign.attackerId); const b = byId.get(campaign.defenderId);
    if (a && b) {
      recordLanguageContact(a, b, 0.22 * weekScale, { war: true });
      recordLanguageContact(b, a, 0.3 * weekScale, { war: true });
    }
  }

  // High-prestige oral/cultural traditions travel beyond political borders through
  // neighbouring populations and existing contact networks without requiring
  // widespread bilingualism. Later media technologies naturally amplify this.
  for (const source of regions) {
    const network = ensureLanguageNetwork(source);
    const prestige = network.culturalPrestige[dominantLanguageId(source)] || 0;
    if (prestige <= 0.015) continue;
    const medium = culturalMedium(source);
    const targets = new Set([...(source.neighbors || []), ...((source.tradePartnerIds || []).slice?.(0, 8) || [])]);
    for (const id of targets) {
      const target = byId.get(id); if (!target) continue;
      recordCulturalExposure(target, source, prestige * 0.55 * weekScale, medium);
    }
  }
}

export { adoptInstitutionalLanguage };
