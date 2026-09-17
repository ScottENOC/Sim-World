import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';

export const SHALLOW_OIL_DRILLING_TECH_ID = 'petroleum_well_drilling';
export const DEEP_OIL_DRILLING_TECH_ID = 'deep_rotary_drilling';
export const HYDRAULIC_FRACTURING_TECH_ID = 'hydraulic_fracturing';
export const OFFSHORE_OIL_DRILLING_TECH_ID = 'offshore_drilling';
export const PETROLEUM_REFINING_TECH_ID = 'petroleum_refining';
export const PETROLEUM_CRACKING_TECH_ID = 'petroleum_cracking';
export const PETROLEUM_DESULFURISATION_TECH_ID = 'petroleum_desulfurisation';
export const AVIATION_FRACTIONATION_TECH_ID = 'aviation_fractionation';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const readiness = (value, scale) => 1 - Math.exp(-Math.max(0, Number(value) || 0) / Math.max(1, scale));

function neighbourCount(region, byId, techId) {
  return (region.neighbors || []).filter((id) => byId.get(id)?.unlockedTechIds?.has(techId)).length;
}

function tradePartnerCount(region, byId, techId) {
  const ids = region.recentTradePartners instanceof Map ? [...region.recentTradePartners.keys()] : [...(region.tradePartnerIds || [])];
  return ids.filter((id) => byId.get(id)?.unlockedTechIds?.has(techId)).length;
}

function diffusionChance(region, byId, techId, base) {
  const exposures = neighbourCount(region, byId, techId) + tradePartnerCount(region, byId, techId) * 1.4;
  return 1 - Math.pow(1 - base, Math.max(0, exposures));
}

export function petroleumBreakthroughChances(region, regionsById) {
  const tech = region.unlockedTechIds || new Set();
  const mining = readiness(effectiveExperience(region, 'mining'), 400_000);
  const smithing = readiness(effectiveExperience(region, 'smithing'), 300_000);
  const admin = region.governance?.administration || region.administration || {};
  const records = clamp01(admin.recordKeeping || 0);
  const accounting = clamp01(admin.accounting || 0);
  const finance = clamp01(region.corporateCapital?.financialDepth || 0);
  const industry = clamp01(region.protoIndustry?.industrialCapacity || region.protoIndustry?.productivity || 0);
  const hasOil = Boolean(region.deposits?.oil);
  const shallow = tech.has(SHALLOW_OIL_DRILLING_TECH_ID) ? 0 :
    (hasOil ? mining * (0.25 + smithing * 0.75) * 0.000018 : 0) + diffusionChance(region, regionsById, SHALLOW_OIL_DRILLING_TECH_ID, 0.00045);
  const deepReady = tech.has(SHALLOW_OIL_DRILLING_TECH_ID);
  const deep = tech.has(DEEP_OIL_DRILLING_TECH_ID) || !deepReady ? 0 :
    mining * (0.2 + smithing * 0.35 + industry * 0.25 + records * 0.2) * 0.000010 + diffusionChance(region, regionsById, DEEP_OIL_DRILLING_TECH_ID, 0.00032);
  const advancedBase = tech.has(DEEP_OIL_DRILLING_TECH_ID);
  const fracking = tech.has(HYDRAULIC_FRACTURING_TECH_ID) || !advancedBase ? 0 :
    mining * (0.2 + industry * 0.3 + finance * 0.25 + accounting * 0.25) * 0.0000045 + diffusionChance(region, regionsById, HYDRAULIC_FRACTURING_TECH_ID, 0.00018);
  const offshore = tech.has(OFFSHORE_OIL_DRILLING_TECH_ID) || !advancedBase || !region.isCoastal ? 0 :
    mining * (0.18 + industry * 0.27 + finance * 0.25 + records * 0.15 + accounting * 0.15) * 0.000004 + diffusionChance(region, regionsById, OFFSHORE_OIL_DRILLING_TECH_ID, 0.00016);
  const refiningReady = tech.has(SHALLOW_OIL_DRILLING_TECH_ID);
  const refining = tech.has(PETROLEUM_REFINING_TECH_ID) || !refiningReady ? 0 :
    (0.18 + smithing * 0.28 + industry * 0.34 + accounting * 0.20) * 0.000012 + diffusionChance(region, regionsById, PETROLEUM_REFINING_TECH_ID, 0.00038);
  const refineryAdvanced = tech.has(PETROLEUM_REFINING_TECH_ID);
  const cracking = tech.has(PETROLEUM_CRACKING_TECH_ID) || !refineryAdvanced ? 0 :
    (0.12 + industry * 0.38 + finance * 0.20 + accounting * 0.30) * 0.000005 + diffusionChance(region, regionsById, PETROLEUM_CRACKING_TECH_ID, 0.00018);
  const desulfurisation = tech.has(PETROLEUM_DESULFURISATION_TECH_ID) || !refineryAdvanced ? 0 :
    (0.1 + industry * 0.35 + records * 0.20 + accounting * 0.35) * 0.0000045 + diffusionChance(region, regionsById, PETROLEUM_DESULFURISATION_TECH_ID, 0.00016);
  const aviation = tech.has(AVIATION_FRACTIONATION_TECH_ID) || !tech.has(PETROLEUM_CRACKING_TECH_ID) ? 0 :
    (0.08 + industry * 0.42 + finance * 0.18 + accounting * 0.32) * 0.000003 + diffusionChance(region, regionsById, AVIATION_FRACTIONATION_TECH_ID, 0.00012);
  return { shallow: clamp01(shallow), deep: clamp01(deep), fracking: clamp01(fracking), offshore: clamp01(offshore), refining: clamp01(refining), cracking: clamp01(cracking), desulfurisation: clamp01(desulfurisation), aviation: clamp01(aviation) };
}

export function tickPetroleumBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const events = [];
  const byId = new Map(regions.map((r) => [r.id, r]));
  const scale = Math.max(0, Number(elapsedDays) || 0) / 7;
  const attempts = [
    ['shallow', SHALLOW_OIL_DRILLING_TECH_ID, 'petroleum_well_drilling_breakthrough', 'Shallow petroleum drilling'],
    ['deep', DEEP_OIL_DRILLING_TECH_ID, 'deep_rotary_drilling_breakthrough', 'Deep petroleum drilling'],
    ['fracking', HYDRAULIC_FRACTURING_TECH_ID, 'hydraulic_fracturing_breakthrough', 'Hydraulic fracturing'],
    ['offshore', OFFSHORE_OIL_DRILLING_TECH_ID, 'offshore_drilling_breakthrough', 'Offshore petroleum drilling'],
    ['refining', PETROLEUM_REFINING_TECH_ID, 'petroleum_refining_breakthrough', 'Petroleum refining'],
    ['cracking', PETROLEUM_CRACKING_TECH_ID, 'petroleum_cracking_breakthrough', 'Petroleum cracking'],
    ['desulfurisation', PETROLEUM_DESULFURISATION_TECH_ID, 'petroleum_desulfurisation_breakthrough', 'Petroleum desulfurisation'],
    ['aviation', AVIATION_FRACTIONATION_TECH_ID, 'aviation_fractionation_breakthrough', 'Aviation-fuel fractionation'],
  ];
  for (const region of regions) {
    region.unlockedTechIds ||= new Set();
    const chances = petroleumBreakthroughChances(region, byId);
    for (const [key, techId, type, label] of attempts) {
      if (region.unlockedTechIds.has(techId)) continue;
      const weekly = chances[key] || 0;
      const chance = 1 - Math.pow(1 - weekly, scale);
      if ((rng?.() ?? Math.random()) >= chance) continue;
      region.unlockedTechIds.add(techId);
      events.push({ type, regionId: region.id, regionName: region.name, tick: currentTick, title: `${label} developed`, message: `${region.name} can now exploit a new class of petroleum deposits.` });
      // Do not chain several breakthroughs in one tick merely because RNG is favourable.
      break;
    }
  }
  return events;
}
