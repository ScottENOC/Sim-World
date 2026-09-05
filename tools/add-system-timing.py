from pathlib import Path

p = Path('tools/calibrate.mjs')
s = p.read_text()

s = s.replace(
    "const daysPerTick = Math.max(1, Number(option('days-per-tick', 30)));",
    "const daysPerTick = Math.max(1, Number(option('days-per-tick', 30)));\nconst systemTiming = String(option('system-timing', 'false')).toLowerCase() === 'true';",
    1,
)

s = s.replace(
    "  const timeline = [];\n  const targetDays = years * 365.2425;",
    "  const timeline = [];\n  const timings = Object.create(null);\n  const timed = (name, fn) => {\n    if (!systemTiming) return fn();\n    const started = performance.now();\n    const result = fn();\n    timings[name] = (timings[name] || 0) + (performance.now() - started);\n    return result;\n  };\n  const targetDays = years * 365.2425;\n  let nextSnapshotDay = snapshotYears * 365.2425;",
    1,
)

old = """    campaigns = tickCampaigns(campaigns, regionsById, polities, calendarWeek, toolTypes, rng).remaining;
    prepareConstructionLabor(regions);
    prepareSiegeWorkforce(regions);
    tickEconomy(regions, seas, toolTypes, rng, calendarWeek, time.elapsedDays, time.endDay);
    tickFishingKnowledge(fishingPairs, calendarWeek);
    tickTrade(regions, calendarWeek, time);
    tickStateFinance(regions, time.elapsedDays);
    tickInfrastructureMaintenance(regions, time.elapsedDays);
    tickConstruction(regions, calendarWeek, time.elapsedDays);
    tickSiegeEquipment(regions, time.elapsedDays);
    tickBreakthroughs(regions, calendarWeek, rng, time.elapsedDays);
    tickReligion(regions, religiousWorld, calendarWeek, raids, campaigns, rng, time.elapsedDays);
    tickDemographics(regions, religiousWorld, time.elapsedDays);
    tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);
    tickPolities(polities, regions, calendarWeek, time.elapsedDays);
    tickBanditry(regions, toolTypes, agreements, time.elapsedDays);
    tickNationAi(regions, '__calibration__', raids, campaigns, agreements, polities,
      religiousWorld, calendarWeek, toolTypes, rng, time.elapsedDays);
    const raidResult = tickRaids(raids, regionsById, calendarWeek, toolTypes, rng);
    raids = raidResult.remaining;
    pruneKnowledge(regions, calendarWeek);
    assertFiniteWorld(regions, initial.population, tick);"""
new = """    campaigns = timed('campaigns', () => tickCampaigns(campaigns, regionsById, polities, calendarWeek, toolTypes, rng)).remaining;
    timed('constructionPrep', () => prepareConstructionLabor(regions));
    timed('siegePrep', () => prepareSiegeWorkforce(regions));
    timed('economy', () => tickEconomy(regions, seas, toolTypes, rng, calendarWeek, time.elapsedDays, time.endDay));
    timed('fishingKnowledge', () => tickFishingKnowledge(fishingPairs, calendarWeek));
    timed('trade', () => tickTrade(regions, calendarWeek, time));
    timed('stateFinance', () => tickStateFinance(regions, time.elapsedDays));
    timed('infrastructureMaintenance', () => tickInfrastructureMaintenance(regions, time.elapsedDays));
    timed('construction', () => tickConstruction(regions, calendarWeek, time.elapsedDays));
    timed('siegeEquipment', () => tickSiegeEquipment(regions, time.elapsedDays));
    timed('breakthroughs', () => tickBreakthroughs(regions, calendarWeek, rng, time.elapsedDays));
    timed('religion', () => tickReligion(regions, religiousWorld, calendarWeek, raids, campaigns, rng, time.elapsedDays));
    timed('demographics', () => tickDemographics(regions, religiousWorld, time.elapsedDays));
    timed('diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays));
    timed('polities', () => tickPolities(polities, regions, calendarWeek, time.elapsedDays));
    timed('banditry', () => tickBanditry(regions, toolTypes, agreements, time.elapsedDays));
    timed('nationAi', () => tickNationAi(regions, '__calibration__', raids, campaigns, agreements, polities,
      religiousWorld, calendarWeek, toolTypes, rng, time.elapsedDays));
    const raidResult = timed('raids', () => tickRaids(raids, regionsById, calendarWeek, toolTypes, rng));
    raids = raidResult.remaining;
    timed('knowledgePrune', () => pruneKnowledge(regions, calendarWeek));
    timed('validation', () => assertFiniteWorld(regions, initial.population, tick));"""
if old not in s:
    raise SystemExit('tick block anchor missing')
s = s.replace(old, new, 1)

old2 = """    if (tick % (snapshotYears * 52) === 0 || tick === years * 52) {
      timeline.push(snapshot(regions, initial, +(tick / 52).toFixed(1), window, polities));
      window = newWindow(regions);
    }
  }
  return { seed, timeline };"""
new2 = """    if (elapsedDays + 0.001 >= nextSnapshotDay || elapsedDays + 0.001 >= targetDays) {
      timeline.push(snapshot(regions, initial, +(elapsedDays / 365.2425).toFixed(1), window, polities));
      window = newWindow(regions);
      while (nextSnapshotDay <= elapsedDays + 0.001) nextSnapshotDay += snapshotYears * 365.2425;
    }
  }
  const tickCount = Math.ceil(targetDays / daysPerTick);
  const systemTimingMsPerTick = Object.fromEntries(Object.entries(timings)
    .sort((a, b) => b[1] - a[1]).map(([name, ms]) => [name, +(ms / Math.max(1, tickCount)).toFixed(3)]));
  return { seed, timeline, ...(systemTiming ? { systemTimingMsPerTick } : {}) };"""
if old2 not in s:
    raise SystemExit('snapshot anchor missing')
s = s.replace(old2, new2, 1)

s = s.replace(
    "configuration: { years, seedCount, snapshotYears, baseSeed, worldScale, daysPerTick },",
    "configuration: { years, seedCount, snapshotYears, baseSeed, worldScale, daysPerTick, systemTiming },",
    1,
)

p.write_text(s)
