from pathlib import Path

def patch(path, replacements):
    p=Path(path); text=p.read_text()
    for old,new in replacements:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing in {path}: {old[:120]!r}')
        text=text.replace(old,new,1)
    p.write_text(text)

patch('js/military/aviation.js',[
("import { airDefenceEngagementRisk, tickAirDefenceIndustry, tickAntiAircraftBreakthrough } from './preDigitalAirNaval.js?v=20260919-aa-naval1';\n",
 "import { airDefenceEngagementRisk, tickAirDefenceIndustry, tickAntiAircraftBreakthrough } from './preDigitalAirNaval.js?v=20260919-aa-naval1';\nimport { assignAircraftCrew, aircraftCrewReadiness, recordAircraftCrewPractice, resolveAircraftCrewLoss, tickAirPersonnel, qualifiedPersonnelSummary } from './qualifiedPersonnel.js?v=20260919-personnel1';\n"),
("export function serviceableAircraft(region,{ownerType=null,mission=null}={}){\n  return ensureAviation(region).aircraft.filter(a=>a.status!=='destroyed'&&(a.condition??1)>=0.42&&(a.fuel??0)>0.08&&(!ownerType||a.ownerType===ownerType)&&(!mission||a.mission===mission));\n}",
 "export function serviceableAircraft(region,{ownerType=null,mission=null}={}){\n  return ensureAviation(region).aircraft.filter(a=>a.status!=='destroyed'&&(a.condition??1)>=0.42&&(a.fuel??0)>0.08&&(a.ownerType!=='military'||aircraftCrewReadiness(a)>=.35)&&(!ownerType||a.ownerType===ownerType)&&(!mission||a.mission===mission));\n}"),
("  ensureAviation(region).aircraft.push(aircraft); return aircraft;\n}",
 "  ensureAviation(region).aircraft.push(aircraft); if(ownerType==='military')assignAircraftCrew(region,aircraft); return aircraft;\n}"),
("export function assignAircraftMission(region,aircraftId,mission,targetRegionId=null){\n  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId); if(!a||a.status==='destroyed'||a.condition<.42)return{assigned:false,reason:'unserviceable'};",
 "export function assignAircraftMission(region,aircraftId,mission,targetRegionId=null){\n  const a=ensureAviation(region).aircraft.find(x=>x.id===aircraftId); if(!a||a.status==='destroyed'||a.condition<.42)return{assigned:false,reason:'unserviceable'};\n  if(a.ownerType==='military'&&aircraftCrewReadiness(a)<.35)return{assigned:false,reason:'no_qualified_aircrew'};"),
("    const av=ensureAviation(region);\n    for(const a of av.aircraft){",
 "    const av=ensureAviation(region);tickAirPersonnel(region,av.aircraft,elapsedDays);\n    for(const a of av.aircraft){"),
("      region.stockpile.aviation_fuel-=need;a.fuel=clamp((a.fuel||1)-need*.15);a.totalFlights++;a.pilotExperience=clamp((a.pilotExperience||0)+.004,0,1);av.flightExperience+=1;\n      const risk=airDefenceRisk(target,a); if(rng()<risk){const reliability=clamp(a.designStats?.reliability||0),damage=(.18+rng()*.62)*(1-reliability*.22);const status=damageAircraft(a,damage);events.push({type:status==='destroyed'?'aircraft_shot_down':'aircraft_damaged',aircraftId:a.id,targetRegionId:target.id,damage});}",
 "      region.stockpile.aviation_fuel-=need;a.fuel=clamp((a.fuel||1)-need*.15);a.totalFlights++;recordAircraftCrewPractice(a,1);av.flightExperience+=1;\n      const crewReadiness=aircraftCrewReadiness(a),risk=clamp(airDefenceRisk(target,a)*(1.12-.12*crewReadiness)); if(rng()<risk){const reliability=clamp(a.designStats?.reliability||0),damage=(.18+rng()*.62)*(1-reliability*.22);const status=damageAircraft(a,damage);if(status==='destroyed')resolveAircraftCrewLoss(region,a,{rng});events.push({type:status==='destroyed'?'aircraft_shot_down':'aircraft_damaged',aircraftId:a.id,targetRegionId:target.id,damage});}"),
("      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.SCOUT){const nav=clamp(a.designStats?.radioNavigation||0),range=clamp(a.designStats?.range||0);region.airRecon ||= {};region.airRecon[target.id]={observedTick:currentTick,confidence:clamp(.35+a.pilotExperience*.30+a.condition*.20+nav*.10+range*.05)};events.push({type:'aerial_reconnaissance',aircraftId:a.id,targetRegionId:target.id});}",
 "      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.SCOUT){const nav=clamp(a.designStats?.radioNavigation||0),range=clamp(a.designStats?.range||0),crew=aircraftCrewReadiness(a);region.airRecon ||= {};region.airRecon[target.id]={observedTick:currentTick,confidence:clamp((.35+a.pilotExperience*.30+a.condition*.20+nav*.10+range*.05)*(.72+.28*crew))};events.push({type:'aerial_reconnaissance',aircraftId:a.id,targetRegionId:target.id});}"),
("      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.ATTACK&&has(region,AERIAL_BOMBING_TECH_ID)){const payload=clamp(a.designStats?.payload??.18),firepower=clamp(a.designStats?.firepower??.15);target.warDamage ||= {infrastructureDamage:0,bombardmentWeeks:0};target.warDamage.infrastructureDamage+=.006*a.condition*(.45+payload*1.6+firepower*.35);events.push({type:'aerial_attack',aircraftId:a.id,targetRegionId:target.id,payload});}",
 "      if(a.status!=='destroyed'&&a.mission===AIR_MISSIONS.ATTACK&&has(region,AERIAL_BOMBING_TECH_ID)){const payload=clamp(a.designStats?.payload??.18),firepower=clamp(a.designStats?.firepower??.15),crew=aircraftCrewReadiness(a);target.warDamage ||= {infrastructureDamage:0,bombardmentWeeks:0};target.warDamage.infrastructureDamage+=.006*a.condition*(.45+payload*1.6+firepower*.35)*(.68+.32*crew);events.push({type:'aerial_attack',aircraftId:a.id,targetRegionId:target.id,payload});}"),
("  if(lost){damageAircraft(a,.55+rng()*.55);return;}",
 "  if(lost){const status=damageAircraft(a,.55+rng()*.55);if(status==='destroyed')resolveAircraftCrewLoss(origin,a,{rng});return;}"),
("  return{total:a.filter(x=>x.status!=='destroyed').length,civilian:a.filter(x=>x.ownerType==='civilian'&&x.status!=='destroyed').length,military:a.filter(x=>x.ownerType==='military'&&x.status!=='destroyed').length,destroyed:a.filter(x=>x.status==='destroyed').length,models:[...models.values()]};",
 "  return{total:a.filter(x=>x.status!=='destroyed').length,civilian:a.filter(x=>x.ownerType==='civilian'&&x.status!=='destroyed').length,military:a.filter(x=>x.ownerType==='military'&&x.status!=='destroyed').length,destroyed:a.filter(x=>x.status==='destroyed').length,models:[...models.values()],personnel:qualifiedPersonnelSummary(region,a,[])};")
])

patch('js/military/navalDamage.js',[
("const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));\n",
 "import { shipCrewReadiness, shipTechnicalReadiness, applyShipCrewCasualties } from './qualifiedPersonnel.js?v=20260919-personnel1';\nconst clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));\n"),
("  ship.damageState.hitLog.push({tick,amount:raw,catastrophic,damaged});if(ship.damageState.hitLog.length>12)ship.damageState.hitLog.splice(0,ship.damageState.hitLog.length-12);",
 "  const crewLost=applyShipCrewCasualties(ship,raw*(catastrophic?1.35:1),{rng});ship.damageState.hitLog.push({tick,amount:raw,catastrophic,damaged,crewLost});if(ship.damageState.hitLog.length>12)ship.damageState.hitLog.splice(0,ship.damageState.hitLog.length-12);"),
("  const pumps=ship.subsystems.pumps?.installed?ship.subsystems.pumps.health:1,control=ship.subsystems.damage_control?.installed?ship.subsystems.damage_control.health:1;\n  const floodControl=clamp(.12+pumps*.58+control*.18),fireControl=clamp(.12+control*.62+(ship.subsystems.electrical?.health??1)*.08);",
 "  const pumps=ship.subsystems.pumps?.installed?ship.subsystems.pumps.health:1,control=ship.subsystems.damage_control?.installed?ship.subsystems.damage_control.health:1,crew=shipCrewReadiness(ship),technical=shipTechnicalReadiness(ship);\n  const floodControl=clamp((.12+pumps*.58+control*.18)*(.62+.22*crew+.16*technical)),fireControl=clamp((.12+control*.62+(ship.subsystems.electrical?.health??1)*.08)*(.62+.22*crew+.16*technical));"),
("  return clamp(.08+prop*.68+steer*.24,.05,1);",
 "  return clamp((.08+prop*.68+steer*.24)*(.72+.28*shipTechnicalReadiness(ship)),.05,1);"),
("  return clamp((p*.55+s*.15+fc*.20+e*.06+radar*.04)*disabled,.03,1);",
 "  return clamp((p*.55+s*.15+fc*.20+e*.06+radar*.04)*disabled*(.62+.38*shipCrewReadiness(ship)),.03,1);"),
("  return clamp(sensor*(.55+fc*.25+e*.20));",
 "  return clamp(sensor*(.55+fc*.25+e*.20)*(.65+.35*shipCrewReadiness(ship)));"),
])

patch('js/military/fleets.js',[
("import { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, shipSensorMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';\n",
 "import { initialiseShipDamage, applyShipHit, tickShipDamageAtSea, shipPropulsionMultiplier, shipCombatMultiplier, shipSensorMultiplier, repairShipDamage, attemptFleetSalvage, fleetTowSpeedMultiplier } from './navalDamage.js?v=20260919-damage1';\nimport { assignShipCrew, tickNavalPersonnel, recordShipCrewPractice } from './qualifiedPersonnel.js?v=20260919-personnel1';\n"),
("  return initialiseShipDamage({\n    id: `ship-${nextShipId++}`,",
 "  const ship=initialiseShipDamage({\n    id: `ship-${nextShipId++}`,"),
("    ...overrides,\n  });\n}\n\nfunction fleetCoalCapacity",
 "    crewRequired:generation?.stats?.crew||spec.crew||12,\n    ...overrides,\n  });\n  if(region)assignShipCrew(region,ship);return ship;\n}\n\nfunction fleetCoalCapacity"),
("  if (existing.length) {\n    for (const fleet of existing) ensureFleetState(fleet);\n    syncNextFleetIds(existing);\n    return existing;\n  }",
 "  if (existing.length) {\n    for (const fleet of existing) ensureFleetState(fleet);\n    for(const region of regions){const owned=existing.filter(f=>f.ownerRegionId===region.id);if(owned.length)tickNavalPersonnel(region,owned,0);}\n    syncNextFleetIds(existing);\n    return existing;\n  }"),
("    serviceNavalModelDiversity(region,owned,weeks);\n    const procurement = ensureNavalProcurement(region);",
 "    serviceNavalModelDiversity(region,owned,weeks);tickNavalPersonnel(region,owned,weeks);\n    const procurement = ensureNavalProcurement(region);"),
("  for (const ship of fleet.ships) tickShipDamageAtSea(ship, weeks);",
 "  for (const ship of fleet.ships){tickShipDamageAtSea(ship,weeks);recordShipCrewPractice(ship,weeks,{combat:false});}"),
])
print('qualified personnel integration applied')
