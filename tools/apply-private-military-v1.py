from pathlib import Path

p=Path('js/politics/nonStateOrganisations.js')
s=p.read_text()
old="  MERCENARY_COMPANY: 'mercenary_company',"
if "PRIVATE_MILITARY_COMPANY" not in s:
    assert old in s
    s=s.replace(old, old+"\n  PRIVATE_MILITARY_COMPANY: 'private_military_company',",1)
p.write_text(s)

p=Path('js/military/campaigns.js')
s=p.read_text()
marker="import { firearmCombatProfile } from './firearms.js?v=20260912-gunpowder1';"
if 'campaignExternalSupport' not in s:
    assert marker in s
    s=s.replace(marker, marker+"\nimport { campaignExternalSupport, applyExternalCampaignLosses } from '../politics/privateMilitaryActors.js?v=20260912-pmc1';",1)
old="  let attackerPower = combatPower(attacker, campaign.personnel, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier;"
if 'effectiveExternal' not in s:
    assert old in s
    new="  const externalSupport = campaignExternalSupport(campaign, options.nonStateWorld);\n  const effectiveExternal = externalSupport.personnel * externalSupport.quality;\n  let attackerPower = combatPower(attacker, campaign.personnel + effectiveExternal, toolTypes, 'attacker', campaign.supply,\n    campaign.attackerMorale, null, terrain) * (expedition?.combatMultiplier ?? 1) * attackerFirearms.multiplier;"
    s=s.replace(old,new,1)
old="  const attackerLosses = combatAttackerLosses + logisticsLosses;"
if 'externalLossRate' not in s:
    assert old in s
    s=s.replace(old,old+"\n  const externalLossRate = (combatAttackerLosses + logisticsLosses) / Math.max(1, campaign.personnel + externalSupport.personnel);\n  const externalLosses = applyExternalCampaignLosses(campaign, options.nonStateWorld, externalLossRate);",1)
old="    attackerLosses, logisticsLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,"
if 'externalPersonnel:' not in s:
    assert old in s
    s=s.replace(old,"    attackerLosses, externalLosses, externalPersonnel: externalSupport.personnel, logisticsLosses, defenderLosses, militiaLosses, civilianDeaths, attackerMorale: campaign.attackerMorale,",1)
p.write_text(s)

p=Path('js/main.js')
s=p.read_text()
marker="import { tickNonStateOrganisations } from './politics/nonStateOrganisations.js?v=20260912-organisations1';"
if 'tickPrivateMilitaryActors' not in s:
    assert marker in s
    s=s.replace(marker, marker+"\nimport { tickPrivateMilitaryActors } from './politics/privateMilitaryActors.js?v=20260912-pmc1';",1)
old="const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets }));"
if 'nonStateWorld: religiousWorld' not in s:
    assert old in s
    s=s.replace(old,"const campaignResult = profiler.measure('Campaigns', () => tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random, { playerPolityId: activePlayerPolityId, activeWars, fleets, nonStateWorld: religiousWorld }));",1)
old="const organisationEvents = profiler.measure('Non-state organisations', () => tickNonStateOrganisations(regions, polities, religiousWorld, calendarWeek, time.elapsedDays, Math.random, { agreements, activeRaids }));"
if "profiler.measure('Private military actors'" not in s:
    assert old in s
    s=s.replace(old,old+"\n    const privateMilitaryEvents = profiler.measure('Private military actors', () => tickPrivateMilitaryActors(regions, polities, religiousWorld, activeCampaigns, calendarWeek, time.elapsedDays, Math.random));",1)
old="      ...organisationEvents.filter((event) => event.regionId === playerRegionId || event.organisation?.memberPolityIds?.has?.(activePlayerPolityId) || event.polityIds?.includes?.(activePlayerPolityId)),"
if '...privateMilitaryEvents.filter' not in s:
    assert old in s
    s=s.replace(old,old+"\n      ...privateMilitaryEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),",1)
p.write_text(s)

p=Path('js/ui/nonStateOrganisationsUi.js')
s=p.read_text()
if 'privateMilitaryActors.js' not in s:
    s=s.replace("} from '../politics/nonStateInteractions.js?v=20260912-organisations2';", "} from '../politics/nonStateInteractions.js?v=20260912-organisations2';\nimport { assignMercenaryContractToCampaign, assignPmcMission, endPmcMission, privateMilitaryActions, revokePmcSponsorship } from '../politics/privateMilitaryActors.js?v=20260912-pmc1';",1)
s=s.replace("    interstate_league: 'Interstate league', supranational_union: 'Supranational union',", "    interstate_league: 'Interstate league', supranational_union: 'Supranational union', private_military_company: 'Private military company',",1)
old="  const rows = organisationActions(world.religiousWorld, polity.id, world.regions, world.polities)\n    .filter((row) => row.isHostSovereign || row.isMember || row.contract || row.canHire || row.canJoin || row.canRecognise);"
if 'const militaryRows = new Map' not in s:
    assert old in s
    new="  const militaryRows = new Map(privateMilitaryActions(world.religiousWorld, polity.id, world.activeCampaigns || []).map((row) => [row.organisation.id, row]));\n  const rows = organisationActions(world.religiousWorld, polity.id, world.regions, world.polities)\n    .filter((row) => row.isHostSovereign || row.isMember || row.contract || row.canHire || row.canJoin || row.canRecognise || militaryRows.has(row.organisation.id));\n  for (const militaryRow of militaryRows.values()) if (!rows.some((row) => row.organisation.id === militaryRow.organisation.id)) rows.push({ organisation: militaryRow.organisation });"
    s=s.replace(old,new,1)
old="    const org = row.organisation;"
if 'const military = militaryRows.get(org.id);' not in s:
    assert old in s
    s=s.replace(old,old+"\n    const military = militaryRows.get(org.id);",1)
old="    if (row.contract) addStatus(card, `You hire ${Math.round(row.contract.personnel).toLocaleString()} personnel for ${row.contract.monthlyCost.toFixed(1)} treasury/month.`);"
if "equipment access" not in s:
    assert old in s
    s=s.replace(old,old+"\n    if (org.type === 'private_military_company') addStatus(card, `Sponsor ${org.sponsorPolityId || 'none'} · equipment access ${Math.round((org.equipmentAccess || 0) * 100)}% · deniability ${Math.round((org.deniability || 0) * 100)}%.`);",1)
insert="""
    if (military?.contract && military.assignableCampaigns?.length) {
      for (const campaign of military.assignableCampaigns.slice(0, 3)) actions.appendChild(button(`Assign to campaign ${campaign.id}`, () => run(() => assignMercenaryContractToCampaign(world.religiousWorld, org.id, polity.id, campaign.id))));
    }
    if (military?.contract?.assignedCampaignId != null) actions.appendChild(button('Return mercenaries to reserve', () => run(() => assignMercenaryContractToCampaign(world.religiousWorld, org.id, polity.id, null))));
    if (military?.isSponsor) {
      for (const campaign of (world.activeCampaigns || []).filter((c) => !c.completed).slice(0, 2)) actions.appendChild(button(`PMC support campaign ${campaign.id}`, () => run(() => assignPmcMission(world.religiousWorld, org.id, polity.id, 'campaign_support', campaign.id, { currentTick: currentTick(world) }))));
      actions.appendChild(button('PMC train capital forces', () => run(() => assignPmcMission(world.religiousWorld, org.id, polity.id, 'training', capital.id, { currentTick: currentTick(world) }))));
      actions.appendChild(button('PMC guard capital resources', () => run(() => assignPmcMission(world.religiousWorld, org.id, polity.id, 'resource_security', capital.id, { currentTick: currentTick(world) }))));
      actions.appendChild(button('End state sponsorship', () => run(() => revokePmcSponsorship(world.religiousWorld, org.id, polity.id))));
    }
    for (const mission of military?.activeMissions || []) actions.appendChild(button(`Recall: ${String(mission.type).replaceAll('_',' ')}`, () => run(() => endPmcMission(world.religiousWorld, org.id, mission.id))));
"""
marker="    if (row.canHire) actions.appendChild(button('Hire company'"
if 'Assign to campaign ${campaign.id}' not in s:
    idx=s.find(marker)
    assert idx>=0
    s=s[:idx]+insert+s[idx:]
p.write_text(s)

p=Path('index.html')
s=p.read_text().replace('js/ui/nonStateOrganisationsUi.js?v=20260912-organisations2','js/ui/nonStateOrganisationsUi.js?v=20260912-pmc1')
p.write_text(s)
