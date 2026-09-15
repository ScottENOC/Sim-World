#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'js' / 'military' / 'strategicPlanning.js'
text = path.read_text()
old = '''export function chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns = [], strategyContext = null) {
  const strategy = ensureMilitaryStrategy(region);
  const ctx = strategyContext || buildMilitaryStrategyContext(regions, agreements, polities, currentTick, activeCampaigns);
  const known = [...directContactIds(region)].map((id) => ctx.regionsById.get(id)).filter(Boolean);
  let threat = null;
  let threatScore = 0;
  for (const other of known) {
    const hostility = Math.max(0, -attitudeToward(region, other.id));
    if (hostility <= 0.2) continue;
    const enemy = estimatedEnemyPersonnel(region, other);
    const score = hostility * enemy / Math.max(25, region.army?.personnel || 25);
    if (score > threatScore) { threatScore = score; threat = other; }
  }
  if (threatScore > 1.4) {
    strategy.posture = MILITARY_POSTURES.EMERGENCY_DEFENCE;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 1;
  } else if (threatScore > 0.7) {
    strategy.posture = MILITARY_POSTURES.GUARDED;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 0.8;
  } else if (strategy.posture === MILITARY_POSTURES.EMERGENCY_DEFENCE || strategy.posture === MILITARY_POSTURES.GUARDED) {
    strategy.posture = MILITARY_POSTURES.PEACE;
    strategy.targetRegionId = null;
    strategy.garrisonFloor = 1;
  }
  reviewMilitaryStrategy(region, { regions, agreements, polities, currentTick, activeCampaigns, strategyContext: ctx });
  return strategy;
}'''
new = '''const NPC_FORCE_PLAN_INTERVAL_TICKS = 12;

function stableStrategyHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

export function chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns = [], strategyContext = null) {
  const strategy = ensureMilitaryStrategy(region);
  const ctx = strategyContext || buildMilitaryStrategyContext(regions, agreements, polities, currentTick, activeCampaigns);
  const previousPosture = strategy.posture;
  const previousTarget = strategy.targetRegionId;
  const known = [...directContactIds(region)].map((id) => ctx.regionsById.get(id)).filter(Boolean);
  let threat = null;
  let threatScore = 0;
  for (const other of known) {
    const hostility = Math.max(0, -attitudeToward(region, other.id));
    if (hostility <= 0.2) continue;
    const enemy = estimatedEnemyPersonnel(region, other);
    const score = hostility * enemy / Math.max(25, region.army?.personnel || 25);
    if (score > threatScore) { threatScore = score; threat = other; }
  }
  if (threatScore > 1.4) {
    strategy.posture = MILITARY_POSTURES.EMERGENCY_DEFENCE;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 1;
  } else if (threatScore > 0.7) {
    strategy.posture = MILITARY_POSTURES.GUARDED;
    strategy.targetRegionId = threat?.id || null;
    strategy.garrisonFloor = 0.8;
  } else if (strategy.posture === MILITARY_POSTURES.EMERGENCY_DEFENCE || strategy.posture === MILITARY_POSTURES.GUARDED) {
    strategy.posture = MILITARY_POSTURES.PEACE;
    strategy.targetRegionId = null;
    strategy.garrisonFloor = 1;
  }

  // Threat posture remains responsive every world tick, but a ruler does not
  // rebuild the complete manpower/vassal/ally/campaign establishment plan every
  // month when nothing changed. Spread routine force-plan reviews across an
  // annual cohort; posture/target changes still force an immediate recalculation.
  const postureChanged = strategy.posture !== previousPosture || strategy.targetRegionId !== previousTarget;
  const offset = stableStrategyHash(region.id) % NPC_FORCE_PLAN_INTERVAL_TICKS;
  const bucket = Number.isFinite(currentTick)
    ? Math.floor((currentTick - offset) / NPC_FORCE_PLAN_INTERVAL_TICKS)
    : null;
  const routineReviewDue = !Number.isFinite(currentTick) ||
    (currentTick >= offset && strategy._lastNpcForcePlanBucket !== bucket);
  if (postureChanged || routineReviewDue) {
    reviewMilitaryStrategy(region, { regions, agreements, polities, currentTick, activeCampaigns, strategyContext: ctx });
    if (bucket !== null) strategy._lastNpcForcePlanBucket = bucket;
  }
  return strategy;
}'''
if new in text:
    raise SystemExit('already applied')
if old not in text:
    raise SystemExit('target function not found')
path.write_text(text.replace(old, new, 1))
