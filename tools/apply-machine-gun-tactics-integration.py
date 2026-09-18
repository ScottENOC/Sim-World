from pathlib import Path

campaigns = Path('js/military/campaigns.js')
text = campaigns.read_text()
replacements = [
    (
        "import { bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile, modernInfantryProfile } from './modernLandWarfare.js?v=20260918-modern-war1';",
        "import { bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile, modernInfantryProfile } from './modernLandWarfare.js?v=20260918-modern-war1';\nimport { modernTacticalProfile, recordModernCombatLessons } from './modernTactics.js?v=20260919-mg-tactics1';",
    ),
    (
        "  const trenchDefence = entrenchmentDefenceMultiplier(defender, campaign.weeksEngaged);\n  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);",
        "  const trenchDefence = entrenchmentDefenceMultiplier(defender, campaign.weeksEngaged);\n  const attackerTactics = modernTacticalProfile(attacker, defender, { role: 'attacker', weeksEngaged: campaign.weeksEngaged, terrain });\n  const defenderTactics = modernTacticalProfile(defender, attacker, { role: 'defender', weeksEngaged: campaign.weeksEngaged, terrain });\n  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);",
    ),
    (
        "campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier;",
        "campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * attackerTactics.combatMultiplier;",
    ),
    (
        "campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * defenderModern.multiplier * defenderModern.defenceMultiplier * trenchDefence * artillery.fortDefenceMultiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');",
        "campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * defenderModern.multiplier * defenderModern.defenceMultiplier * trenchDefence * artillery.fortDefenceMultiplier *\n    defenderTactics.combatMultiplier * defenderTactics.defensiveMultiplier * medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');",
    ),
    (
        "Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * desperation.casualtyMultiplier * variance()));",
        "Math.round(campaign.personnel * intensity * (1 - attackerShare) * 1.55 * desperation.casualtyMultiplier * attackerTactics.casualtyMultiplier * variance()));",
    ),
    (
        "  recordCombatExperience(defender, currentTick, {\n    intensity,\n    casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses),\n    defender: true,\n  });\n\n  const lossShock",
        "  recordCombatExperience(defender, currentTick, {\n    intensity,\n    casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses),\n    defender: true,\n  });\n  recordModernCombatLessons(attacker, defender, { role: 'attacker', casualtyShare: attackerLosses / Math.max(1, campaign.initialPersonnel), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });\n  recordModernCombatLessons(defender, attacker, { role: 'defender', casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });\n\n  const lossShock",
    ),
    (
        "    attackerFirearms, defenderFirearms, attackerModern, defenderModern, modernArtillery, trenchDefence, bombardment };",
        "    attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, trenchDefence, bombardment };",
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing campaigns integration pattern: {old[:140]!r}')
    text = text.replace(old, new, 1)
campaigns.write_text(text)

main = Path('js/main.js')
text = main.read_text()
replacements = [
    (
        "import { tickMedievalDoctrine } from './military/medievalDoctrine.js?v=20260912-medieval2';",
        "import { tickMedievalDoctrine } from './military/medievalDoctrine.js?v=20260912-medieval2';\nimport { tickModernTactics } from './military/modernTactics.js?v=20260919-mg-tactics1';",
    ),
    (
        "    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));",
        "    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n    profiler.measure('Modern tactical adaptation', () => tickModernTactics(regions, time.elapsedDays));",
    ),
]
for old, new in replacements:
    if old not in text:
        raise SystemExit(f'missing main integration pattern: {old[:140]!r}')
    text = text.replace(old, new, 1)
main.write_text(text)

modern = Path('js/military/modernTactics.js')
text = modern.read_text()
old = "defensiveMultiplier = 1 + preparation * (0.34 + state.defensiveFireDiscipline * 0.18);"
new = "defensiveMultiplier = 1 + preparation * (0.40 + state.defensiveFireDiscipline * 0.18);"
if old not in text:
    raise SystemExit('missing prepared-defence calibration pattern')
modern.write_text(text.replace(old, new, 1))
print('machine-gun tactical revolution integration applied')
