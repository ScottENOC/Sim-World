from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))
    return True

replace_once(
    'js/military/fleets.js',
    "import { navalGunCombatProfile } from './earlyModernWarfare.js?v=20260913-early-modern1';\n",
    "import { navalGunCombatProfile } from './earlyModernWarfare.js?v=20260913-early-modern1';\nimport { ensureFleetProvisioning, provisioningCombatMultiplier, serviceProvisioningInPort, shouldReturnForProvisioning, tickProvisioningAtSea } from './oceanicProvisioning.js?v=20260913-provisioning1';\n",
)
replace_once(
    'js/military/fleets.js',
    "  fleet.history ||= [];\n  return fleet;\n",
    "  fleet.history ||= [];\n  ensureFleetProvisioning(fleet);\n  return fleet;\n",
)
replace_once(
    'js/military/fleets.js',
    "function serviceInPort(fleet, regionsById, agreements, weeks) {\n",
    "function fleetCrewCount(fleet) {\n  return (fleet.ships || []).reduce((sum, ship) => sum + designOf(ship).crew, 0);\n}\n\nfunction serviceInPort(fleet, regionsById, agreements, weeks) {\n",
)
replace_once(
    'js/military/fleets.js',
    "  for (const ship of fleet.ships) ship.condition = clamp((ship.condition ?? fleet.condition) + repairRate * weeks);\n  return { access, supplied, repaired: fleet.condition - before };\n",
    "  for (const ship of fleet.ships) ship.condition = clamp((ship.condition ?? fleet.condition) + repairRate * weeks);\n  const provisioning = serviceProvisioningInPort(fleet, port, owner, weeks, fleetCrewCount(fleet));\n  return { access, supplied, repaired: fleet.condition - before, provisioning };\n",
)
replace_once(
    'js/military/fleets.js',
    "  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10);\n",
    "  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet);\n",
)
replace_once(
    'js/military/fleets.js',
    "  let power = shipPower * skill * readiness;\n",
    "  let power = shipPower * skill * readiness * provisioningCombatMultiplier(fleet);\n",
)
replace_once(
    'js/military/fleets.js',
    "    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72)) {\n",
    "    if (fleet.locationType === 'sea' && (fleet.supply < 0.32 || fleet.condition < 0.62 || fleet.fatigue > 0.72 || shouldReturnForProvisioning(fleet))) {\n",
)
replace_once(
    'js/military/fleets.js',
    "      wearAtSea(fleet, weeks);\n      advanceFleetRoute(fleet, weeks);\n      const origin = regionsById.get(fleet.ownerRegionId);\n",
    "      wearAtSea(fleet, weeks);\n      advanceFleetRoute(fleet, weeks);\n      const origin = regionsById.get(fleet.ownerRegionId);\n      const provisioning = tickProvisioningAtSea(fleet, origin, weeks);\n      if (provisioning.event) { provisioning.event.tick = currentTick; events.push(provisioning.event); }\n",
)

print('Oceanic provisioning and scurvy integration applied')
