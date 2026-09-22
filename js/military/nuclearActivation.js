const activatedWorlds = new WeakSet();

function hasCompletedNuclearTest(region) {
  return Boolean(region?.nuclearWeapons?.tests?.some?.((test) => test?.completed));
}

function hasExecutedNuclearUse(region) {
  if (region?.nuclearUse?.globalShock?.firstUseObserved) return true;
  return Boolean(region?.nuclearUse?.history?.some?.((entry) =>
    entry?.type === 'nuclear_use_executed' || entry?.type === 'nuclear_strike_received'
  ));
}

/**
 * World-level latch for deterrence-era systems. Before the first real nuclear
 * detonation (test or wartime use), states have nothing observable to deter or
 * react to, so deterrence/risk simulation remains dormant. Once activated, it
 * stays active for the lifetime of that loaded world. Reloaded saves recover
 * activation from persisted test/use history on the first check.
 */
export function nuclearDeterrenceIsActive(regions = []) {
  if (!regions || typeof regions !== 'object') return false;
  if (activatedWorlds.has(regions)) return true;
  for (const region of regions) {
    if (hasCompletedNuclearTest(region) || hasExecutedNuclearUse(region)) {
      activatedWorlds.add(regions);
      return true;
    }
  }
  return false;
}

export function nuclearDeterrenceActivationState(regions = []) {
  return Boolean(regions && typeof regions === 'object' && activatedWorlds.has(regions));
}
