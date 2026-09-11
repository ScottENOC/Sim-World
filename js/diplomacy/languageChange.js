import { dominantLanguageId, ensureLanguageNetwork, nativeShare } from './languageNetworks.js?v=20260909-language-change1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const finite = (v, d = 0) => Number.isFinite(Number(v)) ? Number(v) : d;

function normalise(shares) {
  for (const [k, v] of Object.entries(shares)) shares[k] = Math.max(0, finite(v));
  const total = Object.values(shares).reduce((s, v) => s + v, 0) || 1;
  for (const k of Object.keys(shares)) shares[k] /= total;
  return shares;
}

function institutionalWeight(network, languageId) {
  const weights = { court: 0.16, administration: 0.2, legal: 0.08, military: 0.08, trade: 0.12, religious: 0.12, cultural: 0.16 };
  let score = 0;
  for (const [domain, weight] of Object.entries(weights)) if (network.institutions?.[domain]?.includes(languageId)) score += weight;
  return clamp(score);
}

function prestigeWeight(network, languageId) {
  return clamp((network.culturalPrestige?.[languageId] || 0) * 0.7 + (network.culturalExposure?.[languageId] || 0) * 0.3);
}

function secondLanguagePressure(network, languageId) {
  const s = network.secondLanguage?.[languageId] || {};
  return clamp((s.basic || 0) * 0.15 + (s.working || 0) * 0.42 + (s.fluent || 0) * 0.43);
}

function minorityRetention(region, network, languageId, share) {
  const institutional = institutionalWeight(network, languageId);
  const religion = network.institutions?.religious?.includes(languageId) ? 0.2 : 0;
  const culture = network.institutions?.cultural?.includes(languageId) ? 0.15 : 0;
  const policyRetention = Number(network.languagePolicyRetention?.[languageId] || 0);
  const concentration = clamp((share - 0.03) / 0.35);
  const rural = clamp(1 - finite(region?.urbanisation ?? region?.urbanization, 0.15));
  return clamp(0.22 + concentration * 0.35 + rural * 0.12 + institutional * 0.18 + religion + culture + policyRetention);
}

export function ensureGenerationalLanguageState(region) {
  const n = ensureLanguageNetwork(region);
  n.generational ||= { yearsAccumulated: 0, pairContactYears: {}, mixedLanguages: {}, divergenceYears: {} };
  return n.generational;
}

export function languageShiftPressure(region, fromLanguageId, toLanguageId, network = null, shares = null) {
  const n = network || ensureLanguageNetwork(region);
  if (fromLanguageId === toLanguageId) return 0;
  // During the generational tick we already have a current, normalised language
  // population snapshot. Reuse it rather than rebuilding native communities for
  // every from-language x to-language comparison.
  const currentShares = shares || n.communityShares || {};
  const toShare = Number(currentShares[toLanguageId] || 0);
  const fromShare = Number(currentShares[fromLanguageId] || 0);
  const policyPressure = Math.max(0, Number(n.languagePolicyPressure?.[toLanguageId] || 0));
  const attraction = clamp(toShare * 0.28 + institutionalWeight(n, toLanguageId) * 0.32 + prestigeWeight(n, toLanguageId) * 0.22 + secondLanguagePressure(n, toLanguageId) * 0.28 + policyPressure * 0.35);
  const retention = minorityRetention(region, n, fromLanguageId, fromShare);
  return clamp(attraction * (1 - retention));
}

function maybeCreateMixedLanguage(region, elapsedYears) {
  const n = ensureLanguageNetwork(region);
  const g = ensureGenerationalLanguageState(region);
  const communities = n.communityShares || {};
  const languages = Object.entries(communities).filter(([, share]) => share >= 0.12).sort((a,b) => b[1] - a[1]);
  if (languages.length < 2) return null;
  const [a, b] = languages;
  const sa = n.secondLanguage?.[a[0]] || {};
  const sb = n.secondLanguage?.[b[0]] || {};
  const bilingual = Math.min(sa.working || 0, sb.working || 0);
  const key = [a[0], b[0]].sort().join('|');
  if (bilingual < 0.08) { g.pairContactYears[key] = Math.max(0, (g.pairContactYears[key] || 0) - elapsedYears); return null; }
  g.pairContactYears[key] = (g.pairContactYears[key] || 0) + elapsedYears;
  if (g.pairContactYears[key] < 60) return null;
  let mixed = g.mixedLanguages[key];
  if (!mixed) {
    const id = `lang:mixed:${region.id}:${Object.keys(g.mixedLanguages).length + 1}`;
    mixed = g.mixedLanguages[key] = { id, parents: [a[0], b[0]], createdAfterYears: g.yearsAccumulated, familyId: `langfam:mixed:${a[0]}:${b[0]}` };
    n.languageMetadata ||= {};
    n.languageMetadata[id] = { familyId: mixed.familyId, parents: mixed.parents, origin: 'mixed', regionId: region.id };
    n.communityShares[id] = 0;
  }
  const growth = Math.min(a[1], b[1]) * bilingual * 0.0016 * elapsedYears;
  const takeA = Math.min(a[1] * 0.002 * elapsedYears, growth * 0.5);
  const takeB = Math.min(b[1] * 0.002 * elapsedYears, growth * 0.5);
  n.communityShares[a[0]] -= takeA;
  n.communityShares[b[0]] -= takeB;
  n.communityShares[mixed.id] = (n.communityShares[mixed.id] || 0) + takeA + takeB;
  normalise(n.communityShares);
  return mixed;
}

function maybeDivergeLanguage(region, elapsedYears) {
  const n = ensureLanguageNetwork(region);
  const g = ensureGenerationalLanguageState(region);
  const dominant = dominantLanguageId(region);
  const externalContact = Object.values(n.secondLanguage || {}).reduce((s, p) => s + (p.working || 0) + (p.fluent || 0), 0);
  const isolation = clamp(1 - Math.min(1, externalContact * 5 + (region.tradePartnerIds?.length || region.recentTradePartners?.size || 0) * 0.03));
  if (isolation < 0.65 || nativeShare(region, dominant) < 0.75) { g.divergenceYears[dominant] = Math.max(0, (g.divergenceYears[dominant] || 0) - elapsedYears); return null; }
  g.divergenceYears[dominant] = (g.divergenceYears[dominant] || 0) + elapsedYears * isolation;
  if (g.divergenceYears[dominant] < 280 || n.languageMetadata?.[dominant]?.origin === 'daughter') return null;
  const daughter = `lang:daughter:${region.id}:${Math.floor(g.yearsAccumulated)}`;
  n.languageMetadata ||= {};
  n.languageMetadata[daughter] = { familyId: n.communities?.[dominant]?.familyId || `langfam:${dominant}`, parent: dominant, origin: 'daughter', regionId: region.id };
  const seed = Math.min(0.08, nativeShare(region, dominant) * 0.08);
  n.communityShares[dominant] -= seed;
  n.communityShares[daughter] = seed;
  g.divergenceYears[dominant] = 0;
  normalise(n.communityShares);
  return { id: daughter, parent: dominant };
}

export function tickGenerationalLanguageChange(regions, elapsedDays = 7) {
  const elapsedYears = Math.max(0, finite(elapsedDays, 7) / 365.2425);
  const events = [];
  if (elapsedYears <= 0) return events;
  for (const region of regions || []) {
    const n = ensureLanguageNetwork(region);
    const g = ensureGenerationalLanguageState(region);
    g.yearsAccumulated += elapsedYears;
    const shares = n.communityShares || {};
    const languages = Object.keys(shares);
    if (languages.length > 1) {
      const transfers = [];
      for (const from of languages) {
        if ((shares[from] || 0) < 0.005) continue;
        let best = null;
        for (const to of languages) {
          const pressure = languageShiftPressure(region, from, to, n, shares);
          if (!best || pressure > best.pressure) best = { to, pressure };
        }
        if (!best || best.pressure < 0.04) continue;
        // Deliberately slow: even strong pressure usually means generations, not years.
        const amount = Math.min(shares[from] * 0.012 * best.pressure * elapsedYears, shares[from] * 0.02);
        if (amount > 0) transfers.push({ from, to: best.to, amount });
      }
      for (const t of transfers) { shares[t.from] -= t.amount; shares[t.to] = (shares[t.to] || 0) + t.amount; }
      normalise(shares);
    }
    const mixed = maybeCreateMixedLanguage(region, elapsedYears);
    if (mixed && !mixed.announced) { mixed.announced = true; events.push({ type: 'mixed_language_emerged', regionId: region.id, languageId: mixed.id, parentLanguages: mixed.parents }); }
    const daughter = maybeDivergeLanguage(region, elapsedYears);
    if (daughter) events.push({ type: 'daughter_language_emerged', regionId: region.id, languageId: daughter.id, parentLanguage: daughter.parent });
  }
  return events;
}
