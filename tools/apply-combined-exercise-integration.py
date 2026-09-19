from pathlib import Path

def patch(path,replacements):
    p=Path(path);text=p.read_text()
    for old,new in replacements:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing anchor in {path}: {old[:120]!r}')
        text=text.replace(old,new,1)
    p.write_text(text)

patch('js/military/combinedExercises.js',[
("export function eligibleExerciseAllies(organiser,regions,agreements=[]){return (regions||[]).filter(r=>r.id!==organiser?.id&&areExerciseAllies(organiser,r,agreements));}",
 "export function eligibleExerciseAllies(organiser,regions,agreements=[]){const own=actorId(organiser);const seen=new Set();return (regions||[]).filter(r=>r.id!==organiser?.id&&actorId(r)!==own&&areExerciseAllies(organiser,r,agreements)).filter(r=>{const id=actorId(r);if(!id||seen.has(id))return false;seen.add(id);return true;});}"),
("  const id=`exercise-${nextExerciseId++}`,exercise={id,organiserRegionId:organiser.id,hostRegionId:host.id,missionType:mission.id,startTick:currentTick,durationWeeks:Math.max(2,Math.min(52,Number(durationWeeks)||12)),elapsedWeeks:0,scale:clamp(scale,.05,.5),active:true,participants:[],lastDiplomaticTick:null};",
 "  const existing=new Set([...(regions||[]),...(seaRegions||[])].flatMap(r=>(r.combinedExercises||[]).map(x=>x.id)));let id;do{id=`exercise-${currentTick}-${organiser.id}-${nextExerciseId++}`;}while(existing.has(id));const exercise={id,organiserRegionId:organiser.id,hostRegionId:host.id,missionType:mission.id,startTick:currentTick,durationWeeks:Math.max(2,Math.min(52,Number(durationWeeks)||12)),elapsedWeeks:0,scale:clamp(scale,.05,.5),active:true,participants:[],lastDiplomaticTick:null};"),
("  for(const r of participants)exercise.participants.push(participantCommitment(r,host,mission,exercise.scale,fleets,id));\n  host.combinedExercises ||= [];host.combinedExercises.push(exercise);\n  return{started:true,exercise};",
 "  for(const r of participants){const p=participantCommitment(r,host,mission,exercise.scale,fleets,id);if(p.landPersonnel>0||(p.shipIds?.length||0)>0)exercise.participants.push(p);}\n  if(exercise.participants.length<2){for(const p of exercise.participants)releaseCommitment(byId.get(p.regionId),p,fleets);return{started:false,reason:'insufficient_deployable_forces'};}\n  host.combinedExercises ||= [];host.combinedExercises.push(exercise);\n  return{started:true,exercise};")
])

patch('js/military/navalDamage.js',[
("export function shipCombatMultiplier(ship){\n  initialiseShipDamage(ship);if(ship.damageState.sinking)return 0;",
 "export function shipCombatMultiplier(ship){\n  initialiseShipDamage(ship);if(ship.damageState.sinking||ship.exerciseDeploymentId)return 0;")
])

patch('js/military/campaigns.js',[
("import { resolveMilitaryCasualties } from '../technology/medicalProgress.js?v=20260918-medical1';\n",
 "import { resolveMilitaryCasualties } from '../technology/medicalProgress.js?v=20260918-medical1';\nimport { alliedCoordinationMultiplier } from './combinedExercises.js?v=20260919-exercises1';\n"),
("  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);\n  const effectiveExternal = externalSupport.personnel * externalSupport.quality;\n",
 "  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);\n  const effectiveExternal = externalSupport.personnel * externalSupport.quality;\n  const jointPlan=campaign.jointOperationId?(options.agreements||[]).find(a=>a.id===campaign.jointOperationId&&a.active):null;\n  const jointAllyId=jointPlan?(jointPlan.proposerRegionId===attacker.id?jointPlan.partnerRegionId:jointPlan.proposerRegionId):null;\n  const jointAlly=jointAllyId?regions.find(r=>r.id===jointAllyId):null;\n  const jointCoordination=jointAlly?alliedCoordinationMultiplier(attacker,jointAlly):1;\n"),
("    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * artilleryFireControl.combatMultiplier * attackerTactics.combatMultiplier;",
 "    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier * artillery.combatMultiplier * attackerModern.multiplier * modernArtillery.combatMultiplier * artilleryFireControl.combatMultiplier * attackerTactics.combatMultiplier * jointCoordination;")
])

patch('js/military/playerJointOperationAdvisor.js',[
("import { reviewMilitaryStrategy, setMilitaryStrategy } from './strategicPlanning.js?v=20260908-strategy1';\n",
 "import { reviewMilitaryStrategy, setMilitaryStrategy } from './strategicPlanning.js?v=20260908-strategy1';\nimport { interoperabilityWith } from './combinedExercises.js?v=20260919-exercises1';\n"),
("  const affordability = Number(player.treasury || 0) > promised * 0.15 ? 'acceptable' : 'strained';\n\n  return {",
 "  const affordability = Number(player.treasury || 0) > promised * 0.15 ? 'acceptable' : 'strained';\n  const interoperability=ally?interoperabilityWith(player,ally):0;\n\n  return {"),
("    allyName: ally?.name || 'ally', enemyName: enemy?.name || 'enemy', allySignal, allySummary,\n",
 "    allyName: ally?.name || 'ally', enemyName: enemy?.name || 'enemy', allySignal, allySummary, interoperability,\n"),
("    envoy: `Envoy: ${allySummary}`,\n",
 "    envoy: `Envoy: ${allySummary} Combined-training interoperability is about ${Math.round(interoperability*100)}%.`,\n")
])

patch('js/main.js',[
("import { tickArtilleryFireControl } from './military/artilleryFireControl.js?v=20260919-artillery1';\n",
 "import { tickArtilleryFireControl } from './military/artilleryFireControl.js?v=20260919-artillery1';\nimport { combinedExerciseSummary, eligibleExerciseAllies, startCombinedExercise, tickCombinedExercises } from './military/combinedExercises.js?v=20260919-exercises1';\nimport { renderCombinedExerciseControls } from './ui/combinedExercisesUi.js?v=20260919-exercises1';\n"),
("    const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets, nonStateWorld: religiousWorld }));",
 "    const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets, agreements, nonStateWorld: religiousWorld }));"),
("    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, diplomacyElapsedDays, profiler, { maintainRelationships: maintainDiplomaticRelationships }));\n    if (maintainDiplomaticRelationships) diplomacyRelationshipElapsedDays = 0;",
 "    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, diplomacyElapsedDays, profiler, { maintainRelationships: maintainDiplomaticRelationships }));\n    const combinedExerciseEvents = profiler.measure('Combined allied exercises', () => tickCombinedExercises(regions, seaRegions, fleets, agreements, calendarWeek, time.elapsedDays));\n    if (maintainDiplomaticRelationships) diplomacyRelationshipElapsedDays = 0;"),
("      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),\n",
 "      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),\n      ...combinedExerciseEvents.filter((event) => event.organiserRegionId === playerRegionId || event.observerRegionId === playerRegionId || event.participantRegionIds?.includes?.(playerRegionId)),\n"),
("    postWarSocietyApi: { setVeteranSupportPolicy, postWarSocietySummary },\n",
 "    postWarSocietyApi: { setVeteranSupportPolicy, postWarSocietySummary },\n    combinedExerciseApi: { startCombinedExercise, combinedExerciseSummary, eligibleExerciseAllies },\n"),
("  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0), {\n",
 "  if (region.id === playerRegionId) renderCombinedExerciseControls(document.getElementById('region-controls'),region,{regions,seaRegions:window.__worldsim?.seaRegions||[],agreements,fleets:window.__worldsim?.fleets||[],currentTick:calendarWeekIndex(clock.elapsedDays||0),onAction:()=>council?.refresh()});\n  if (region.id === playerRegionId) renderDiplomaticServicePanel(document.getElementById('region-controls'), region, regions, calendarWeekIndex(clock.elapsedDays || 0), {\n")
])
print('combined exercise integration applied')
