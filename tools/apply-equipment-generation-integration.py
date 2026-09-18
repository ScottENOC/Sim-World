from pathlib import Path

def apply(path,repls):
    p=Path(path); text=p.read_text(); changed=False
    for old,new in repls:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing in {path}: {old[:100]!r}')
        text=text.replace(old,new,1); changed=True
    if changed:p.write_text(text)

apply('js/military/earlyModernWarfare.js',[
("import { navalGunTechnologyMultiplier, NAVAL_GUN_TYPES } from '../technology/industrialMarine.js?v=20260916-steam1';",
 "import { navalGunTechnologyMultiplier, NAVAL_GUN_TYPES } from '../technology/industrialMarine.js?v=20260916-steam1';\nimport { backfillArtilleryDesign, ensureCurrentArtilleryDesign, materialDesignAdjustment, stampEquipment } from './equipmentGenerations.js?v=20260919-equipment1';"),
("  state.artillery.readiness = clamp(state.artillery.readiness);",
 "  state.artillery.readiness = clamp(state.artillery.readiness);\n  for (const gun of [...state.artillery.inventory, ...state.artillery.away]) backfillArtilleryDesign(region, gun);"),
("  ensureEarlyModernMilitary(region).artillery.inventory.push({ kind, metal: dominantMaterial(metal), condition: 1 });",
 "  const material = dominantMaterial(metal);\n  const design = ensureCurrentArtilleryDesign(region, kind);\n  const gun = stampEquipment({ kind, metal: material, condition: 1 }, design);\n  gun.designStats = materialDesignAdjustment(gun.designStats, material);\n  ensureEarlyModernMilitary(region).artillery.inventory.push(gun);"),
("    const firearmsReadiness = clamp(region.firearms?.readiness || 0.05);",
 "    const firearmsReadiness = clamp(region.firearms?.readiness || 0.05);\n    ensureCurrentArtilleryDesign(region, 'field_cannon');\n    if (hasTech(region, 'heavy_howitzers')) ensureCurrentArtilleryDesign(region, 'bombard');"),
("    weight += spec.siege * materialQuality(gun.metal) * clamp(gun.condition ?? 1, 0.2, 1);",
 "    const design = gun.designStats || {};\n    const designEffect = 0.72 + clamp(design.firepower ?? 0.35) * 0.34 + clamp(design.reliability ?? 0.55) * 0.16 + clamp(design.rateOfFire ?? 0.2) * 0.20;\n    weight += spec.siege * materialQuality(gun.metal) * designEffect * clamp(gun.condition ?? 1, 0.2, 1);"),
("    suppliedFraction, powderUsed, shotUsed, guns: train.length,",
 "    suppliedFraction, powderUsed, shotUsed, guns: train.length,\n    models: Object.entries(train.reduce((m,g)=>(m[g.modelName||'Uncatalogued gun']=(m[g.modelName||'Uncatalogued gun']||0)+1,m),{})).map(([name,count])=>({name,count})),")
])

apply('js/military/artilleryFireControl.js',[
("export function artilleryFireControlProfile(region,defender,{currentTick=null,weeksEngaged=0}={}){",
 "export function artilleryFireControlProfile(region,defender,{currentTick=null,weeksEngaged=0,train=[]}={}){"),
("  const baseRangeKm=heavy?12:quick?8:6;",
 "  const designed=(train||[]).filter(g=>g?.designStats);\n  const avg=(key,fallback)=>designed.length?designed.reduce((sum,g)=>sum+(Number(g.designStats?.[key])||fallback),0)/designed.length:fallback;\n  // Physical gun design sets the range/accuracy ceiling. Better doctrine cannot turn\n  // a 1914 tube into a later-generation weapon; it only exploits what the hardware can do.\n  const baseRangeKm=avg('rangeKm',heavy?5.5:quick?4.8:4.0);\n  const intrinsicAccuracy=avg('intrinsicAccuracy',.28);\n  const fireControlPotential=avg('fireControlPotential',.30);"),
("  const rangeMultiplier=1+technique*.42+(heavy?s.predictedFire*.16:0);",
 "  const rangeMultiplier=1+technique*(.18+.24*fireControlPotential)+(heavy?s.predictedFire*.08*fireControlPotential:0);"),
("  const precision=clamp(.10+s.rangeFinding*.18+s.survey*.17+s.fireDirection*.20+s.predictedFire*.20+obs.ground*.12+obs.aerial*(.12+s.aerialObservationIntegration*.10));",
 "  const precision=clamp(intrinsicAccuracy*.46+s.rangeFinding*.13+s.survey*.13+s.fireDirection*.15+s.predictedFire*.14*fireControlPotential+obs.ground*.10+obs.aerial*(.12+s.aerialObservationIntegration*.10));")
])

apply('js/military/campaigns.js',[
("const artilleryFireControl = artilleryFireControlProfile(attacker, defender, { currentTick, weeksEngaged: campaign.weeksEngaged });",
 "const artilleryFireControl = artilleryFireControlProfile(attacker, defender, { currentTick, weeksEngaged: campaign.weeksEngaged, train: campaign.gunpowderArtillery || [] });")
])

apply('js/ui/advisors.js',[
("import { educationAdvisorReport, setMandatoryEducationYears } from '../society/massEducation.js?v=20260914-mass-education1';",
 "import { educationAdvisorReport, setMandatoryEducationYears } from '../society/massEducation.js?v=20260914-mass-education1';\nimport { designCapabilityLabel, equipmentModernitySummary } from '../military/equipmentGenerations.js?v=20260919-equipment1';"),
("    const jointPlans = upcomingPlayerJointOperations(player, this.getAgreements(), Math.floor((this.clock.elapsedDays || 0) / 7));",
 "    const jointPlans = upcomingPlayerJointOperations(player, this.getAgreements(), Math.floor((this.clock.elapsedDays || 0) / 7));\n    const artilleryUnits = [...(player.earlyModernMilitary?.artillery?.inventory || []), ...(player.earlyModernMilitary?.artillery?.away || [])];\n    const artilleryModernity = equipmentModernitySummary(player, artilleryUnits);"),
("      ${section('Active conflicts', campaigns.length",
 "      ${artilleryModernity.total ? section('Equipment generations',\n        row('Artillery on current designs', percent(artilleryModernity.currentShare), artilleryModernity.currentShare < .55 ? 'warning' : '') +\n        artilleryModernity.models.map(({design,count}) => row(design.name, `${number(count)} · ${designCapabilityLabel(design)} · ${Number(design.stats?.rangeKm||0).toFixed(1)} km design range`)).join('') +\n        '<p class=\"advisor-note\">New designs affect new production only. Older guns remain in service until replaced or explicitly refitted; tactical doctrine cannot upgrade their physical range, reliability or accuracy ceiling.</p>') : ''}\n      ${section('Active conflicts', campaigns.length")
])
print('equipment-generation integration applied')
