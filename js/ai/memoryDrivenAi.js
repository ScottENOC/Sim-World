import { availableConstructionTypes, startConstruction } from '../economy/construction.js?v=20260905-projects1';
import {
  dominantReligion, ensureRegionReligion, establishReligiousCentre, religionById,
} from '../society/religion.js?v=20260905-religion1';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function weightedMemory(region, predicate) {
  let total = 0;
  for (const memory of region.culturalMemory?.memories || []) {
    if (!predicate(memory)) continue;
    const strength = clamp01(memory.strength || 0);
    const relevance = clamp01(memory.practicalRelevance ?? 0.5);
    const defining = memory.defining ? 1.2 : 1;
    total += strength * (0.35 + relevance * 0.65) * defining;
  }
  return clamp01(total / 1.6);
}

export function npcMemorySignals(region) {
  return {
    famine: weightedMemory(region, (m) => m.theme === 'famine' || m.motif === 'survival'),
    religious: weightedMemory(region, (m) => m.theme === 'religion' || m.sourceType === 'state_religion' || m.sourceType === 'religious_shift'),
    politicalLoss: weightedMemory(region, (m) => m.theme === 'political_loss' || (m.sourceType === 'sovereignty_change' && (m.valence || 0) < 0)),
    politicalContinuity: weightedMemory(region, (m) => m.theme === 'rulership' || m.theme === 'political_settlement' || m.theme === 'political_continuity'),
    migration: weightedMemory(region, (m) => m.theme === 'migration' || m.sourceType === 'migration'),
    martial: weightedMemory(region, (m) => ['victory', 'defeat', 'military_tradition'].includes(m.theme)),
  };
}

function tryConstruction(region, ids, currentTick) {
  if ((region.construction?.projects || []).some((p) => p.status === 'active')) return null;
  const available = new Set(availableConstructionTypes(region).map((type) => type.id));
  for (const id of ids) {
    if (!available.has(id)) continue;
    const typeWorkers = {
      public_granary: 60, irrigation: 120, wells_cisterns: 60, canal: 250,
      great_temple: 380, ceremonial_complex: 300, administrative_centre: 140,
    }[id] || 80;
    const project = startConstruction(region, id, typeWorkers, currentTick);
    if (project) return project;
  }
  return null;
}

export function applyMemoryDrivenNpcPolicy(region, religiousWorld, currentTick, rng = Math.random, strategicWeeks = 13) {
  const signals = npcMemorySignals(region);
  region.aiMemoryBias = { ...signals, updatedTick: currentTick };

  // Memories alter priorities, not productive output. A society marked by hunger
  // is more willing to spend scarce labour and treasury on resilience, but only
  // if it can actually build and pay for the relevant infrastructure.
  if (signals.famine > 0.12 && (region.treasury || 0) >= 5) {
    const currentShortfall = (region.report?.foodPlan?.shortfall || 0) > 0;
    const annualisedChance = clamp01(0.10 + signals.famine * 0.55 + (currentShortfall ? 0.28 : 0));
    const reviewChance = 1 - Math.pow(1 - annualisedChance, Math.max(0.02, strategicWeeks / 52));
    if (rng() < reviewChance) {
      const built = tryConstruction(region,
        currentShortfall
          ? ['public_granary', 'irrigation', 'wells_cisterns', 'canal']
          : ['public_granary', 'wells_cisterns', 'irrigation', 'canal'],
        currentTick);
      if (built) return { type: 'memory_food_security', project: built, signals };
    }
  }

  if (religiousWorld && signals.religious > 0.1) {
    const state = ensureRegionReligion(region, religiousWorld);
    const dominant = dominantReligion(region, religiousWorld);
    const share = dominant ? state.shares[dominant.id] || 0 : 0;
    // A strong inherited religious story makes official religious legitimacy
    // more politically attractive, but an overwhelmingly changed population
    // can still force the state to follow the new dominant faith.
    if (!state.stateReligionId && dominant && share >= Math.max(0.48, 0.62 - signals.religious * 0.16)) {
      state.stateReligionId = dominant.id;
    } else if (state.stateReligionId && dominant && state.stateReligionId !== dominant.id) {
      const officialShare = state.shares[state.stateReligionId] || 0;
      if (officialShare < 0.12 && share > 0.58) state.stateReligionId = dominant.id;
    }

    const official = religionById(religiousWorld, state.stateReligionId);
    if (official && !official.adminCentreRegionId && official.holyCityRegionId === region.id &&
        (region.treasury || 0) >= 40 && rng() < 0.08 + signals.religious * 0.22) {
      establishReligiousCentre(region, religiousWorld, official.id);
    }

    if (state.stateReligionId && (region.treasury || 0) >= 20 && rng() < signals.religious * 0.12) {
      const built = tryConstruction(region, ['great_temple', 'ceremonial_complex'], currentTick);
      if (built) return { type: 'memory_religious_legitimacy', project: built, signals };
    }
  }

  return { type: 'memory_bias_review', signals };
}
