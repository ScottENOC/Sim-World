import { technologyComprehension } from './technologyComprehension.js?v=20260914-rifling1';
import { TELEPHONE_TECH_ID } from '../economy/localCommunications.js?v=20260918-telephone1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function readiness(region) {
  if (!region.unlockedTechIds?.has?.('electrical_telegraphy')) return 0;
  const precision = clamp(region.industrialSupply?.capability?.precision_machining || 0);
  const electricity = region.unlockedTechIds?.has?.('electrical_generation') ? 0.15 : 0;
  const urban = clamp(region.medievalSociety?.urban?.urbanisation ?? region.settlements?.urbanShare ?? 0);
  return clamp(0.25 + precision * 0.45 + electricity + urban * 0.15);
}

export function telephoneBreakthroughChance(region, regionsById) {
  if (region.unlockedTechIds?.has?.(TELEPHONE_TECH_ID)) return 0;
  const practice = readiness(region);
  if (practice <= 0) return 0;
  let knowledgeable = 0;
  for (const id of region.neighbors || []) if (regionsById.get(id)?.unlockedTechIds?.has?.(TELEPHONE_TECH_ID)) knowledgeable += 1;
  const comprehension = technologyComprehension({ prerequisitesMet: practice > 0, practice, minimumPractice: 0.22 });
  const independent = practice * 0.0000045;
  const diffusion = 1 - Math.pow(1 - 0.0017 * comprehension, knowledgeable);
  return clamp(1 - (1 - independent) * (1 - diffusion));
}

export function tickTelephoneBreakthroughs(regions, currentTick = 0, rng = Math.random, elapsedDays = 7) {
  const byId = new Map(regions.map(r => [r.id, r]));
  const weekScale = Math.max(0.01, Math.max(0, Number(elapsedDays) || 0) / 7);
  const events = [];
  for (const region of regions) {
    if (!region.unlockedTechIds) continue;
    const base = telephoneBreakthroughChance(region, byId);
    const chance = 1 - Math.pow(1 - base, weekScale);
    if (chance > 0 && rng() < chance) {
      region.unlockedTechIds.add(TELEPHONE_TECH_ID);
      events.push({ type: 'technology_breakthrough', technologyId: TELEPHONE_TECH_ID, regionId: region.id, tick: currentTick, label: 'Telephone networks' });
    }
  }
  return events;
}
