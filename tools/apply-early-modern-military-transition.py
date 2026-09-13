from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old, new, 1))
    return True


# Firearms: steel improves quality without gating early guns.
replace_once(
    'js/military/firearms.js',
    "const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));\n",
    "import { firearmSteelQualityMultiplier } from './earlyModernWarfare.js?v=20260913-early-modern1';\n\nconst clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));\n",
)
replace_once(
    'js/military/firearms.js',
    "  const multiplier = Math.max(0.68, 1 + sustainedBonus + surpriseBonus - dryPenalty);\n",
    "  const metallurgyMultiplier = firearmSteelQualityMultiplier(region);\n  const multiplier = Math.max(0.68, 1 + sustainedBonus + surpriseBonus - dryPenalty) * metallurgyMultiplier;\n",
)
replace_once(
    'js/military/firearms.js',
    "  const profile = { multiplier, firearmShare, suppliedShare, surpriseBonus, dryPenalty, powderUsed, shotMetalUsed, supplyFraction };\n",
    "  const profile = { multiplier, firearmShare, suppliedShare, surpriseBonus, dryPenalty, powderUsed, shotMetalUsed, supplyFraction, metallurgyMultiplier };\n",
)

# Campaigns: take real artillery with the army and feed it powder/shot in siege combat.
replace_once(
    'js/military/campaigns.js',
    "import { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';\n",
    "import { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';\nimport { artilleryCampaignProfile, returnGunpowderSiegeTrain, takeGunpowderSiegeTrain } from './earlyModernWarfare.js?v=20260913-early-modern1';\n",
)
replace_once(
    'js/military/campaigns.js',
    "    siegeEquipment,\n    beneficiaryPolityId: options.beneficiaryPolityId || null,\n",
    "    siegeEquipment,\n    gunpowderArtillery: takeGunpowderSiegeTrain(attacker, personnel),\n    beneficiaryPolityId: options.beneficiaryPolityId || null,\n",
)
replace_once(
    'js/military/campaigns.js',
    "  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);\n  const effectiveExternal = externalSupport.personnel * externalSupport.quality;\n  let attackerPower = combatPower(attacker, campaign.personnel + effectiveExternal, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier;\n  attackerPower *= medievalMilitaryCombatMultiplier(attacker, defender, terrain, 'attacker');\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');\n",
    "  const artillery = artilleryCampaignProfile(attacker, campaign.gunpowderArtillery || [], {\n    elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true,\n  });\n  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);\n  const effectiveExternal = externalSupport.personnel * externalSupport.quality;\n  let attackerPower = combatPower(attacker, campaign.personnel + effectiveExternal, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier;\n  attackerPower *= medievalMilitaryCombatMultiplier(attacker, defender, terrain, 'attacker');\n  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * artillery.fortDefenceMultiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');\n",
)
replace_once(
    'js/military/campaigns.js',
    "      returnSiegeTrain(attacker, campaign.siegeEquipment);\n      campaign.completed = true; campaign.phase = 'completed';\n",
    "      returnSiegeTrain(attacker, campaign.siegeEquipment);\n      returnGunpowderSiegeTrain(attacker, campaign.gunpowderArtillery || []);\n      campaign.completed = true; campaign.phase = 'completed';\n",
)

# Persistent fleets: gunpowder becomes shipboard artillery carried by existing ships.
replace_once(
    'js/military/fleets.js',
    "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';\n",
    "import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';\nimport { navalGunCombatProfile } from './earlyModernWarfare.js?v=20260913-early-modern1';\n",
)
replace_once(
    'js/military/fleets.js',
    "export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {\n  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');\n  const attackerPower = fleetCombatPower(attacker, regionsById);\n  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort });\n",
    "export function resolveFleetBattle(attacker, defender, regionsById, rng = Math.random, options = {}) {\n  const defenderInPort = Boolean(options.defenderInPort || defender.locationType === 'port');\n  const attackerOrigin = regionsById.get(attacker.ownerRegionId);\n  const defenderOrigin = regionsById.get(defender.ownerRegionId);\n  const attackerGunnery = attackerOrigin ? navalGunCombatProfile(attackerOrigin, attacker.ships, { consumeSupplies: true }) : { multiplier: 1 };\n  const defenderGunnery = defenderOrigin ? navalGunCombatProfile(defenderOrigin, defender.ships, { consumeSupplies: true }) : { multiplier: 1 };\n  const attackerPower = fleetCombatPower(attacker, regionsById) * attackerGunnery.multiplier;\n  const defenderPower = fleetCombatPower(defender, regionsById, { inPort: defenderInPort }) * defenderGunnery.multiplier;\n",
)
p = Path('js/military/fleets.js')
text = p.read_text()
old_origins = "  const attackerOrigin = regionsById.get(attacker.ownerRegionId);\n  const defenderOrigin = regionsById.get(defender.ownerRegionId);\n  const intensity = (attackerLoss.sunk.length + defenderLoss.sunk.length + attackerCapture.captured.length + defenderCapture.captured.length +\n"
new_origins = "  const intensity = (attackerLoss.sunk.length + defenderLoss.sunk.length + attackerCapture.captured.length + defenderCapture.captured.length +\n"
if old_origins in text:
    p.write_text(text.replace(old_origins, new_origins, 1))
replace_once(
    'js/military/fleets.js',
    "    portDamage,\n    attackerWon: attackerShare > 0.5,\n",
    "    portDamage,\n    attackerGunnery, defenderGunnery,\n    attackerWon: attackerShare > 0.5,\n",
)

# Bandits: portable military technology leaks into irregular hands and makes suppression harder.
replace_once(
    'js/military/banditry.js',
    "import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';\n",
    "import { effectiveInfrastructureCount } from '../economy/construction.js?v=20260905-projects1';\nimport { banditCombatMultiplier } from './earlyModernWarfare.js?v=20260913-early-modern1';\n",
)
replace_once(
    'js/military/banditry.js',
    "    const banditPressure = totalLocal > 0 ? banditPop / totalLocal : 0;\n\n    // Diminishing-returns defense: army power matters a lot at first, less\n",
    "    const banditPressure = totalLocal > 0 ? banditPop / totalLocal : 0;\n    const banditTechnologyMultiplier = banditCombatMultiplier(region);\n    const effectiveBanditPop = banditPop * banditTechnologyMultiplier;\n    const effectiveBanditPressure = region.population + effectiveBanditPop > 0 ? effectiveBanditPop / (region.population + effectiveBanditPop) : 0;\n\n    // Diminishing-returns defense: army power matters a lot at first, less\n",
)
replace_once(
    'js/military/banditry.js',
    "    region.safetyRating = clamp01(1 - banditPressure * (1 - armyDefense));\n",
    "    region.safetyRating = clamp01(1 - effectiveBanditPressure * (1 - armyDefense));\n",
)
replace_once(
    'js/military/banditry.js',
    "    const suppressionRate = power > 0 ? power / (power + banditPop + 1) : 0;\n",
    "    const suppressionRate = power > 0 ? power / (power + effectiveBanditPop + 1) : 0;\n",
)
replace_once(
    'js/military/banditry.js',
    "    const severity = banditPressure * (1 - region.safetyRating);\n",
    "    const severity = effectiveBanditPressure * (1 - region.safetyRating);\n",
)
replace_once(
    'js/military/banditry.js',
    "      defensivePosture: policy.defensivePosture, raiderTreatment: policy.raiderTreatment,\n",
    "      defensivePosture: policy.defensivePosture, raiderTreatment: policy.raiderTreatment, banditTechnologyMultiplier,\n",
)

# Pirate havens use the technology they have actually diffused from host regions.
replace_once(
    'js/politics/nonStateInteractions.js',
    "  const piratePower = Math.max(50, Number(organisation.militaryCapacity) || 0);\n",
    "  const piratePower = Math.max(50, Number(organisation.militaryCapacity) || 0) * Math.max(1, Number(organisation.militaryTechnologyMultiplier) || 1);\n",
)

# World loop: produce artillery/naval guns and diffuse portable technology to irregular actors.
replace_once(
    'js/main.js',
    "import { tickGunpowderIndustry } from './military/firearms.js?v=20260912-gunpowder1';\n",
    "import { tickGunpowderIndustry } from './military/firearms.js?v=20260912-gunpowder1';\nimport { tickEarlyModernIndustry, tickIrregularTechnology } from './military/earlyModernWarfare.js?v=20260913-early-modern1';\n",
)
replace_once(
    'js/main.js',
    "    profiler.measure('Gunpowder industry', () => tickGunpowderIndustry(regions, time.elapsedDays));\n",
    "    profiler.measure('Gunpowder industry', () => tickGunpowderIndustry(regions, time.elapsedDays));\n    profiler.measure('Early-modern military industry', () => tickEarlyModernIndustry(regions, time.elapsedDays));\n",
)
replace_once(
    'js/main.js',
    "    const organisationInteractionEvents = profiler.measure('Organisation relations', () => tickOrganisationInteractions(regions, polities, religiousWorld, time.elapsedDays));\n    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));\n",
    "    const organisationInteractionEvents = profiler.measure('Organisation relations', () => tickOrganisationInteractions(regions, polities, religiousWorld, time.elapsedDays));\n    profiler.measure('Irregular technology', () => tickIrregularTechnology(regions, religiousWorld, time.elapsedDays, Math.random));\n    profiler.measure('Banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));\n",
)

print('Early-modern military transition integration applied')
