from pathlib import Path

def patch(path,reps):
    p=Path(path); s=p.read_text()
    for old,new in reps:
        if old not in s: raise SystemExit(f'missing anchor {path}: {old[:120]!r}')
        s=s.replace(old,new,1)
    p.write_text(s)

patch('js/diplomacy/relations.js', [
("export function tickDiplomacy(regions, agreements, toolTypes, currentTick) {", "export function tickDiplomacy(regions, agreements, toolTypes, currentTick, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const attitudeRetention = Math.pow(1 - ATTITUDE_DECAY_PER_WEEK, weekScale);"),
("      relation.attitude *= (1 - ATTITUDE_DECAY_PER_WEEK);", "      relation.attitude *= attitudeRetention;"),
("      const affordable = Math.floor(Math.max(0, from.treasury) / SUPPORT_UPKEEP_PER_SOLDIER);", "      const supportCostPerSoldier = SUPPORT_UPKEEP_PER_SOLDIER * weekScale;\n      const affordable = Math.floor(Math.max(0, from.treasury) / Math.max(0.000001, supportCostPerSoldier));"),
("      const upkeep = Math.min(from.treasury, agreement.personnel * SUPPORT_UPKEEP_PER_SOLDIER);", "      const upkeep = Math.min(from.treasury, agreement.personnel * supportCostPerSoldier);"),
("      changeAttitude(to, from.id, 0.002, 'continued_support', currentTick);", "      changeAttitude(to, from.id, 0.002 * weekScale, 'continued_support', currentTick);"),
("      const demand = Math.max(0.5, to.population * TRIBUTE_RATE);", "      const demand = Math.max(0.5 * weekScale, to.population * TRIBUTE_RATE * weekScale);"),
("      changeAttitude(to, from.id, -0.0015, 'tribute', currentTick);", "      changeAttitude(to, from.id, -0.0015 * weekScale, 'tribute', currentTick);"),
("      const taken = Math.min(available, Math.max(1, to.population * RESOURCE_ACCESS_RATE));", "      const taken = Math.min(available, Math.max(1 * weekScale, to.population * RESOURCE_ACCESS_RATE * weekScale));"),
("      changeAttitude(to, from.id, -0.001, 'resource_access', currentTick);", "      changeAttitude(to, from.id, -0.001 * weekScale, 'resource_access', currentTick);"),
])

patch('js/politics/polities.js', [
("export function tickPolities(polities, regions, currentTick) {", "export function tickPolities(polities, regions, currentTick, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const controlAdjustment = 1 - Math.pow(1 - CONTROL_ADJUSTMENT_RATE, weekScale);"),
("      governance.administrativeControl += (desiredControl - governance.administrativeControl) * CONTROL_ADJUSTMENT_RATE;", "      governance.administrativeControl += (desiredControl - governance.administrativeControl) * controlAdjustment;"),
("      const demand = nominal * (0.25 + governance.administrativeControl * 0.75);", "      const demand = nominal * weekScale * (0.25 + governance.administrativeControl * 0.75);"),
("      const protectionBenefit = (subject.safetyRating ?? 1) > 0.85 ? governance.administrativeControl * 0.00035 : 0;\n      const extractionResentment = governance.tributeRate * 0.0015 +\n        Math.max(0, 0.55 - governance.autonomy) * 0.0005;", "      const protectionBenefit = (subject.safetyRating ?? 1) > 0.85 ? governance.administrativeControl * 0.00035 * weekScale : 0;\n      const extractionResentment = (governance.tributeRate * 0.0015 +\n        Math.max(0, 0.55 - governance.autonomy) * 0.0005) * weekScale;"),
("        governance.governor.loyalty = clamp(governance.governor.loyalty * 0.998 +\n          attitudeLoyalty * 0.001 + admin.legitimacy * 0.001);", "        const loyaltyRetention = Math.pow(0.998, weekScale);\n        const loyaltyBlend = 1 - loyaltyRetention;\n        const targetLoyalty = clamp((attitudeLoyalty + admin.legitimacy) / 2);\n        governance.governor.loyalty = clamp(governance.governor.loyalty * loyaltyRetention + targetLoyalty * loyaltyBlend);"),
("        subject.stability = clamp(subject.stability + ((governance.governor?.competence || 0.5) - 0.45) * 0.0002);", "        subject.stability = clamp(subject.stability + ((governance.governor?.competence || 0.5) - 0.45) * 0.0002 * weekScale);"),
("    region.militaryThreat.recentRaids = weeks > THREAT_MEMORY_WEEKS\n      ? region.militaryThreat.recentRaids * 0.96\n      : region.militaryThreat.recentRaids * 0.985;", "    region.militaryThreat.recentRaids = weeks > THREAT_MEMORY_WEEKS\n      ? region.militaryThreat.recentRaids * Math.pow(0.96, weekScale)\n      : region.militaryThreat.recentRaids * Math.pow(0.985, weekScale);"),
])

patch('js/military/raiding.js', [
("      raid.returnTick = currentTick + computeTravelWeeks(attacker, defender, raid.viaSea);", "      // Return travel starts at the actual arrival/combat week, not the next\n      // monthly scheduler wake-up. This lets short raids complete inside one\n      // monthly world step.\n      raid.returnTick = raid.arriveTick + computeTravelWeeks(attacker, defender, raid.viaSea);"),
])

p=Path('js/military/campaigns.js'); s=p.read_text()
old="""export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random) {
  const events = [];
  for (const campaign of campaigns) {
    if (campaign.completed) continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) { campaign.completed = true; continue; }
    if (campaign.phase === 'travelling' && campaign.withdrawRequested) {
      campaign.phase = 'returning'; campaign.stage = 'withdrawing'; campaign.outcome = 'withdrawn';
      campaign.returnTick = currentTick + Math.max(1, currentTick - campaign.departTick);
      events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
    if (campaign.phase === 'travelling' && currentTick >= campaign.arriveTick) {
      campaign.phase = 'engaged'; campaign.stage = 'skirmishing';
      events.push({ type: 'campaign_arrived', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
    if (campaign.phase === 'engaged') {
      resolveCampaignWeek(campaign, attacker, defender, polities, [...regionsById.values()], currentTick, toolTypes, rng);
      if (campaign.phase === 'returning') {
        events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
      }
    }
    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {
      attacker.army.personnel += campaign.personnel;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - campaign.personnel);
      returnSiegeTrain(attacker, campaign.siegeEquipment);
      campaign.completed = true; campaign.phase = 'completed';
      events.push({ type: 'campaign_returned', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
  }
  return { remaining: campaigns.filter((campaign) => !campaign.completed), events };
}"""
new="""export function tickCampaigns(campaigns, regionsById, polities, currentTick, toolTypes, rng = Math.random) {
  const events = [];
  const regionList = [...regionsById.values()];
  for (const campaign of campaigns) {
    if (campaign.completed) continue;
    const attacker = regionsById.get(campaign.attackerId);
    const defender = regionsById.get(campaign.defenderId);
    if (!attacker || !defender) { campaign.completed = true; continue; }
    if (!Number.isFinite(campaign.lastProcessedTick)) campaign.lastProcessedTick = campaign.departTick;

    if (campaign.phase === 'travelling' && campaign.withdrawRequested) {
      campaign.phase = 'returning'; campaign.stage = 'withdrawing'; campaign.outcome = 'withdrawn';
      const elapsedOutbound = Math.max(1, Math.min(currentTick, campaign.arriveTick) - campaign.departTick);
      campaign.returnTick = currentTick + elapsedOutbound;
      events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
    if (campaign.phase === 'travelling' && currentTick >= campaign.arriveTick) {
      campaign.phase = 'engaged'; campaign.stage = 'skirmishing';
      campaign.lastProcessedTick = Math.max(campaign.lastProcessedTick, campaign.arriveTick - 1);
      events.push({ type: 'campaign_arrived', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
    // A monthly scheduler may span four or five combat weeks. Resolve each
    // historical week in order, but only for campaigns that are actually
    // active; the rest of the world still receives one monthly update.
    while (campaign.phase === 'engaged' && campaign.lastProcessedTick < currentTick) {
      const combatWeek = campaign.lastProcessedTick + 1;
      resolveCampaignWeek(campaign, attacker, defender, polities, regionList, combatWeek, toolTypes, rng);
      campaign.lastProcessedTick = combatWeek;
      if (campaign.phase === 'returning') {
        events.push({ type: 'campaign_decided', campaign, attackerName: attacker.name, defenderName: defender.name });
        break;
      }
    }
    if (campaign.phase === 'returning' && currentTick >= campaign.returnTick) {
      attacker.army.personnel += campaign.personnel;
      attacker.army.away = Math.max(0, (attacker.army.away || 0) - campaign.personnel);
      returnSiegeTrain(attacker, campaign.siegeEquipment);
      campaign.completed = true; campaign.phase = 'completed';
      events.push({ type: 'campaign_returned', campaign, attackerName: attacker.name, defenderName: defender.name });
    }
  }
  return { remaining: campaigns.filter((campaign) => !campaign.completed), events };
}"""
if old not in s: raise SystemExit('campaign tick anchor missing')
p.write_text(s.replace(old,new,1))

patch('js/main.js', [
("    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek);", "    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);"),
("    const polityEvents = tickPolities(polities, regions, calendarWeek);", "    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);"),
])
patch('tools/calibrate.mjs', [
("    tickDiplomacy(regions, agreements, toolTypes, calendarWeek);", "    tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);"),
("    tickPolities(polities, regions, calendarWeek);", "    tickPolities(polities, regions, calendarWeek, time.elapsedDays);"),
])
