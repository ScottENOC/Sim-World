const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function terrainChariotFactor(region) {
  const terrain = String(region.terrain || region.terrainType || '').toLowerCase();
  if (terrain.includes('mountain')) return 0.12;
  if (terrain.includes('forest') || terrain.includes('wood')) return 0.28;
  if (terrain.includes('marsh') || terrain.includes('swamp')) return 0.18;
  if (terrain.includes('hill')) return 0.5;
  return 1;
}

export function chariotMilitaryEffect(region) {
  if (!region.unlockedTechIds?.has('light_chariotry')) return { strength: 1, pursuit: 1, raid: 1, reconnaissance: 1, speed: 1 };
  const soldiers = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  // Approximate two horses per vehicle and 2-3 crew; coverage therefore
  // represents how much of the army can field a meaningful chariot arm.
  const potentialChariots = warHorses / 2;
  const coverage = clamp01(potentialChariots / Math.max(1, soldiers * 0.055));
  const terrain = terrainChariotFactor(region);
  return {
    strength: 1 + coverage * 0.22 * terrain,
    pursuit: 1 + coverage * 0.55 * terrain,
    raid: 1 + coverage * 0.30 * terrain,
    reconnaissance: 1 + coverage * 0.35 * terrain,
    speed: 1 + coverage * 0.18 * terrain,
    coverage,
    terrainFactor: terrain,
  };
}

export function cavalryMilitaryEffect(region) {
  if (!region.unlockedTechIds?.has('mounted_cavalry')) return { strength: 1, pursuit: 1, raid: 1, reconnaissance: 1, speed: 1 };
  const soldiers = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  const coverage = clamp01(warHorses / Math.max(1, soldiers * 0.08));
  return {
    strength: 1 + coverage * 0.16,
    pursuit: 1 + coverage * 0.40,
    raid: 1 + coverage * 0.36,
    reconnaissance: 1 + coverage * 0.42,
    speed: 1 + coverage * 0.28,
    coverage,
  };
}

export function classicalArmyMultipliers(region) {
  const chariot = chariotMilitaryEffect(region);
  const cavalry = cavalryMilitaryEffect(region);
  const massInfantry = region.unlockedTechIds?.has('mass_heavy_infantry') ? 1.12 : 1;
  const drill = region.unlockedTechIds?.has('military_drill') ? 1.10 : 1;
  return {
    battleStrength: Math.max(chariot.strength, cavalry.strength) * massInfantry * drill,
    pursuit: Math.max(chariot.pursuit, cavalry.pursuit),
    raid: Math.max(chariot.raid, cavalry.raid),
    reconnaissance: Math.max(chariot.reconnaissance, cavalry.reconnaissance),
    speed: Math.max(chariot.speed, cavalry.speed),
  };
}
