from pathlib import Path


def apply(path, replacements):
    p=Path(path); text=p.read_text(); changed=False
    for old,new in replacements:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing pattern in {path}: {old[:120]!r}')
        text=text.replace(old,new,1); changed=True
    if changed: p.write_text(text)

apply('js/military/modernTactics.js', [
("  role = 'attacker', casualtyShare = 0, intensity = 0, weeksEngaged = 0, currentTick = 0,\n} = {}) {",
 "  role = 'attacker', casualtyShare = 0, opponentCasualtyShare = 0, intensity = 0, weeksEngaged = 0, currentTick = 0,\n} = {}) {"),
("  const losses = clamp(casualtyShare);\n  const battleIntensity = clamp(intensity / 0.06);",
 "  const losses = clamp(casualtyShare);\n  const enemyLosses = clamp(opponentCasualtyShare);\n  const battleIntensity = clamp(intensity / 0.06);"),
("  if (role === 'defender' && ownMg) {\n    const learning = (0.008 + battleIntensity * 0.011 + losses * 0.025) * (0.72 + institution * 0.45);",
 "  if (role === 'defender' && ownMg) {\n    const learning = (0.008 + battleIntensity * 0.011 + losses * 0.025 + enemyLosses * 0.018) * (0.72 + institution * 0.45);"),
("    state.suppression = clamp(state.suppression + learning * 0.32 * (1 - state.suppression));\n  }",
 "    state.suppression = clamp(state.suppression + learning * 0.32 * (1 - state.suppression));\n    // Observing an enemy assault fail is itself evidence. Armies can learn what not\n    // to do before paying the same price themselves, especially with strong institutions.\n    const observedFailure = enemyLosses * (0.45 + battleIntensity * 0.35) * institution;\n    state.lessonsCaptured = clamp(state.lessonsCaptured + observedFailure * 0.10);\n    state.dispersion = clamp(state.dispersion + observedFailure * 0.045 * (1 - state.dispersion));\n    state.fireAndMovement = clamp(state.fireAndMovement + observedFailure * 0.032 * (1 - state.fireAndMovement));\n  }"),
("  state.lessonsCaptured = clamp(state.lessonsCaptured + battleIntensity * institution * 0.012 + losses * institution * 0.025);",
 "  state.lessonsCaptured = clamp(state.lessonsCaptured + battleIntensity * institution * 0.012 + losses * institution * 0.025 + enemyLosses * institution * 0.012);")
])

apply('js/military/campaigns.js', [
("import { modernTacticalProfile, recordModernCombatLessons } from './modernTactics.js?v=20260919-mg-tactics1';",
 "import { modernTacticalProfile, recordModernCombatLessons } from './modernTactics.js?v=20260919-mg-tactics1';\nimport { artilleryFireControlProfile, recordArtilleryFireControlLessons, resolveArtilleryTargeting } from './artilleryFireControl.js?v=20260919-artillery1';"),
("  const modernArtillery = modernArtilleryProfile(attacker, artillery, { elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });\n  const trenchDefence",
 "  const modernArtillery = modernArtilleryProfile(attacker, artillery, { elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });\n  const artilleryFireControl = artilleryFireControlProfile(attacker, defender, { currentTick, weeksEngaged: campaign.weeksEngaged });\n  const artilleryTargeting = resolveArtilleryTargeting(attacker, defender, artilleryFireControl, { bombardment: modernArtillery.bombardment, rng, currentTick });\n  const trenchDefence"),
("* attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * attackerTactics.combatMultiplier;",
 "* attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * artilleryFireControl.combatMultiplier * attackerTactics.combatMultiplier;"),
("defenderTactics.combatMultiplier * defenderTactics.defensiveMultiplier * medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');",
 "defenderTactics.combatMultiplier * defenderTactics.defensiveMultiplier * artilleryTargeting.commandMultiplier * artilleryTargeting.logisticsMultiplier * medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');"),
("recordModernCombatLessons(attacker, defender, { role: 'attacker', casualtyShare: attackerLosses / Math.max(1, campaign.initialPersonnel), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });",
 "recordModernCombatLessons(attacker, defender, { role: 'attacker', casualtyShare: attackerLosses / Math.max(1, campaign.initialPersonnel), opponentCasualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });"),
("recordModernCombatLessons(defender, attacker, { role: 'defender', casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });",
 "recordModernCombatLessons(defender, attacker, { role: 'defender', casualtyShare: (defenderLosses + militiaLosses) / Math.max(1, defender.army.personnel + defenderLosses + campaign.militia + militiaLosses), opponentCasualtyShare: attackerLosses / Math.max(1, campaign.initialPersonnel), intensity, weeksEngaged: campaign.weeksEngaged, currentTick });\n  recordArtilleryFireControlLessons(attacker, defender, { currentTick, intensity, bombardment: modernArtillery.bombardment, enemyArtillery: defender.earlyModernMilitary?.artillery?.inventory?.length || 0 });"),
("attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, trenchDefence, bombardment };",
 "attackerFirearms, defenderFirearms, attackerModern, defenderModern, attackerTactics, defenderTactics, modernArtillery, artilleryFireControl, artilleryTargeting, trenchDefence, bombardment };")
])

apply('js/main.js', [
("import { tickModernTactics } from './military/modernTactics.js?v=20260919-mg-tactics1';",
 "import { tickModernTactics } from './military/modernTactics.js?v=20260919-mg-tactics1';\nimport { tickArtilleryFireControl } from './military/artilleryFireControl.js?v=20260919-artillery1';"),
("    profiler.measure('Modern tactical adaptation', () => tickModernTactics(regions, time.elapsedDays));",
 "    profiler.measure('Modern tactical adaptation', () => tickModernTactics(regions, time.elapsedDays));\n    profiler.measure('Artillery fire control', () => tickArtilleryFireControl(regions, time.elapsedDays));")
])
print('artillery fire-control integration applied')
