from pathlib import Path

# Propagate polity-level institutional paths into regions for military/economic consumers.
p=Path('js/politics/medievalStateSystems.js'); s=p.read_text()
old="  const s = ensureMedievalSociety(region);\n  const p = polity.institutionalPaths || {};"
assert old in s
s=s.replace(old,"  const s = ensureMedievalSociety(region);\n  const p = polity.institutionalPaths || {};\n  s.paths = { ...p };\n  region._institutionalPaths = s.paths;",1)
p.write_text(s)

# Trade institutions lower friction without replacing currency/quarantine mechanics.
p=Path('js/economy/trade.js'); s=p.read_text()
marker="import { quarantineTradeFriction } from '../society/disease.js?v=20260912-disease1';"
assert marker in s
s=s.replace(marker,marker+"\nimport { medievalTradeFrictionMultiplier } from './medievalCommercialInstitutions.js?v=20260912-medieval2';",1)
old="  return currencyTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB);"
assert old in s
s=s.replace(old,"  return currencyTradeFriction(regionA, regionB) * quarantineTradeFriction(regionA) * quarantineTradeFriction(regionB) *\n    medievalTradeFrictionMultiplier(regionA) * medievalTradeFrictionMultiplier(regionB);",1)
p.write_text(s)

# Campaign combat uses emergent troop composition and fortress depth.
p=Path('js/military/campaigns.js'); s=p.read_text()
marker="import { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';"
assert marker in s
s=s.replace(marker,marker+"\nimport { medievalMilitaryCombatMultiplier } from './medievalDoctrine.js?v=20260912-medieval2';",1)
old="  let attackerPower = combatPower(attacker, campaign.personnel + effectiveExternal, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier;"
assert old in s
s=s.replace(old,old+"\n  attackerPower *= medievalMilitaryCombatMultiplier(attacker, defender, terrain, 'attacker');",1)
old="  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier;"
assert old in s
s=s.replace(old,"  const defenderArmyPower = combatPower(defender, defender.army.personnel, toolTypes, 'defender', 1,\n    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');",1)
p.write_text(s)

# Main scheduler and player events.
p=Path('js/main.js'); s=p.read_text()
marker="import { tickMedievalInstitutions } from './politics/medievalInstitutions.js?v=20260912-medieval-politics1';"
assert marker in s
s=s.replace(marker,marker+"\nimport { tickMedievalStateSystems } from './politics/medievalStateSystems.js?v=20260912-medieval2';\nimport { tickMedievalCommercialInstitutions } from './economy/medievalCommercialInstitutions.js?v=20260912-medieval2';\nimport { tickMedievalDoctrine } from './military/medievalDoctrine.js?v=20260912-medieval2';",1)
marker="import { tickReligiousInstitutions } from './society/religiousInstitutions.js?v=20260912-medieval-politics1';"
assert marker in s
s=s.replace(marker,marker+"\nimport { tickMedievalReligiousPolitics } from './society/medievalReligiousPolitics.js?v=20260912-medieval2';",1)
old="    const medievalPoliticalEvents = profiler.measure('Medieval politics', () => tickMedievalInstitutions(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));"
assert old in s
new=old+"\n    const medievalStateEvents = profiler.measure('Medieval state systems', () => tickMedievalStateSystems(polities, regions, calendarWeek, time.elapsedDays, Math.random));\n    profiler.measure('Medieval commerce', () => tickMedievalCommercialInstitutions(regions, polities, time.elapsedDays));\n    profiler.measure('Medieval doctrine', () => tickMedievalDoctrine(regions, time.elapsedDays));\n    const medievalReligiousEvents = profiler.measure('Religious politics', () => tickMedievalReligiousPolitics(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random));"
s=s.replace(old,new,1)
old="      ...medievalPoliticalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.rebelPolityId === activePlayerPolityId),"
assert old in s
s=s.replace(old,old+"\n      ...medievalStateEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.claimantPolityId === activePlayerPolityId),\n      ...medievalReligiousEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),",1)
p.write_text(s)

# Cache-bust and expose dashboard.
p=Path('index.html'); s=p.read_text()
s=s.replace('js/main.js?v=20260912-organisations1','js/main.js?v=20260912-medieval2')
marker='<script type="module" src="js/ui/nonStateOrganisationsUi.js?v=20260912-pmc1"></script>'
assert marker in s
s=s.replace(marker,marker+'\n  <script type="module" src="js/ui/medievalSystemsUi.js?v=20260912-medieval2"></script>',1)
p.write_text(s)
