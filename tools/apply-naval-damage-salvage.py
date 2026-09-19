from pathlib import Path
p=Path('js/military/fleets.js')
text=p.read_text()

def rep(old,new):
    global text
    if new in text: return
    if old not in text: raise SystemExit(f'missing migration anchor: {old[:80]!r}')
    text=text.replace(old,new,1)

rep("import { DREADNOUGHT_TECH_ID, SUBMARINE_TECH_ID, tickLateIndustrialNavalWarfare } from './lateIndustrialNavy.js?v=20260918-navy1';\n",
    "import { DREADNOUGHT_TECH_ID, SUBMARINE_TECH_ID, tickLateIndustrialNavalWarfare } from './lateIndustrialNavy.js?v=20260918-navy1';\nimport { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';\n")

rep("  submarine: {\n",
"  fleet_tug: {\n    id: 'fleet_tug', label: 'fleet salvage tug', tier: 6, advanced: true, support: true, propulsion: 'steam', crew: 18, speed: 1.48,\n    fallbackSpeed: 0.34, combat: 0.18, durability: 1.65, pursuit: 0.70, captureResistance: 0.88, gunCapacity: 1, armour: 0.08,\n    coalCapacity: 20, coalPerWeek: 1.45, salvageCapacity: 1.0, towPower: 1.0, refitCost: { wood: 35, iron: 18, coal: 8, machine: 9 },\n  },\n  submarine: {\n")

rep("  return {\n    id: `ship-${nextShipId++}`,\n",
    "  return initialiseShipDamage({\n    id: `ship-${nextShipId++}`,\n")
rep("    ...overrides,\n  };\n}\n\nfunction fleetCoalCapacity",
    "    ...overrides,\n  });\n}\n\nfunction fleetCoalCapacity")

rep("  for (let i = 0; i < count; i++) {\n    let id;\n",
    "  for (let i = 0; i < count; i++) {\n    let id;\n")
rep("  return targets;\n}\n\nexport function ensureNavalProcurement",
    "  if (region?.unlockedTechIds?.has(MARINE_STEAM_TECH_ID) && count >= 4) targets.fleet_tug = Math.max(targets.fleet_tug || 0, Math.ceil(count / 8));\n  return targets;\n}\n\nexport function ensureNavalProcurement")

rep("      .filter(({ ship, target }) => isAdvancedShip(ship) && (SHIP_DESIGNS[target]?.tier || 0) > shipTier(ship))",
    "      .filter(({ ship, target }) => !designOf(ship).support && isAdvancedShip(ship) && (SHIP_DESIGNS[target]?.tier || 0) > shipTier(ship))")

rep("function effectiveShipSpeed(ship, fleet) {\n  const spec = designOf(ship);\n  if (!spec.coalPerWeek) return spec.speed;\n  const fuel = clamp(fleet.steamFuelFraction ?? 1);\n  const fallback = spec.fallbackSpeed ?? spec.speed * 0.45;\n  return fallback + (spec.speed - fallback) * fuel;\n}",
"function effectiveShipSpeed(ship, fleet) {\n  const spec = designOf(ship), damage=shipPropulsionMultiplier(ship);\n  if (!spec.coalPerWeek) return spec.speed * damage;\n  const fuel = clamp(fleet.steamFuelFraction ?? 1);\n  const fallback = spec.fallbackSpeed ?? spec.speed * 0.45;\n  return (fallback + (spec.speed - fallback) * fuel) * damage;\n}")

rep("  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet);",
    "  return harmonic * (0.65 + fleet.condition * 0.35) * (0.72 + fleet.supply * 0.18 + (1 - fleet.fatigue) * 0.10) * provisioningCombatMultiplier(fleet) * fleetTowSpeedMultiplier(fleet);")

rep("  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1), 0);",
    "  const shipPower = fleet.ships.reduce((sum, ship) => sum + designOf(ship).combat * clamp(ship.condition ?? fleet.condition, 0.1, 1) * shipCombatMultiplier(ship), 0);")

rep("  for (const ship of fleet.ships) ship.condition = clamp((ship.condition ?? fleet.condition) + repairRate * weeks);",
    "  for (const ship of fleet.ships) repairShipDamage(ship, repairRate * weeks, { dockyard: access !== 'ally' && (operationalInfrastructure(port, 'shipyard') || operationalInfrastructure(port, 'naval_base')) });")

rep("function damageRandomShip(fleet, amount, rng) {\n  if (!fleet.ships.length) return null;\n  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];\n  ship.condition = clamp((ship.condition ?? fleet.condition) - amount, 0.05, 1);\n  return ship;\n}",
"function damageRandomShip(fleet, amount, rng) {\n  if (!fleet.ships.length) return null;\n  const ship = fleet.ships[Math.min(fleet.ships.length - 1, Math.floor(rng() * fleet.ships.length))];\n  applyShipHit(ship, amount, { rng });\n  return ship;\n}")

rep("function lossesForSide(fleet, enemyShare, rng, portProtected = false) {\n  const results = { sunk: [], capturedCandidates: [], damaged: [] };",
    "function lossesForSide(fleet, enemyShare, rng, portProtected = false) {\n  const results = { sunk: [], capturedCandidates: [], damaged: [], salvaged: [] };")
rep("    if (roll < 0.38) {\n      const ship = removeRandomShip(fleet, rng);\n      if (ship) results.sunk.push(ship);",
"    if (roll < 0.38) {\n      const ship = removeRandomShip(fleet, rng);\n      if (ship) {\n        applyShipHit(ship, 0.48 + rng() * 0.42, { rng, catastrophic: true });\n        const recovery = portProtected ? { recovered: true, tugId: null } : attemptFleetSalvage(fleet, ship, { rng, hostilePressure: enemyShare });\n        if (recovery.recovered) { fleet.ships.push(ship); results.salvaged.push({ ship, tugId: recovery.tugId }); results.damaged.push(ship); }\n        else results.sunk.push(ship);\n      }")

rep("  fleet.morale = clamp(fleet.morale - Math.max(0, 0.55 - fleet.supply) * 0.015 * weeks);\n}",
"  fleet.morale = clamp(fleet.morale - Math.max(0, 0.55 - fleet.supply) * 0.015 * weeks);\n  for (const ship of fleet.ships) tickShipDamageAtSea(ship, weeks);\n}\n")

p.write_text(text)
print('naval damage and salvage integration applied')
