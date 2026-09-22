import { technologyComprehension } from './technologyComprehension.js?v=20260914-rifling1';
import { createInnovationFrontier } from './innovationFrontier.js?v=20260922-frontier1';
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

function polityTelephoneChance(actor, frontier) {
  let origin = null;
  let practice = 0;
  for (const region of actor.members) {
    const r = readiness(region);
    if (r > practice) { practice = r; origin = region; }
  }
  if (!origin || practice <= 0) return { chance: 0, origin: null };

  const knowledgeablePolities = new Set();
  for (const region of actor.members) {
    for (const id of region.neighbors || []) {
      const neighbour = frontier.regionsById.get(id);
      if (!neighbour?.unlockedTechIds?.has?.(TELEPHONE_TECH_ID)) continue;
      const neighbourActor = neighbour.governance?.sovereignPolityId || neighbour.polityId || neighbour.id;
      if (neighbourActor !== actor.id) knowledgeablePolities.add(neighbourActor);
    }
  }

  const comprehension = technologyComprehension({ prerequisitesMet: true, practice, minimumPractice: 0.22 });
  const independent = practice * 0.0000045;
  const diffusion = 1 - Math.pow(1 - 0.0017 * comprehension, knowledgeablePolities.size);
  return { chance: clamp(1 - (1 - independent) * (1 - diffusion)), origin };
}

export function tickTelephoneBreakthroughs(regions, currentTick = 0, rng = Math.random, elapsedDays = 7) {
  const frontier = createInnovationFrontier(regions, { mode: 'polity' });
  if (frontier.isUniversal(TELEPHONE_TECH_ID)) return [];
  const weekScale = Math.max(0.01, Math.max(0, Number(elapsedDays) || 0) / 7);
  const events = [];

  for (const actor of frontier.actorsById.values()) {
    if (actor.knownTechIds.has(TELEPHONE_TECH_ID)) continue;
    const result = polityTelephoneChance(actor, frontier);
    if (!result.origin || result.chance <= 0) continue;
    const chance = 1 - Math.pow(1 - result.chance, weekScale);
    if (rng() >= chance) continue;

    // Modern knowledge belongs to the national innovation system; regional
    // infrastructure/adoption still determines where the technology is useful.
    for (const region of actor.members) {
      region.unlockedTechIds ||= new Set();
      region.unlockedTechIds.add(TELEPHONE_TECH_ID);
    }
    events.push({
      type: 'technology_breakthrough',
      technologyId: TELEPHONE_TECH_ID,
      polityId: actor.id,
      regionId: result.origin.id,
      tick: currentTick,
      label: 'Telephone networks',
    });
  }
  return events;
}
