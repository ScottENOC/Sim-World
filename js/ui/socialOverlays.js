import { culturalIdentity, cultureAffinity } from '../society/culture.js?v=20260907-culture1';
import { dominantLanguageId, ensureLanguageNetwork, nativeShare } from '../diplomacy/languageNetworks.js?v=20260909-language-networks1';
import { dominantReligion, religionShare } from '../society/religion.js?v=20260905-religion1';
import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;

function titleCase(value = '') {
  return String(value).replace(/^lang:/, '').replace(/^culture:/, '').replaceAll('_', ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function dominantCultureId(region) {
  const groups = Array.isArray(region?.cultureGroups) ? region.cultureGroups : [];
  return groups.slice().sort((a, b) => (b.share || 0) - (a.share || 0))[0]?.identityId || `culture:${region?.id || 'unknown'}`;
}

export function cultureLabel(identityId) {
  const identity = culturalIdentity(identityId);
  return identity?.label || titleCase(identityId);
}

export function languageLabel(languageId) {
  const raw = String(languageId || '').replace(/^lang:/, '');
  const identity = culturalIdentity(raw);
  if (identity?.label) return `${identity.label} language`;
  return `${titleCase(raw)} language`;
}

export function dominantReligionInfo(region, religiousWorld) {
  const religion = dominantReligion(region, religiousWorld);
  if (!religion) return { id: 'none', label: 'No dominant religion', share: 0 };
  return { id: religion.id, label: religion.name, share: religionShare(region, religion.id, religiousWorld) };
}

function topEntries(object = {}, limit = 3) {
  return Object.entries(object).sort((a, b) => (b[1]?.share ?? b[1] ?? 0) - (a[1]?.share ?? a[1] ?? 0)).slice(0, limit);
}

export function socialIdentitySummary(region, religiousWorld) {
  const cultures = (region?.cultureGroups || []).slice().sort((a, b) => (b.share || 0) - (a.share || 0)).slice(0, 3)
    .map((g) => ({ id: g.identityId, label: cultureLabel(g.identityId), share: clamp(g.share) }));
  const network = ensureLanguageNetwork(region);
  const languages = topEntries(network.communities, 3).map(([id, entry]) => ({ id, label: languageLabel(id), share: clamp(entry.share) }));
  const religions = topEntries(region?.religion?.shares || {}, 3).map(([id, share]) => {
    const religion = religiousWorld?.religions?.find((r) => r.id === id);
    return { id, label: religion?.name || titleCase(id), share: clamp(share) };
  });
  return { cultures, languages, religions, courtLanguages: [...(network.institutions?.court || [])] };
}

function directAgreementWeight(agreements, playerRegion, targetRegion) {
  let score = 0;
  for (const a of agreements || []) {
    if (!a?.active) continue;
    const direct = (a.fromId === playerRegion.id && a.toId === targetRegion.id) || (a.toId === playerRegion.id && a.fromId === targetRegion.id);
    const actorDirect = [a.proposerActorId, a.partnerActorId, a.fromActorId, a.toActorId].filter(Boolean).includes(actorId(playerRegion)) &&
      [a.proposerActorId, a.partnerActorId, a.fromActorId, a.toActorId].filter(Boolean).includes(actorId(targetRegion));
    if (!direct && !actorDirect) continue;
    score = Math.max(score, ({ joint_operation: 0.22, military_support: 0.2, alliance: 0.24, resource_access: 0.1, tribute: -0.05 }[a.type] ?? 0.08));
  }
  return score;
}

function religiousAffinity(player, target, religiousWorld) {
  const a = dominantReligion(player, religiousWorld);
  const b = dominantReligion(target, religiousWorld);
  if (!a || !b) return 0;
  if (a.id === b.id) return 1;
  if (a.familyId && b.familyId && a.familyId === b.familyId) return 0.58;
  return 0;
}

export function playerInfluenceScore(playerRegion, targetRegion, { agreements = [], religiousWorld = null } = {}) {
  if (!playerRegion || !targetRegion) return 0;
  if (actorId(playerRegion) === actorId(targetRegion)) return 1;

  const attitude = clamp((attitudeToward(playerRegion, targetRegion.id) + 1) / 2);
  const trust = clamp(playerRegion.diplomaticTrust?.[actorId(targetRegion)]?.score ?? 0.5);
  const agreement = directAgreementWeight(agreements, playerRegion, targetRegion);
  const culture = clamp(cultureAffinity(playerRegion, targetRegion));
  const religion = religiousAffinity(playerRegion, targetRegion, religiousWorld);
  const playerLang = dominantLanguageId(playerRegion);
  const targetNet = ensureLanguageNetwork(targetRegion);
  const languageReach = clamp(nativeShare(targetRegion, playerLang) + (targetNet.secondLanguage?.[playerLang]?.working || 0) * 0.7 + (targetNet.culturalExposure?.[playerLang] || 0) * 0.5);
  const resident = (playerRegion.diplomaticService?.diplomats || []).some((d) => d.status === 'posted' && d.postedRegionId === targetRegion.id) ? 1 : 0;
  const reverseResident = (targetRegion.diplomaticService?.diplomats || []).some((d) => d.status === 'posted' && d.postedRegionId === playerRegion.id) ? 1 : 0;
  const recentTrade = playerRegion.recentTradePartners instanceof Map
    ? playerRegion.recentTradePartners.has(targetRegion.id)
    : Array.isArray(playerRegion.recentTradePartners) && playerRegion.recentTradePartners.some((x) => Array.isArray(x) ? x[0] === targetRegion.id : x === targetRegion.id);

  return clamp(0.08 + attitude * 0.24 + trust * 0.15 + culture * 0.12 + religion * 0.07 + languageReach * 0.1 +
    resident * 0.1 + reverseResident * 0.04 + (recentTrade ? 0.06 : 0) + agreement);
}

export function influenceBand(score, known = true) {
  if (!known) return 'Unknown';
  if (score >= 0.82) return 'Strong influence';
  if (score >= 0.64) return 'Significant influence';
  if (score >= 0.46) return 'Limited influence';
  if (score >= 0.28) return 'Weak influence';
  return 'Little influence';
}

export function buildSocialOverlayLayers({ regions, religiousWorld, agreements, fogOfWar, getPlayerRegionId, getPlayerPolityId, knowledgeLevel, knowledgeThresholds }) {
  const byId = new Map((regions || []).map((r) => [r.id, r]));
  const playerRegion = () => byId.get(getPlayerRegionId?.());
  const knowsSociety = (region) => {
    const observer = playerRegion();
    if (!observer) return false;
    if (fogOfWar?.devMode) return true;
    if (actorId(observer) === actorId(region) || getPlayerPolityId?.() === actorId(region)) return true;
    const direct = observer.knowledge?.directContactIds?.has?.(region.id) || false;
    const level = knowledgeLevel ? knowledgeLevel(observer, region) : 0;
    return direct || level >= (knowledgeThresholds?.RESOURCES ?? 0.5);
  };

  return {
    culture: {
      type: 'categorical', label: 'Dominant culture',
      valueFn: (region) => knowsSociety(region) ? cultureLabel(dominantCultureId(region)) : 'Unknown',
    },
    language: {
      type: 'categorical', label: 'Dominant first language',
      valueFn: (region) => knowsSociety(region) ? languageLabel(dominantLanguageId(region)) : 'Unknown',
    },
    religion: {
      type: 'categorical', label: 'Dominant religion',
      valueFn: (region) => knowsSociety(region) ? dominantReligionInfo(region, religiousWorld).label : 'Unknown',
    },
    influence: {
      type: 'categorical', label: 'Our diplomatic influence',
      valueFn: (region) => influenceBand(playerInfluenceScore(playerRegion(), region, { agreements, religiousWorld }), knowsSociety(region)),
    },
  };
}
