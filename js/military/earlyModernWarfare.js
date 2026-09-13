import { operationalInfrastructure } from '../economy/construction.js?v=20260913-early-modern1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

const ARTILLERY_SPECS = Object.freeze({
  bombard: { metal: 12, wood: 5, proofPowder: 0.18, siege: 1.45, field: 0.35 },
  field_cannon: { metal: 7, wood: 3, proofPowder: 0.12, siege: 0.82, field: 0.85 },
});

function materialQuality(metal) {
  if (metal === 'steel') return 1.18;
  if (metal === 'bronze') return 1.02;
  return 0.94;
}

function takeMaterial(region, amount, { allowSteel = true } = {}) {
  region.stockpile ||= {};
  const options = [];
  if (allowSteel && hasTech(region, 'steelmaking')) options.push('steel');
  options.push('bronze', 'iron');
  let remaining = Math.max(0, amount);
  const used = { steel: 0, bronze: 0, iron: 0 };
  for (const metal of options) {
    const take = Math.min(remaining, Math.max(0, region.stockpile[metal] || 0));
    if (take <= 0) continue;
    region.stockpile[metal] -= take;
    used[metal] += take;
    remaining -= take;
    if (remaining <= 1e-9) break;
  }
  if (remaining > 1e-9) {
    for (const [metal, amountUsed] of Object.entries(used)) region.stockpile[metal] = (region.stockpile[metal] || 0) + amountUsed;
    return null;
  }
  return used;
}

function dominantMaterial(used) {
  return Object.entries(used || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || 'iron';
}

function availableShotMetal(region) {
  return Math.max(0, region.stockpile?.iron || 0) + Math.max(0, region.stockpile?.bronze || 0);
}

function consumeShotMetal(region, amount) {
  let remaining = Math.max(0, amount);
  for (const metal of ['iron', 'bronze']) {
    const take = Math.min(remaining, Math.max(0, region.stockpile?.[metal] || 0));
    if (take > 0) region.stockpile[metal] -= take;
    remaining -= take;
  }
  return amount - remaining;
}

export function ensureEarlyModernMilitary(region) {
  region.earlyModernMilitary ||= {};
  const state = region.earlyModernMilitary;
  state.artillery ||= { readiness: 0, inventory: [], away: [] };
  state.artillery.inventory ||= [];
  state.artillery.away ||= [];
  state.artillery.readiness = clamp(state.artillery.readiness);
  state.naval ||= { readiness: 0, guns: [], lastBuilt: null };
  state.naval.guns ||= [];
  state.naval.readiness = clamp(state.naval.readiness);
  region.banditTechnology ||= { firearms: 0, gunpowder: 0, firearmExperience: 0, steelExposure: 0 };
  return state;
}

export function firearmSteelQualityMultiplier(region) {
  if (!hasTech(region, 'steelmaking')) return 1;
  const coverage = clamp(region.steelIndustry?.militaryCoverage || 0);
  const readiness = clamp(region.steelIndustry?.readiness || 0);
  // Steel is an improvement, never a prerequisite: better barrels, locks,
  // springs and fittings gradually reduce failures and permit handier weapons.
  return 1 + coverage * 0.11 + readiness * 0.035;
}

function buildArtillery(region, kind) {
  const spec = ARTILLERY_SPECS[kind];
  if (!spec) return false;
  if ((region.stockpile?.wood || 0) < spec.wood || (region.stockpile?.gunpowder || 0) < spec.proofPowder) return false;
  const metal = takeMaterial(region, spec.metal, { allowSteel: true });
  if (!metal) return false;
  region.stockpile.wood -= spec.wood;
  region.stockpile.gunpowder -= spec.proofPowder;
  ensureEarlyModernMilitary(region).artillery.inventory.push({ kind, metal: dominantMaterial(metal), condition: 1 });
  return true;
}

function buildNavalGun(region) {
  if ((region.stockpile?.wood || 0) < 0.6 || (region.stockpile?.gunpowder || 0) < 0.04) return false;
  const metal = takeMaterial(region, 2.8, { allowSteel: true });
  if (!metal) return false;
  region.stockpile.wood -= 0.6;
  region.stockpile.gunpowder -= 0.04;
  const gun = { metal: dominantMaterial(metal), condition: 1 };
  const state = ensureEarlyModernMilitary(region);
  state.naval.guns.push(gun);
  state.naval.lastBuilt = gun.metal;
  return true;
}

export function tickEarlyModernIndustry(regions, elapsedDays = 7) {
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const buildScale = Math.max(0.05, elapsedDays / 30);
  const reports = [];
  for (const region of regions) {
    const state = ensureEarlyModernMilitary(region);
    if (!hasTech(region, 'gunpowder')) continue;
    const firearmsReadiness = clamp(region.firearms?.readiness || 0.05);
    state.artillery.readiness = clamp(state.artillery.readiness + (0.08 + firearmsReadiness * 0.16) * years);
    const hasDockyard = operationalInfrastructure(region, 'shipyard') || operationalInfrastructure(region, 'naval_base');
    if (region.isCoastal && operationalInfrastructure(region, 'harbour')) {
      state.naval.readiness = clamp(state.naval.readiness + (0.07 + firearmsReadiness * 0.14 + (hasDockyard ? 0.08 : 0)) * years);
    }

    const personnel = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
    const bombards = state.artillery.inventory.filter((item) => item.kind === 'bombard').length + state.artillery.away.filter((item) => item.kind === 'bombard').length;
    const fieldGuns = state.artillery.inventory.filter((item) => item.kind === 'field_cannon').length + state.artillery.away.filter((item) => item.kind === 'field_cannon').length;
    const bombardTarget = Math.min(8, Math.floor(personnel / 1400));
    const fieldTarget = state.artillery.readiness >= 0.30 ? Math.min(16, Math.floor(personnel / 900 * state.artillery.readiness)) : 0;
    let artilleryBuilt = 0;
    const artilleryAttempts = Math.max(1, Math.floor(buildScale * (0.5 + state.artillery.readiness * 2.5)));
    for (let i = 0; i < artilleryAttempts; i++) {
      const kind = bombards + artilleryBuilt < bombardTarget ? 'bombard' : fieldGuns + artilleryBuilt < fieldTarget ? 'field_cannon' : null;
      if (!kind || !buildArtillery(region, kind)) break;
      artilleryBuilt += 1;
    }

    const advanced = Math.max(0, region.navy?.advancedBoats || 0);
    const basic = Math.max(0, (region.navy?.boats || 0) - advanced);
    const navalTarget = hasDockyard ? Math.floor(advanced * (2 + state.naval.readiness * 4) + basic * state.naval.readiness) : 0;
    let navalGunsBuilt = 0;
    const navalAttempts = Math.max(1, Math.floor(buildScale * (0.5 + state.naval.readiness * 3)));
    while (state.naval.guns.length < navalTarget && navalGunsBuilt < navalAttempts) {
      if (!buildNavalGun(region)) break;
      navalGunsBuilt += 1;
    }

    region.marketDemand ||= {};
    if (bombardTarget + fieldTarget > bombards + fieldGuns) region.marketDemand.gunpowder = Math.max(region.marketDemand.gunpowder || 0, 0.3);
    reports.push({ regionId: region.id, artilleryBuilt, navalGunsBuilt, artilleryReadiness: state.artillery.readiness, navalReadiness: state.naval.readiness });
  }
  return reports;
}

export function takeGunpowderSiegeTrain(region, personnel) {
  const state = ensureEarlyModernMilitary(region).artillery;
  const capacity = Math.max(0, Math.floor(Math.max(0, personnel) / 250));
  if (!capacity) return [];
  const ordered = [...state.inventory].sort((a, b) => (b.kind === 'bombard' ? 1 : 0) - (a.kind === 'bombard' ? 1 : 0));
  const selected = ordered.slice(0, capacity);
  for (const item of selected) {
    const index = state.inventory.indexOf(item);
    if (index >= 0) state.inventory.splice(index, 1);
    state.away.push(item);
  }
  return selected;
}

export function returnGunpowderSiegeTrain(region, train = []) {
  const state = ensureEarlyModernMilitary(region).artillery;
  for (const item of train || []) {
    const index = state.away.indexOf(item);
    if (index >= 0) state.away.splice(index, 1);
    if ((item.condition ?? 0) > 0.08) state.inventory.push(item);
  }
}

export function artilleryCampaignProfile(region, train = [], { elapsedDays = 7, logisticsSupply = 1, consumeSupplies = true } = {}) {
  if (!train?.length || !hasTech(region, 'gunpowder')) return { fortDefenceMultiplier: 1, combatMultiplier: 1, suppliedFraction: 0, powderUsed: 0, shotUsed: 0, guns: 0 };
  const weeks = Math.max(0.1, elapsedDays / 7);
  let weight = 0;
  for (const gun of train) {
    const spec = ARTILLERY_SPECS[gun.kind] || ARTILLERY_SPECS.field_cannon;
    weight += spec.siege * materialQuality(gun.metal) * clamp(gun.condition ?? 1, 0.2, 1);
  }
  const powderNeed = weight * 0.34 * weeks;
  const shotNeed = weight * 0.11 * weeks;
  const powderFraction = powderNeed > 0 ? clamp((region.stockpile?.gunpowder || 0) / powderNeed) : 1;
  const shotFraction = shotNeed > 0 ? clamp(availableShotMetal(region) / shotNeed) : 1;
  const suppliedFraction = Math.min(powderFraction, shotFraction, clamp(logisticsSupply));
  const effective = weight * suppliedFraction;
  let powderUsed = 0;
  let shotUsed = 0;
  if (consumeSupplies && effective > 0) {
    powderUsed = powderNeed * suppliedFraction;
    shotUsed = shotNeed * suppliedFraction;
    region.stockpile.gunpowder = Math.max(0, (region.stockpile.gunpowder || 0) - powderUsed);
    consumeShotMetal(region, shotUsed);
    for (const gun of train) gun.condition = clamp((gun.condition ?? 1) - 0.0015 * weeks / Math.max(0.6, materialQuality(gun.metal)), 0, 1);
  }
  return {
    fortDefenceMultiplier: Math.max(0.22, 1 / (1 + effective * 0.34)),
    combatMultiplier: 1 + Math.min(0.24, effective * 0.025),
    suppliedFraction, powderUsed, shotUsed, guns: train.length,
  };
}

export function navalGunCombatProfile(region, ships = [], { elapsedDays = 7, consumeSupplies = true } = {}) {
  const state = ensureEarlyModernMilitary(region).naval;
  if (!hasTech(region, 'gunpowder') || !ships.length || !state.guns.length) return { multiplier: 1, armedShare: 0, suppliedFraction: 0, gunsUsed: 0, steelShare: 0 };
  const advanced = ships.filter((ship) => ship.designId === 'advanced_warship').length;
  const capacity = Math.max(1, advanced * 6 + (ships.length - advanced));
  const gunsUsed = Math.min(state.guns.length, capacity);
  const armedShare = clamp(gunsUsed / capacity);
  const selected = state.guns.slice(0, gunsUsed);
  const steelShare = selected.length ? selected.filter((gun) => gun.metal === 'steel').length / selected.length : 0;
  const quality = selected.length ? selected.reduce((sum, gun) => sum + materialQuality(gun.metal) * clamp(gun.condition ?? 1, 0.25, 1), 0) / selected.length : 1;
  const weeks = Math.max(0.1, elapsedDays / 7);
  const powderNeed = gunsUsed * 0.045 * weeks;
  const shotNeed = gunsUsed * 0.016 * weeks;
  const suppliedFraction = Math.min(
    powderNeed > 0 ? clamp((region.stockpile?.gunpowder || 0) / powderNeed) : 1,
    shotNeed > 0 ? clamp(availableShotMetal(region) / shotNeed) : 1,
  );
  if (consumeSupplies && suppliedFraction > 0) {
    region.stockpile.gunpowder = Math.max(0, (region.stockpile.gunpowder || 0) - powderNeed * suppliedFraction);
    consumeShotMetal(region, shotNeed * suppliedFraction);
    for (const gun of selected) gun.condition = clamp((gun.condition ?? 1) - 0.0012 * weeks / Math.max(0.6, materialQuality(gun.metal)), 0, 1);
  }
  return {
    multiplier: 1 + armedShare * suppliedFraction * (0.58 + (quality - 0.9) * 0.45),
    armedShare, suppliedFraction, gunsUsed, steelShare,
  };
}

export function tickIrregularTechnology(regions, world, elapsedDays = 7, rng = Math.random) {
  const weeks = Math.max(0, elapsedDays) / 7;
  const regionById = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    ensureEarlyModernMilitary(region);
    const tech = region.banditTechnology;
    const bandits = Math.max(0, region.banditPopulation || 0);
    if (!bandits) continue;
    const localFirearms = Math.max(0, region.stockpile?.firearms || 0);
    const localReadiness = hasTech(region, 'gunpowder') ? clamp(region.firearms?.readiness || 0.1) : 0;
    const leakage = clamp((1 - (region.safetyRating ?? 0.5)) * 0.35 + (1 - (region.stability ?? 0.7)) * 0.25 + localReadiness * 0.4);
    const desiredFirearms = bandits * Math.min(0.7, leakage * 0.75);
    const gap = Math.max(0, desiredFirearms - tech.firearms);
    const stolenFirearms = Math.min(localFirearms, gap, Math.max(0, bandits * 0.0025 * weeks * leakage));
    if (stolenFirearms > 0 && rng() < clamp(0.35 + leakage)) {
      region.stockpile.firearms -= stolenFirearms;
      tech.firearms += stolenFirearms;
      tech.firearmExperience = clamp(tech.firearmExperience + stolenFirearms / Math.max(1, bandits) * 0.2);
    }
    const powderTarget = tech.firearms * 0.12;
    const powderGap = Math.max(0, powderTarget - tech.gunpowder);
    const stolenPowder = Math.min(Math.max(0, region.stockpile?.gunpowder || 0), powderGap, bandits * 0.0008 * weeks * leakage);
    if (stolenPowder > 0 && rng() < clamp(0.4 + leakage)) {
      region.stockpile.gunpowder -= stolenPowder;
      tech.gunpowder += stolenPowder;
    }
    tech.steelExposure = clamp(Math.max(tech.steelExposure, (region.steelIndustry?.militaryCoverage || 0) * leakage));
  }

  for (const organisation of world?.nonStateOrganisations || []) {
    if (!organisation?.active) continue;
    const hosts = [...(organisation.hostRegionIds || [])].map((id) => regionById.get(id)).filter(Boolean);
    if (!hosts.length) continue;
    organisation.militaryTechnology ||= { firearms: 0, navalGunnery: 0, steel: 0 };
    const targetFirearms = Math.max(...hosts.map((region) => hasTech(region, 'gunpowder') ? clamp(region.firearms?.readiness || 0.1) : 0));
    const targetNaval = Math.max(...hosts.map((region) => clamp(region.earlyModernMilitary?.naval?.readiness || 0)));
    const targetSteel = Math.max(...hosts.map((region) => clamp(region.steelIndustry?.militaryCoverage || 0)));
    const piracy = organisation.type === 'pirate_haven';
    const mercenary = organisation.type === 'mercenary_company' || organisation.type === 'private_military_company';
    const learningRate = (piracy ? 0.055 : mercenary ? 0.045 : 0.018) * weeks;
    organisation.militaryTechnology.firearms = clamp(organisation.militaryTechnology.firearms + (targetFirearms - organisation.militaryTechnology.firearms) * learningRate);
    organisation.militaryTechnology.navalGunnery = clamp(organisation.militaryTechnology.navalGunnery + (targetNaval - organisation.militaryTechnology.navalGunnery) * learningRate);
    organisation.militaryTechnology.steel = clamp(organisation.militaryTechnology.steel + (targetSteel - organisation.militaryTechnology.steel) * learningRate);
    organisation.militaryTechnologyMultiplier = 1 + organisation.militaryTechnology.firearms * 0.42 +
      (piracy ? organisation.militaryTechnology.navalGunnery * 0.34 : organisation.militaryTechnology.navalGunnery * 0.08) +
      organisation.militaryTechnology.steel * 0.12;
  }
}

export function banditCombatMultiplier(region) {
  const tech = region?.banditTechnology || {};
  const bandits = Math.max(1, region?.banditPopulation || 0);
  const armedShare = clamp((tech.firearms || 0) / bandits);
  const powderNeed = Math.max(0.001, (tech.firearms || 0) * 0.04);
  const supplied = clamp((tech.gunpowder || 0) / powderNeed);
  return 1 + armedShare * supplied * (0.52 + clamp(tech.steelExposure || 0) * 0.1 + clamp(tech.firearmExperience || 0) * 0.12);
}
