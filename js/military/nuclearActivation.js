const activatedWorlds = new WeakSet();

function hasBuiltNuclearWeapon(region) {
  const weapons = region?.nuclearWeapons;
  if (Number(weapons?.prototypeCount) > 0) return true;
  if (Number(weapons?.operationalWarheads) > 0) return true;
  const forces = region?.nuclearForces;
  return Number(forces?.operationalWarheads) > 0 || Number(forces?.reserveWarheads) > 0;
}

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
 * World-level latch for deterrence-era systems. Deterrence/risk reasoning is
 * dormant only while no nuclear weapon exists anywhere in the loaded world.
 * The first completed prototype or warhead activates the system before that
 * weapon can be tested or used, so first-use decision-making is never hidden
 * behind the gate. Once activated, it stays active for that loaded world.
 *
 * Test/use history remains a recovery fallback for older or partial saves that
 * may contain a historical detonation without a current weapon inventory.
 */
export function nuclearDeterrenceIsActive(regions = []) {
  if (!regions || typeof regions !== 'object') return false;
  if (activatedWorlds.has(regions)) return true;
  for (const region of regions) {
    if (hasBuiltNuclearWeapon(region) || hasCompletedNuclearTest(region) || hasExecutedNuclearUse(region)) {
      activatedWorlds.add(regions);
      return true;
    }
  }
  return false;
}

export function nuclearDeterrenceActivationState(regions = []) {
  return Boolean(regions && typeof regions === 'object' && activatedWorlds.has(regions));
}
