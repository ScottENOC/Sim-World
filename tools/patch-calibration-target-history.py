from pathlib import Path

path = Path('tools/calibrate.mjs')
text = path.read_text()

text = text.replace(
"const worldScale = Math.max(1, Math.floor(Number(option('scale', 1))));\nconst daysPerTick = Math.max(1, Number(option('days-per-tick', 30)));\nconst systemTiming = String(option('system-timing', 'false')).toLowerCase() === 'true';\n",
"const worldScale = Math.max(1, Math.floor(Number(option('scale', 1))));\nconst requestedTargetRegions = Math.floor(Number(option('target-regions', 0)));\nconst targetRegions = requestedTargetRegions > 0 ? requestedTargetRegions : null;\nconst daysPerTick = Math.max(1, Number(option('days-per-tick', 30)));\nconst systemTiming = String(option('system-timing', 'false')).toLowerCase() === 'true';\nconst regionalDetail = String(option('regional-detail', 'false')).toLowerCase() === 'true';\n"
)

old = """function makeWorld(rng) {
  const scaledMeta = [];
  for (let copy = 0; copy < worldScale; copy++) for (const m of meta) scaledMeta.push({ ...m, id: `${m.id}__${copy}`, neighbors: m.neighbors.map(id => `${id}__${copy}`) });
  const regions = scaledMeta.map((m) => {
"""
new = """function makeWorld(rng) {
  const desiredRegions = targetRegions || meta.length * worldScale;
  const copyCount = Math.ceil(desiredRegions / meta.length);
  const scaledMeta = [];
  const includedByCopy = [];
  let remaining = desiredRegions;
  for (let copy = 0; copy < copyCount; copy += 1) {
    const selected = meta.slice(0, Math.min(meta.length, remaining));
    const included = new Set(selected.map((m) => m.id));
    includedByCopy.push(included);
    for (const m of selected) scaledMeta.push({ ...m, id: `${m.id}__${copy}`,
      neighbors: m.neighbors.filter((id) => included.has(id)).map((id) => `${id}__${copy}`) });
    remaining -= selected.length;
  }
  const regions = scaledMeta.map((m) => {
"""
if old not in text:
    raise SystemExit('makeWorld header not found')
text = text.replace(old, new)

old_seas = """  const seas = Array.from({length: worldScale}, (_, copy) => seaMeta.map((m) => ({...m, id: `${m.id}__${copy}`, adjacentLand: m.adjacentLand.map(id => `${id}__${copy}`)}))).flat().map((m) => {
    const sea = new SeaRegion({ id: m.id, name: m.name, feature: null,
      centroid: m.centroid, areaSqKm: m.areaSqKm, adjacentLand: m.adjacentLand });
    sea.fish = { currentStock: sea.areaSqKm * 2 * 0.7, K: sea.areaSqKm * 2 };
    return sea;
  });
"""
new_seas = """  const seas = [];
  for (let copy = 0; copy < includedByCopy.length; copy += 1) {
    const included = includedByCopy[copy];
    for (const m of seaMeta) {
      const adjacentLand = m.adjacentLand.filter((id) => included.has(id)).map((id) => `${id}__${copy}`);
      if (adjacentLand.length === 0) continue;
      const sea = new SeaRegion({ id: `${m.id}__${copy}`, name: m.name, feature: null,
        centroid: m.centroid, areaSqKm: m.areaSqKm, adjacentLand });
      sea.fish = { currentStock: sea.areaSqKm * 2 * 0.7, K: sea.areaSqKm * 2 };
      seas.push(sea);
    }
  }
"""
if old_seas not in text:
    raise SystemExit('sea clone block not found')
text = text.replace(old_seas, new_seas)

text = text.replace(
"function snapshot(regions, initial, year, window, polities = []) {",
"function snapshot(regions, initial, year, window, polities = [], includeRegionalDetail = false) {"
)

needle = """    specialities: Object.fromEntries(Object.entries(specialities).map(([key, entries]) =>
      [key, { count: entries.length, leaders: entries.slice(0, 5) }])),
  };
}
"""
replacement = """    specialities: Object.fromEntries(Object.entries(specialities).map(([key, entries]) =>
      [key, { count: entries.length, leaders: entries.slice(0, 5) }])),
    ...(includeRegionalDetail ? { regional: regions.map((r) => ({
      id: r.id,
      name: r.name,
      population: Math.round(r.population),
      stability: +r.stability.toFixed(3),
      weeklyExports: +(r.tradeEconomy.weeklyExports || 0).toFixed(2),
      weeklyFoodImports: +(r.tradeEconomy.weeklyFoodImports || 0).toFixed(2),
      foodImportDependence: +(r.foodImportDependence || 0).toFixed(4),
      bronzeOutput: +(r.report.smithing?.bronze || 0).toFixed(2),
      bronzeStock: +(r.stockpile.bronze || 0).toFixed(2),
      iron: r.unlockedTechIds.has('iron_smelting'),
      surfaceCopperRemaining: +(r.deposits.copper?.tiers[0]?.remainingStock || 0).toFixed(1),
      surfaceTinRemaining: +(r.deposits.tin?.tiers[0]?.remainingStock || 0).toFixed(1),
    })) } : {}),
  };
}
"""
if needle not in text:
    raise SystemExit('snapshot tail not found')
text = text.replace(needle, replacement)

text = text.replace(
"timeline.push(snapshot(regions, initial, +(elapsedDays / 365.2425).toFixed(1), window, polities));",
"timeline.push(snapshot(regions, initial, +(elapsedDays / 365.2425).toFixed(1), window, polities, regionalDetail));"
)

text = text.replace(
"configuration: { years, seedCount, snapshotYears, baseSeed, worldScale, daysPerTick, systemTiming },",
"configuration: { years, seedCount, snapshotYears, baseSeed, worldScale, targetRegions, actualRegions: targetRegions || meta.length * worldScale, daysPerTick, systemTiming, regionalDetail },"
)

path.write_text(text)
