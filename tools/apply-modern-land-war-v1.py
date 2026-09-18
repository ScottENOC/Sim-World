from pathlib import Path

# Fix compact ternaries and upgrade artillery ammunition handling in the new module.
p=Path('js/military/modernLandWarfare.js')
t=p.read_text()
for old,new in {
"(breech?.35:0)":"(breech ? .35 : 0)","(magazine?.75:0)":"(magazine ? .75 : 0)","(smokeless?.82:1)":"(smokeless ? .82 : 1)",
"(breech?.08:0)":"(breech ? .08 : 0)","(magazine?.11:0)":"(magazine ? .11 : 0)","(smokeless?.07:0)":"(smokeless ? .07 : 0)",
"(breech?.05:0)":"(breech ? .05 : 0)","(magazine?.08:0)":"(magazine ? .08 : 0)","(smokeless?.05:0)":"(smokeless ? .05 : 0)",
"(magazine?.12:0)":"(magazine ? .12 : 0)","(mg?.22:0)":"(mg ? .22 : 0)",
"(quick?.10:0)":"(quick ? .10 : 0)","(heavy?.05:0)":"(heavy ? .05 : 0)","(breech?.35:0)":"(breech ? .35 : 0)",
"(heavy?.45:0)":"(heavy ? .45 : 0)","(quick?.3:0)":"(quick ? .3 : 0)","(breech?.25:0)":"(breech ? .25 : 0)",
"(smokeless?.12:0)":"(smokeless ? .12 : 0)","(quick?.12:0)":"(quick ? .12 : 0)","(breech?.3:0)":"(breech ? .3 : 0)",
"(quick?.8:0)":"(quick ? .8 : 0)","(heavy?.35:0)":"(heavy ? .35 : 0)","deliberate?.13:.055":"deliberate ? .13 : .055"
}.items(): t=t.replace(old,new)
# Replace modernArtilleryProfile with ammunition-limited version.
start=t.index('export function modernArtilleryProfile')
end=t.index('\nconst CONSTRUCTION_TARGETS',start)
replacement="""export function modernArtilleryProfile(region,baseProfile={}, {elapsedDays=7,logisticsSupply=1,consumeSupplies=true}={}){\n const baseSupplied=clamp(baseProfile.suppliedFraction||0),guns=Math.max(0,baseProfile.guns||0);\n if(!guns||!baseSupplied)return{combatMultiplier:1,bombardment:0,precision:0,ammoMultiplier:1,ammoSupply:1,powderUsed:0,shotUsed:0};\n const breech=has(region,BREECH_ARTILLERY_TECH_ID),quick=has(region,QUICK_FIRE_ARTILLERY_TECH_ID),heavy=has(region,HEAVY_HOWITZER_TECH_ID),smokeless=has(region,SMOKELESS_POWDER_TECH_ID);\n const ammoMultiplier=1+(breech ? .3 : 0)+(quick ? .8 : 0)+(heavy ? .35 : 0);\n const weeks=Math.max(.1,elapsedDays/7);\n const extraFactor=Math.max(0,ammoMultiplier-1);\n const powderNeed=guns*.06*extraFactor*weeks*(smokeless ? .86 : 1);\n const shotNeed=guns*.022*extraFactor*weeks;\n const ammoSupply=Math.min(clamp(logisticsSupply),powderNeed>0?clamp((region.stockpile?.gunpowder||0)/powderNeed):1,shotNeed>0?clamp(availableShotMetal(region)/shotNeed):1);\n let powderUsed=0,shotUsed=0;if(consumeSupplies&&ammoSupply>0){powderUsed=powderNeed*ammoSupply;shotUsed=shotNeed*ammoSupply;region.stockpile.gunpowder=Math.max(0,(region.stockpile.gunpowder||0)-powderUsed);consumeShotMetal(region,shotUsed);}\n const supplied=baseSupplied*ammoSupply;\n const combat=1+supplied*((breech ? .05 : 0)+(quick ? .10 : 0)+(heavy ? .05 : 0));\n const bombardment=clamp(supplied*(breech ? .35 : 0)*(1+(heavy ? .45 : 0)+(quick ? .3 : 0)),0,1);\n const precision=clamp((breech ? .25 : 0)+(smokeless ? .12 : 0)+(quick ? .12 : 0));\n return{combatMultiplier:combat,bombardment,precision,ammoMultiplier,ammoSupply,powderUsed,shotUsed,breech,quick,heavy};\n}\n"""
t=t[:start]+replacement+t[end:]
p.write_text(t)

# Add modern breakthrough tick to the normal technology pipeline.
p=Path('js/technology/breakthroughs.js'); t=p.read_text()
imp="import { tickModernLandBreakthroughs } from '../military/modernLandWarfare.js?v=20260918-modern-war1';\n"
anchor="import { tickTelephoneBreakthroughs } from './telephone.js?v=20260918-telephone1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('breakthrough import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
call="  events.push(...tickModernLandBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
anchor2="  events.push(...tickTelephoneBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
if call not in t:
    if anchor2 not in t: raise RuntimeError('breakthrough call anchor missing')
    t=t.replace(anchor2,anchor2+call,1)
p.write_text(t)

# Integrate modern firepower, trenches and ranged infrastructure bombardment into campaigns.
p=Path('js/military/campaigns.js'); t=p.read_text()
imp="import { bombardRegionalInfrastructure, entrenchmentDefenceMultiplier, modernArtilleryProfile, modernInfantryProfile } from './modernLandWarfare.js?v=20260918-modern-war1';\n"
anchor="import { telephoneMobilisationMultiplier } from '../economy/localCommunications.js?v=20260918-telephone2';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('campaign import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
old="""  const artillery = artilleryCampaignProfile(attacker, campaign.gunpowderArtillery || [], {\n    elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true,\n  });\n"""
new=old+"""  const attackerModern = modernInfantryProfile(attacker, campaign.personnel, attackerFirearms, { role: 'attacker', elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });\n  const defenderModern = modernInfantryProfile(defender, defender.army.personnel, defenderFirearms, { role: 'defender', elapsedDays: 7, logisticsSupply: 1, consumeSupplies: true });\n  const modernArtillery = modernArtilleryProfile(attacker, artillery, { elapsedDays: 7, logisticsSupply: campaign.supply, consumeSupplies: true });\n  const trenchDefence = entrenchmentDefenceMultiplier(defender, campaign.weeksEngaged);\n"""
if 'const attackerModern = modernInfantryProfile' not in t:
    if old not in t: raise RuntimeError('artillery profile anchor missing')
    t=t.replace(old,new,1)
oldp="""    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier;\n"""
newp="""    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier;\n"""
if newp not in t:
    if oldp not in t: raise RuntimeError('attacker power anchor missing')
    t=t.replace(oldp,newp,1)
oldp2="""    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * artillery.fortDefenceMultiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');\n"""
newp2="""    campaign.defenderMorale, campaign.siegeEquipment, terrain) * defenderFirearms.multiplier * defenderModern.multiplier * defenderModern.defenceMultiplier * trenchDefence * artillery.fortDefenceMultiplier *\n    medievalMilitaryCombatMultiplier(defender, attacker, terrain, 'defender');\n"""
if newp2 not in t:
    if oldp2 not in t: raise RuntimeError('defender power anchor missing')
    t=t.replace(oldp2,newp2,1)
oldint="""  const intensity = baseIntensity * counterLogistics.intensityMultiplier;\n"""
newint="""  const intensity = baseIntensity * counterLogistics.intensityMultiplier * Math.max(attackerModern.intensityMultiplier, defenderModern.intensityMultiplier);\n"""
if newint not in t:
    if oldint not in t: raise RuntimeError('intensity anchor missing')
    t=t.replace(oldint,newint,1)
oldcivil="""  const civilianDeaths = applyCivilianDamage(campaign, defender, Math.max(0, pressureDelta), attackerShare);\n  defender.conflictPressure = campaign.pressure;\n"""
newcivil="""  const civilianDeaths = applyCivilianDamage(campaign, defender, Math.max(0, pressureDelta), attackerShare);\n  const bombardment = bombardRegionalInfrastructure(attacker, defender, polities, artillery, { objective: campaign.objective, rng, currentTick });\n  defender.conflictPressure = campaign.pressure;\n"""
if 'const bombardment = bombardRegionalInfrastructure' not in t:
    if oldcivil not in t: raise RuntimeError('civilian damage anchor missing')
    t=t.replace(oldcivil,newcivil,1)
oldweek="""    attackerFirearms, defenderFirearms };\n"""
newweek="""    attackerFirearms, defenderFirearms, attackerModern, defenderModern, modernArtillery, trenchDefence, bombardment };\n"""
if newweek not in t:
    if oldweek not in t: raise RuntimeError('week history anchor missing')
    t=t.replace(oldweek,newweek,1)
p.write_text(t)
print('modern land warfare integration applied')

# trigger
