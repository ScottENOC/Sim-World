export const LIGHT_CHARIOTRY_TECH_ID = 'light_chariotry';
export const MOUNTED_CAVALRY_TECH_ID = 'mounted_cavalry';

const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function ensureChariotry(region) {
  if (!region.chariotry) region.chariotry = {};
  const c = region.chariotry;
  if (!Number.isFinite(c.chariots)) c.chariots = 0;
  if (!Number.isFinite(c.builtThisTick)) c.builtThisTick = 0;
  if (!Number.isFinite(c.condition)) c.condition = 1;
  return c;
}

export function tickChariotry(region, elapsedDays = 7) {
  const c = ensureChariotry(region);
  c.builtThisTick = 0;
  if (!region.unlockedTechIds?.has(LIGHT_CHARIOTRY_TECH_ID)) return c;

  const weeks = Math.max(0.01, elapsedDays / 7);
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  const army = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const desired = Math.min(warHorses / 2, Math.max(2, army * 0.08));
  const gap = Math.max(0, desired - c.chariots);
  if (gap > 0) {
    const buildCapacity = Math.max(0.05, Math.sqrt(Math.max(0, region.occupations?.smith || 0) + 1) * 0.025) * weeks;
    const woodCap = Math.max(0, region.stockpile?.wood || 0) / 4;
    const bronzeCap = Math.max(0, region.stockpile?.bronze || 0) / 0.15;
    const textileCap = Math.max(0, region.stockpile?.textiles || 0) / 0.2;
    const build = Math.min(gap, buildCapacity, woodCap, bronzeCap, textileCap);
    if (build > 0) {
      region.stockpile.wood -= build * 4;
      region.stockpile.bronze -= build * 0.15;
      region.stockpile.textiles -= build * 0.2;
      c.chariots += build;
      c.builtThisTick = build;
    }
  }

  // Light vehicles are maintenance hungry. A stressed economy can keep the
  // horses but slowly lose a usable chariot arm as frames, wheels and fittings fail.
  const maintenanceNeed = c.chariots * 0.02 * weeks;
  const woodAvailable = Math.max(0, region.stockpile?.wood || 0);
  const supplied = Math.min(maintenanceNeed, woodAvailable);
  region.stockpile.wood = woodAvailable - supplied;
  const maintenanceRatio = maintenanceNeed > 0 ? supplied / maintenanceNeed : 1;
  c.condition = clamp01(c.condition + (maintenanceRatio - 0.75) * 0.02 * weeks);
  if (c.condition < 0.25) c.chariots *= Math.max(0.96, 1 - (0.25 - c.condition) * 0.01 * weeks);
  return c;
}

export function chariotCoverage(region) {
  if (!region.unlockedTechIds?.has(LIGHT_CHARIOTRY_TECH_ID)) return 0;
  const c = ensureChariotry(region);
  const army = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const horseLimited = Math.min(c.chariots, Math.max(0, region.horseEconomy?.war || 0) / 2);
  return clamp01((horseLimited * 2) / Math.max(1, army * 0.18)) * c.condition;
}

export function cavalryCoverage(region) {
  if (!region.unlockedTechIds?.has(MOUNTED_CAVALRY_TECH_ID)) return 0;
  const army = Math.max(1, (region.army?.personnel || 0) + (region.army?.away || 0));
  const warHorses = Math.max(0, region.horseEconomy?.war || 0);
  return clamp01(warHorses / Math.max(1, army * 0.14));
}

export function mountedDoctrineCombatBonus(region) {
  const chariot = chariotCoverage(region) * 0.32;
  const cavalry = cavalryCoverage(region) * 0.28;
  // Once cavalry is effective, it competes for the same elite riders and horses;
  // bonuses do not simply stack into a super-army.
  return Math.max(chariot, cavalry);
}

export function mountedDoctrineSpeedBonus(region) {
  return Math.max(chariotCoverage(region) * 0.12, cavalryCoverage(region) * 0.24);
}

export function mountedRaidBonus(region) {
  return Math.max(chariotCoverage(region) * 0.22, cavalryCoverage(region) * 0.30);
}
