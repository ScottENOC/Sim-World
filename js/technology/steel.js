import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';

export const STEELMAKING_TECH_ID = 'steelmaking';
const DAYS_PER_YEAR = 365.2425;
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function recentPartners(region, regionsById, currentTick = null) {
  const ids = region.recentTradePartners instanceof Map
    ? [...region.recentTradePartners.entries()]
        .filter(([, tick]) => currentTick == null || currentTick - tick <= 104)
        .map(([id]) => id)
    : [...(region.tradePartnerIds || [])];
  return ids.map((id) => regionsById.get(id)).filter(Boolean);
}

export function steelmakingBreakthroughChance(region, regionsById, currentTick = null) {
  if (region.unlockedTechIds?.has(STEELMAKING_TECH_ID) || !region.unlockedTechIds?.has('iron_smelting')) return 0;
  const smithing = Math.max(0, effectiveExperience(region, 'smithing'));
  const skill = 1 - Math.exp(-smithing / 240_000);
  const ironMaturity = clamp01(region.ironWorkingReadiness || 0);
  const hasIron = (region.stockpile?.iron || 0) > 4 || Boolean(region.deposits?.ironOre);
  const hasCarbonFuel = (region.stockpile?.wood || 0) > 20 || (region.forest?.currentStock || 0) > 200;
  const local = hasIron && hasCarbonFuel
    ? (0.08 + skill * 0.92) * (0.25 + ironMaturity * 0.75) * 1.8e-6
    : 0;
  let exposed = 0;
  for (const id of region.neighbors || []) if (regionsById.get(id)?.unlockedTechIds?.has(STEELMAKING_TECH_ID)) exposed += 1;
  for (const partner of recentPartners(region, regionsById, currentTick)) if (partner.unlockedTechIds?.has(STEELMAKING_TECH_ID)) exposed += 0.7;
  const diffusion = 1 - Math.pow(1 - 0.0014, exposed);
  return 1 - (1 - local) * (1 - diffusion);
}

export function ensureSteelIndustry(region) {
  region.steelIndustry ||= {};
  const state = region.steelIndustry;
  if (!Number.isFinite(state.readiness)) state.readiness = region.unlockedTechIds?.has(STEELMAKING_TECH_ID) ? 0.03 : 0;
  if (!Number.isFinite(state.producedThisTick)) state.producedThisTick = 0;
  if (!Number.isFinite(state.militaryCoverage)) state.militaryCoverage = 0;
  if (!Number.isFinite(region.stockpile?.steel)) {
    region.stockpile ||= {};
    region.stockpile.steel = 0;
  }
  return state;
}

export function tickSteelIndustry(region, elapsedDays = 7) {
  const state = ensureSteelIndustry(region);
  state.producedThisTick = 0;
  if (!region.unlockedTechIds?.has(STEELMAKING_TECH_ID)) return state;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const weeks = Math.max(0, elapsedDays) / 7;
  const smithing = Math.max(0, effectiveExperience(region, 'smithing'));
  const skill = 1 - Math.exp(-smithing / 300_000);
  state.readiness = clamp01(state.readiness + (0.18 + skill * 0.55) * years * (1 - state.readiness));

  const smiths = Math.max(0, region.occupations?.smith || 0);
  const capacity = smiths * weeks * 0.018 * (0.25 + state.readiness * 0.75);
  const iron = Math.max(0, region.stockpile?.iron || 0);
  const wood = Math.max(0, region.stockpile?.wood || 0);
  const batch = Math.min(capacity, iron, wood / 1.8);
  if (batch > 0) {
    region.stockpile.iron -= batch;
    region.stockpile.wood -= batch * 1.8;
    region.stockpile.steel = (region.stockpile.steel || 0) + batch * (0.72 + state.readiness * 0.18);
    state.producedThisTick = batch;
  }
  return state;
}

export function tickSteelMilitaryAdoption(region, elapsedDays = 7) {
  const state = ensureSteelIndustry(region);
  if (!region.unlockedTechIds?.has(STEELMAKING_TECH_ID)) return state;
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const army = Math.max(0, (region.army?.personnel || 0) + (region.army?.away || 0));
  const specialist = (region.unlockedTechIds?.has('crossbows') ? 0.12 : 0) +
    (region.unlockedTechIds?.has('heavy_cavalry') ? 0.18 : 0) +
    (region.unlockedTechIds?.has('gunpowder') ? 0.12 : 0);
  const target = Math.min(0.62, state.readiness * (0.24 + specialist));
  const adoptionStep = (target - state.militaryCoverage) * (1 - Math.exp(-years / 8));
  if (adoptionStep > 0 && army > 0) {
    const steelNeed = army * adoptionStep * 0.018;
    const available = Math.max(0, region.stockpile?.steel || 0);
    const ratio = Math.min(1, available / Math.max(0.0001, steelNeed));
    const adopted = adoptionStep * ratio;
    region.stockpile.steel = available - steelNeed * ratio;
    state.militaryCoverage = clamp01(state.militaryCoverage + adopted);
  } else if (adoptionStep < 0) {
    state.militaryCoverage = Math.max(target, state.militaryCoverage + adoptionStep);
  }
  const maintenance = army * state.militaryCoverage * 0.0012 * years;
  const supplied = Math.min(Math.max(0, region.stockpile?.steel || 0), maintenance);
  region.stockpile.steel = Math.max(0, (region.stockpile.steel || 0) - supplied);
  if (maintenance > 0 && supplied < maintenance * 0.4) state.militaryCoverage *= Math.max(0.96, 1 - years * 0.08);
  return state;
}

export function steelMilitaryQualityMultiplier(region) {
  const coverage = clamp01(region.steelIndustry?.militaryCoverage || 0);
  return 1 + coverage * 0.14;
}
