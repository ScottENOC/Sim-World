// Cheap, deliberately imperfect Bronze Age estimate of economic importance.
//
// `economicWeight` is simulation truth used only to create a plausible signal.
// The player sees `perceivedEconomicImportance`: merchant traffic, monumental
// grandeur and military/state display can make a hollowing city look greater
// than it really is until sufficiently good/recent reports expose the decline.

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const safe = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function hash01(text) {
  let h = 2166136261;
  for (const ch of String(text)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function assets(region) {
  if (Array.isArray(region.construction?.assets)) return region.construction.assets;
  return [];
}

function grandeur(region) {
  let score = 0;
  for (const asset of assets(region)) {
    const condition = clamp(asset.condition ?? 1);
    const scale = Math.max(0.5, safe(asset.scale) || 1);
    const weights = {
      monumental_tomb: 2.8, great_temple: 3.2, ceremonial_complex: 2.5,
      monumental_statue: 2.4, settlement_walls: 1.8, administrative_centre: 1.4,
      harbour: 1.5, market_customs: 1.3, road_network: 0.7,
    };
    score += (weights[asset.typeId] || 0.25) * condition * Math.sqrt(scale);
  }
  return score;
}

function commercialFlow(region) {
  const trade = region.tradeEconomy || {};
  return Math.max(0,
    safe(trade.exportIncomeEma) + safe(trade.importSpendEma) +
    safe(trade.weeklyExports) + safe(trade.weeklyImports));
}

// A low-cost measure of "how much economic stuff happens here". All inputs are
// already maintained by other systems; this adds no per-tick simulation pass.
export function economicWeight(region) {
  const population = Math.max(0, safe(region.population));
  const working = Math.max(0, safe(region.demographics?.workingAge));
  const trade = commercialFlow(region);
  const revenue = Math.max(0, safe(region.militaryFinance?.weeklyTaxRevenue) + safe(region.militaryFinance?.weeklyTradeDuties));
  const state = Math.max(0, safe(region.treasury));
  const forces = Math.max(0, safe(region.army?.personnel) + safe(region.army?.away) + safe(region.navy?.personnel));
  const built = grandeur(region);

  // Square roots/logs deliberately make this a bigness index rather than a
  // disguised accounting identity. Population/productive labour dominate;
  // trade, fiscal reach and visible built capital distinguish major centres.
  return (
    Math.sqrt(population) * 4.2 +
    Math.sqrt(working) * 1.4 +
    Math.log1p(trade) * 15 +
    Math.log1p(revenue) * 11 +
    Math.log1p(state) * 4 +
    Math.sqrt(forces) * 0.55 +
    built * 12
  );
}

function reportsAbout(observer, subjectId) {
  return (observer?.knowledge?.observations || []).filter((report) => report.subjectId === subjectId);
}

function reportConfidence(observer, subject, currentTick = 0) {
  if (!observer || !subject) return 0;
  if (observer.id === subject.id) return 1;
  const reports = reportsAbout(observer, subject.id);
  const direct = observer.knowledge?.directContactIds?.has?.(subject.id) ? 0.18 : 0;
  let evidence = direct;
  for (const report of reports.slice(-20)) {
    const received = safe(report.receivedAt ?? report.observedAt);
    const age = Math.max(0, safe(currentTick) - received);
    const freshness = Math.exp(-age / 80);
    let source = 0.07;
    const sourceName = String(report.source || '');
    if (/trade|merchant|direct|envoy|diplom/i.test(sourceName)) source = 0.13;
    if (/rumour|rumor|hearsay/i.test(sourceName)) source = 0.035;
    evidence += source * freshness;
  }
  return clamp(0.12 + evidence, 0.12, 0.96);
}

function distress(region) {
  const population = Math.max(1, safe(region.population));
  const foodPerPerson = Math.max(0, safe(region.stockpile?.food)) / population;
  const foodStress = clamp((8 - foodPerPerson) / 8);
  const instability = clamp(1 - safe(region.stability));
  const safety = clamp(1 - safe(region.safetyRating));
  return clamp(foodStress * 0.5 + instability * 0.32 + safety * 0.18);
}

function rawDomain(regions) {
  const values = regions.map(economicWeight).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return 1;
  return Math.max(1, values[Math.floor((values.length - 1) * 0.95)] || values[values.length - 1]);
}

export function perceivedEconomicImportance(observer, subject, regions, currentTick = 0) {
  if (!subject) return { score: 0, confidence: 0, truthScore: 0, description: 'Unknown' };
  const domain = rawDomain(regions || [subject]);
  const truthScore = clamp(economicWeight(subject) / domain, 0, 1.35) * 100;
  if (observer?.id === subject.id) {
    return { score: clamp(truthScore, 0, 100), confidence: 1, truthScore, description: importanceLabel(truthScore) };
  }

  const confidence = reportConfidence(observer, subject, currentTick);
  const prestige = clamp(grandeur(subject) / 16, 0, 1.4);
  const traffic = clamp(Math.log1p(commercialFlow(subject)) / 12, 0, 1.2);
  const display = clamp((prestige * 0.68 + traffic * 0.32), 0, 1.3);
  const knownDistress = distress(subject) * confidence;

  // Low-information estimates anchor on observable spectacle. Actual underlying
  // weight increasingly matters as reports improve. Distress only bites when
  // information is good enough for shortages/decline to become credible.
  const spectacleScore = 18 + display * 72;
  let score = spectacleScore * (1 - confidence * 0.72) + truthScore * (confidence * 0.72);
  score += prestige * (1 - confidence) * 22;
  score -= knownDistress * 30;

  // Stable regional reputation error, not tick-to-tick visual flicker.
  const bias = (hash01(`${observer?.id}:${subject.id}:economic-reputation`) - 0.5) * 30 * (1 - confidence);
  score = clamp(score + bias, 0, 100);
  return { score, confidence, truthScore, description: importanceLabel(score) };
}

export function importanceLabel(score) {
  const v = safe(score);
  if (v >= 82) return 'Great centre';
  if (v >= 64) return 'Major centre';
  if (v >= 45) return 'Important';
  if (v >= 27) return 'Modest';
  return 'Minor';
}

export function confidenceLabel(confidence) {
  const c = clamp(confidence);
  if (c >= 0.8) return 'well attested';
  if (c >= 0.55) return 'credible';
  if (c >= 0.32) return 'uncertain';
  return 'rumour and appearances';
}
