from pathlib import Path

def patch(path, reps):
    p=Path(path); s=p.read_text()
    for old,new in reps:
        if old not in s: raise SystemExit(f'missing anchor {path}: {old[:100]!r}')
        s=s.replace(old,new,1)
    p.write_text(s)

patch('js/core/simTime.js', [
("export function elapsedYears(elapsedDays) {", "export function calendarWeekIndex(elapsedDays) {\n  return Math.floor(Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_WEEK);\n}\n\nexport function elapsedYears(elapsedDays) {")
])

patch('js/main.js', [
("import { Clock } from './core/clock.js?v=20260904-weather1';", "import { Clock } from './core/clock.js?v=20260904-weather1';\nimport { calendarWeekIndex } from './core/simTime.js?v=20260905-time2';"),
("  clock.onTick((time) => {\n    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, clock.tickIndex, toolTypes, Math.random);", "  clock.onTick((time) => {\n    // Legacy systems that store durations in weeks receive a calendar-week\n    // index derived from absolute simulated time. The expensive scheduler can\n    // therefore tick monthly without turning 104 historical weeks into 104 months.\n    const calendarWeek = calendarWeekIndex(time.endDay);\n    const campaignResult = tickCampaigns(activeCampaigns, regionsById, polities, calendarWeek, toolTypes, Math.random);"),
("    tickEconomy(regions, seaRegions, toolTypes, Math.random, clock.tickIndex, time.elapsedDays);", "    tickEconomy(regions, seaRegions, toolTypes, Math.random, calendarWeek, time.elapsedDays, time.endDay);"),
("    pruneKnowledge(regions, clock.tickIndex);", "    pruneKnowledge(regions, calendarWeek);"),
("    tickFishingKnowledge(fishingContactPairs, clock.tickIndex);", "    tickFishingKnowledge(fishingContactPairs, calendarWeek);"),
("    tickTrade(regions, clock.tickIndex, time);", "    tickTrade(regions, calendarWeek, time);"),
("    const constructionEvents = tickConstruction(regions, clock.tickIndex, time.elapsedDays);", "    const constructionEvents = tickConstruction(regions, calendarWeek, time.elapsedDays);"),
("    const breakthroughEvents = tickBreakthroughs(regions, clock.tickIndex, Math.random, time.elapsedDays);", "    const breakthroughEvents = tickBreakthroughs(regions, calendarWeek, Math.random, time.elapsedDays);"),
("    const religionEvents = tickReligion(regions, religiousWorld, clock.tickIndex, activeRaids, activeCampaigns, Math.random);", "    const religionEvents = tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays);"),
("    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, clock.tickIndex);", "    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek);"),
("    const polityEvents = tickPolities(polities, regions, clock.tickIndex);", "    const polityEvents = tickPolities(polities, regions, calendarWeek);"),
("      religiousWorld, clock.tickIndex, toolTypes, Math.random);", "      religiousWorld, calendarWeek, toolTypes, Math.random);"),
("    const { remaining, events } = tickRaids(activeRaids, regionsById, clock.tickIndex, toolTypes, Math.random);", "    const { remaining, events } = tickRaids(activeRaids, regionsById, calendarWeek, toolTypes, Math.random);"),
])

patch('js/economy/laborCore.js', [
("export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7) {", "export function tickEconomy(regions, seaRegions, toolTypes, rng = Math.random, currentTick = null, elapsedDays = 7, currentDay = null) {"),
("  const currentDay = Number.isFinite(currentTick) ? currentTick * elapsedDays : null;\n  tickWeather(regions, currentDay, rng, elapsedDays);", "  const weatherDay = Number.isFinite(currentDay) ? currentDay : (Number.isFinite(currentTick) ? currentTick * 7 : null);\n  tickWeather(regions, weatherDay, rng, elapsedDays);"),
])

patch('js/society/religion.js', [
("function spreadThroughTrade(regions, world, currentTick, cache) {", "function spreadThroughTrade(regions, world, currentTick, cache, weekScale = 1) {"),
("      shiftShare(region, a.id, bMission.id, TRADE_CONVERSION_RATE * resistance * bStrength / (bStrength + 120), world);", "      shiftShare(region, a.id, bMission.id, TRADE_CONVERSION_RATE * weekScale * resistance * bStrength / (bStrength + 120), world);"),
("      shiftShare(partner, b.id, aMission.id, TRADE_CONVERSION_RATE * resistance * aStrength / (aStrength + 120), world);", "      shiftShare(partner, b.id, aMission.id, TRADE_CONVERSION_RATE * weekScale * resistance * aStrength / (aStrength + 120), world);"),
("function stateSponsorship(region, world) {", "function stateSponsorship(region, world, weekScale = 1) {"),
("    STATE_SUPPORT_RATE * (0.4 + (1 - state.tolerance)) * state.shares[official], world);", "    STATE_SUPPORT_RATE * weekScale * (0.4 + (1 - state.tolerance)) * state.shares[official], world);"),
("export function tickReligion(regions, world, currentTick, raids = [], campaigns = [], rng = Math.random) {", "export function tickReligion(regions, world, currentTick, raids = [], campaigns = [], rng = Math.random, elapsedDays = 7) {\n  const weekScale = Math.max(0.01, elapsedDays / 7);\n  const variantChance = 1 - Math.pow(1 - VARIANT_CHANCE_PER_WEEK, weekScale);"),
("  spreadThroughTrade(regions, world, currentTick, cache);", "  spreadThroughTrade(regions, world, currentTick, cache, weekScale);"),
("    stateSponsorship(region, world);", "    stateSponsorship(region, world, weekScale);"),
("    if (dominant && region.population >= 5000 && rng() < VARIANT_CHANCE_PER_WEEK) {", "    if (dominant && region.population >= 5000 && rng() < variantChance) {"),
("    if (currentTick % SHARE_PRUNE_INTERVAL === 0) pruneShares(region.religion);", "    // Monthly ticks can skip an exact modulo boundary; pruning is cheap and\n    // doing it every base tick preserves the bounded-share invariant.\n    pruneShares(region.religion);"),
])

patch('tools/calibrate.mjs', [
("import { createReligiousWorld, initialiseReligions, tickReligion } from '../js/society/religion.js';", "import { createReligiousWorld, initialiseReligions, tickReligion } from '../js/society/religion.js';\nimport { calendarWeekIndex } from '../js/core/simTime.js';"),
("    const time = { tickIndex: tick, startDay, endDay: elapsedDays, elapsedDays: thisTickDays, resolution: 'benchmark' };\n    campaigns = tickCampaigns(campaigns, regionsById, polities, tick, toolTypes, rng).remaining;", "    const time = { tickIndex: tick, startDay, endDay: elapsedDays, elapsedDays: thisTickDays, resolution: 'benchmark' };\n    const calendarWeek = calendarWeekIndex(time.endDay);\n    campaigns = tickCampaigns(campaigns, regionsById, polities, calendarWeek, toolTypes, rng).remaining;"),
("    tickEconomy(regions, seas, toolTypes, rng, tick, time.elapsedDays);", "    tickEconomy(regions, seas, toolTypes, rng, calendarWeek, time.elapsedDays, time.endDay);"),
("    tickFishingKnowledge(fishingPairs, tick);", "    tickFishingKnowledge(fishingPairs, calendarWeek);"),
("    tickTrade(regions, tick, time);", "    tickTrade(regions, calendarWeek, time);"),
("    tickConstruction(regions, tick, time.elapsedDays);", "    tickConstruction(regions, calendarWeek, time.elapsedDays);"),
("    tickBreakthroughs(regions, tick, rng, time.elapsedDays);", "    tickBreakthroughs(regions, calendarWeek, rng, time.elapsedDays);"),
("    tickReligion(regions, religiousWorld, tick, raids, campaigns, rng);", "    tickReligion(regions, religiousWorld, calendarWeek, raids, campaigns, rng, time.elapsedDays);"),
("    tickDiplomacy(regions, agreements, toolTypes, tick);", "    tickDiplomacy(regions, agreements, toolTypes, calendarWeek);"),
("    tickPolities(polities, regions, tick);", "    tickPolities(polities, regions, calendarWeek);"),
("      religiousWorld, tick, toolTypes, rng);", "      religiousWorld, calendarWeek, toolTypes, rng);"),
("    const raidResult = tickRaids(raids, regionsById, tick, toolTypes, rng);", "    const raidResult = tickRaids(raids, regionsById, calendarWeek, toolTypes, rng);"),
("    pruneKnowledge(regions, tick);", "    pruneKnowledge(regions, calendarWeek);"),
])
