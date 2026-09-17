import { effectiveExperience } from './learningByDoing.js?v=20260906-education1';
import { technologyComprehension } from './technologyComprehension.js?v=20260914-rifling1';
import { TELEGRAPH_TECH_ID } from '../diplomacy/telegraph.js?v=20260917-telegraph1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function hasWriting(region) {
  return Boolean(region.communicationState?.writingAvailable || region.education?.writingTradition || region.unlockedTechIds?.has?.('writing'));
}

function precisionReadiness(region) {
  return clamp(region.industrialSupply?.capability?.precision_machining || 0);
}

function electricalPractice(region) {
  const unlocked = region.unlockedTechIds?.has?.('electrical_generation') ? 0.45 : 0;
  const industry = precisionReadiness(region) * 0.35;
  const craft = 1 - Math.exp(-Math.max(0, effectiveExperience(region, 'smithing')) / 500000);
  return clamp(unlocked + industry + craft * 0.2);
}

export function telegraphBreakthroughChance(region, regionsById) {
  if (region.unlockedTechIds?.has?.(TELEGRAPH_TECH_ID) || !hasWriting(region)) return 0;
  const practice = electricalPractice(region);
  const admin = clamp((region.communicationState?.messengerExperience || 0) / 120);
  const precision = precisionReadiness(region);
  const independent = practice * precision * (0.2 + admin * 0.8) * 0.000012;
  let knowledgeable = 0;
  for (const id of region.neighbors || []) if (regionsById.get(id)?.unlockedTechIds?.has?.(TELEGRAPH_TECH_ID)) knowledgeable += 1;
  const comprehension = technologyComprehension({ prerequisitesMet: hasWriting(region), practice: clamp(practice * 0.65 + precision * 0.35), minimumPractice: 0.08 });
  const diffusion = 1 - Math.pow(1 - 0.0025 * comprehension, knowledgeable);
  return clamp(1 - (1 - independent) * (1 - diffusion));
}

export function tickTelegraphBreakthroughs(regions, currentTick = 0, rng = Math.random, elapsedDays = 7) {
  const byId = new Map(regions.map(r => [r.id, r]));
  const weekScale = Math.max(0.01, elapsedDays / 7);
  const events = [];
  for (const region of regions) {
    if (!region.unlockedTechIds) continue;
    const chance = 1 - Math.pow(1 - telegraphBreakthroughChance(region, byId), weekScale);
    if (chance > 0 && rng() < chance) {
      region.unlockedTechIds.add(TELEGRAPH_TECH_ID);
      events.push({ type: 'technology_breakthrough', technologyId: TELEGRAPH_TECH_ID, regionId: region.id, tick: currentTick, label: 'Electrical telegraphy' });
    }
  }
  return events;
}
