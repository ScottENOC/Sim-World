const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || region?.id || null;
}

function warSides(war) {
  const attackers = new Set([...(war?.attackerPolityIds || []), war?.attackerPolityId, war?.attackerId].filter(Boolean));
  const defenders = new Set([...(war?.defenderPolityIds || []), war?.defenderPolityId, war?.defenderId].filter(Boolean));
  return { attackers, defenders };
}

function sideRegions(regions, ids) {
  return (regions || []).filter((region) => ids.has(polityId(region)) || ids.has(region.id));
}

function nuclearRegions(regions) {
  return regions.filter((region) => region.nuclearRisk?.nuclearPower && region.nuclearRisk?.destructiveCapacity > 0);
}

function sideCapability(regions) {
  const nuclear = nuclearRegions(regions);
  if (!nuclear.length) return null;
  const destructiveCapacity = clamp(nuclear.reduce((sum, region) => sum + nonNegative(region.nuclearRisk?.destructiveCapacity), 0) / Math.max(1, nuclear.length));
  const secureSecondStrike = clamp(nuclear.reduce((sum, region) => sum + nonNegative(region.nuclearRisk?.secureSecondStrike), 0) / nuclear.length);
  const annualRisk = clamp(Math.max(...nuclear.map((region) => nonNegative(region.nuclearRisk?.annualCatastrophicExchangeRisk))));
  const periodRisk = clamp(Math.max(...nuclear.map((region) => nonNegative(region.nuclearRisk?.periodExchangeProbability))));
  return { nuclear, destructiveCapacity, secureSecondStrike, annualRisk, periodRisk };
}

function exchangeScale(initiator, responder, rng) {
  const pressure = clamp(Math.max(initiator.annualRisk, responder.annualRisk));
  const retaliation = clamp(responder.secureSecondStrike * responder.destructiveCapacity);
  const draw = clamp(rng?.() ?? Math.random());
  if (pressure < 0.02 && draw > 0.25) return 'limited';
  if (pressure < 0.06 && draw > 0.45) return 'regional';
  return retaliation > 0.35 ? 'major' : 'regional';
}

function populationOf(region) {
  const d = region?.demographics;
  if (d && [d.children, d.workingAge, d.elderly].every(Number.isFinite)) return Math.max(0, d.children + d.workingAge + d.elderly);
  return Math.max(0, Number(region?.population) || 0);
}

function applyDeaths(region, fraction) {
  const loss = clamp(fraction, 0, 0.9);
  const d = region.demographics;
  if (d) {
    for (const key of ['children', 'workingAge', 'elderly']) {
      if (Number.isFinite(d[key])) d[key] = Math.max(0, d[key] * (1 - loss));
    }
    region.population = Math.max(0, (d.children || 0) + (d.workingAge || 0) + (d.elderly || 0));
  } else if (Number.isFinite(region.population)) {
    region.population = Math.max(0, region.population * (1 - loss));
  }
}

function impactWeight(region, totalPopulation) {
  const populationShare = totalPopulation > 0 ? populationOf(region) / totalPopulation : 1;
  const urbanisation = clamp(region.urbanisation?.share ?? region.urbanShare ?? region.settlements?.urbanShare ?? 0.25);
  const infrastructure = clamp(region.infrastructure?.development ?? region.infrastructureLevel ?? 0.35);
  return clamp(0.45 * populationShare + 0.35 * urbanisation + 0.20 * infrastructure, 0.05, 1);
}

function baseConsequences(scale) {
  if (scale === 'limited') return { direct: 0.025, infrastructure: 0.08, fallout: 0.15, soot: 0.05 };
  if (scale === 'regional') return { direct: 0.09, infrastructure: 0.24, fallout: 0.38, soot: 0.18 };
  return { direct: 0.22, infrastructure: 0.48, fallout: 0.70, soot: 0.42 };
}

function applySideEffects(regions, scale, forceFraction, exchangeId) {
  if (!regions.length) return { deaths: 0, populationBefore: 0 };
  const totalPopulation = regions.reduce((sum, region) => sum + populationOf(region), 0);
  const consequence = baseConsequences(scale);
  let deaths = 0;
  for (const region of regions) {
    const before = populationOf(region);
    const weight = impactWeight(region, totalPopulation);
    const directFraction = clamp(consequence.direct * forceFraction * (0.35 + 0.65 * weight), 0, 0.55);
    applyDeaths(region, directFraction);
    deaths += Math.max(0, before - populationOf(region));
    region.nuclearAftermath ||= {};
    region.nuclearAftermath.exchangeId = exchangeId;
    region.nuclearAftermath.infrastructureDamage = clamp(Math.max(region.nuclearAftermath.infrastructureDamage || 0, consequence.infrastructure * forceFraction * (0.45 + 0.55 * weight)));
    region.nuclearAftermath.fallout = clamp(Math.max(region.nuclearAftermath.fallout || 0, consequence.fallout * forceFraction * (0.55 + 0.45 * weight)));
    region.nuclearAftermath.sootExposure = clamp(Math.max(region.nuclearAftermath.sootExposure || 0, consequence.soot * forceFraction));
    region.nuclearAftermath.foodSystemShock = clamp(Math.max(region.nuclearAftermath.foodSystemShock || 0, consequence.soot * 0.8 + consequence.infrastructure * 0.35));
    region.nuclearAftermath.lastScale = scale;
    region.stability = clamp((region.stability ?? 0.5) - directFraction * 0.8 - region.nuclearAftermath.infrastructureDamage * 0.18);
    if (region.stockpile && Number.isFinite(region.stockpile.food)) {
      region.stockpile.food -= Math.max(0, populationOf(region)) * region.nuclearAftermath.foodSystemShock * 0.02;
    }
    region.report ||= {};
    region.report.nuclearAftermath = nuclearAftermathSummary(region);
  }
  return { deaths, populationBefore: totalPopulation };
}

function consumeWarheads(regions, fraction) {
  const f = clamp(fraction);
  for (const region of regions) {
    const forces = region.nuclearForces;
    const weapons = region.nuclearWeapons;
    if (forces?.operationalWarheads > 0) forces.operationalWarheads = Math.max(0, Math.round(forces.operationalWarheads * (1 - f)));
    if (forces?.reserveWarheads > 0) forces.reserveWarheads = Math.max(0, Math.round(forces.reserveWarheads * (1 - f * 0.35)));
    if (weapons?.operationalWarheads > 0) weapons.operationalWarheads = Math.max(0, Math.round(weapons.operationalWarheads * (1 - f)));
  }
}

export function resolveNuclearExchange(regions, war, currentTick = 0, rng = Math.random) {
  const { attackers, defenders } = warSides(war);
  const attackerRegions = sideRegions(regions, attackers);
  const defenderRegions = sideRegions(regions, defenders);
  const attacker = sideCapability(attackerRegions);
  const defender = sideCapability(defenderRegions);
  if (!attacker || !defender) return null;

  const attackerTrigger = clamp(attacker.periodRisk || attacker.annualRisk / 52);
  const defenderTrigger = clamp(defender.periodRisk || defender.annualRisk / 52);
  const initiatorIsAttacker = attackerTrigger >= defenderTrigger;
  const trigger = Math.max(attackerTrigger, defenderTrigger);
  if ((rng?.() ?? Math.random()) >= trigger) return null;

  const initiator = initiatorIsAttacker ? attacker : defender;
  const responder = initiatorIsAttacker ? defender : attacker;
  const initiatorRegions = initiatorIsAttacker ? attackerRegions : defenderRegions;
  const responderRegions = initiatorIsAttacker ? defenderRegions : attackerRegions;
  const scale = exchangeScale(initiator, responder, rng);
  const initialForceFraction = scale === 'limited' ? 0.08 : scale === 'regional' ? 0.28 : 0.62;
  const retaliationFraction = clamp(initialForceFraction * (0.25 + 0.75 * responder.secureSecondStrike), 0, 0.8);
  const exchangeId = `nuclear-${currentTick}-${polityId(initiatorRegions[0])}-${polityId(responderRegions[0])}`;

  const responderLosses = applySideEffects(responderRegions, scale, initialForceFraction * initiator.destructiveCapacity, exchangeId);
  const initiatorLosses = applySideEffects(initiatorRegions, scale, retaliationFraction * responder.destructiveCapacity, exchangeId);
  consumeWarheads(initiatorRegions, initialForceFraction);
  consumeWarheads(responderRegions, retaliationFraction);

  const globalSootShock = clamp(baseConsequences(scale).soot * (initialForceFraction * initiator.destructiveCapacity + retaliationFraction * responder.destructiveCapacity));
  for (const region of regions || []) {
    region.nuclearAftermath ||= {};
    region.nuclearAftermath.globalSootShock = clamp(Math.max(region.nuclearAftermath.globalSootShock || 0, globalSootShock));
    region.nuclearAftermath.foodSystemShock = clamp(Math.max(region.nuclearAftermath.foodSystemShock || 0, globalSootShock * 0.7));
    region.report ||= {};
    region.report.nuclearAftermath = nuclearAftermathSummary(region);
  }

  return {
    type: 'nuclear_exchange', exchangeId, tick: currentTick, scale,
    initiatorPolityId: polityId(initiatorRegions[0]), responderPolityId: polityId(responderRegions[0]),
    initialForceFraction, retaliationFraction, globalSootShock,
    estimatedDirectDeaths: Math.round(responderLosses.deaths + initiatorLosses.deaths),
    title: 'Nuclear weapons used',
    message: `A ${scale} nuclear exchange has occurred. Surviving retaliatory forces and cascading infrastructure, fallout and food-system damage will continue to shape the crisis.`
  };
}

export function tickNuclearAftermath(regions, elapsedDays = 7) {
  const years = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_YEAR;
  for (const region of regions || []) {
    const a = region.nuclearAftermath;
    if (!a) continue;
    const fallout = clamp(a.fallout || 0);
    const soot = clamp(Math.max(a.sootExposure || 0, a.globalSootShock || 0));
    const foodShock = clamp(a.foodSystemShock || 0);
    const annualMortality = clamp(fallout * 0.035 + soot * 0.012, 0, 0.12);
    if (annualMortality > 0 && years > 0) applyDeaths(region, 1 - Math.pow(1 - annualMortality, years));
    if (region.stockpile && Number.isFinite(region.stockpile.food)) region.stockpile.food -= populationOf(region) * foodShock * years * 0.03;
    region.stability = clamp((region.stability ?? 0.5) - (fallout * 0.025 + foodShock * 0.02) * years);
    const decay = Math.pow(0.5, years / 1.5);
    a.fallout = clamp(fallout * decay);
    a.sootExposure = clamp((a.sootExposure || 0) * Math.pow(0.5, years / 2.5));
    a.globalSootShock = clamp((a.globalSootShock || 0) * Math.pow(0.5, years / 3.0));
    a.foodSystemShock = clamp(foodShock * Math.pow(0.5, years / 2.0));
    a.infrastructureDamage = clamp((a.infrastructureDamage || 0) * Math.pow(0.5, years / 8.0));
    region.report ||= {};
    region.report.nuclearAftermath = nuclearAftermathSummary(region);
  }
}

export function tickNuclearExchange(regions, activeWars = [], currentTick = 0, elapsedDays = 7, rng = Math.random) {
  tickNuclearAftermath(regions, elapsedDays);
  const events = [];
  for (const war of activeWars || []) {
    if (war?.nuclearExchangeResolved) continue;
    const event = resolveNuclearExchange(regions, war, currentTick, rng);
    if (!event) continue;
    war.nuclearExchangeResolved = true;
    war.nuclearExchangeId = event.exchangeId;
    events.push(event);
  }
  return events;
}

export function nuclearAftermathSummary(region) {
  const a = region.nuclearAftermath || {};
  return {
    exchangeId: a.exchangeId || null,
    infrastructureDamage: clamp(a.infrastructureDamage || 0),
    fallout: clamp(a.fallout || 0),
    sootExposure: clamp(a.sootExposure || 0),
    globalSootShock: clamp(a.globalSootShock || 0),
    foodSystemShock: clamp(a.foodSystemShock || 0),
    lastScale: a.lastScale || null,
  };
}
