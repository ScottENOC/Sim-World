from pathlib import Path

root = Path(__file__).resolve().parents[1]

p = root / 'js/society/migration.js'
s = p.read_text()
s = s.replace("const DENSITY_REFERENCE = 6; // people/km² — same \"crowded\" threshold gathering uses\n", "const DENSITY_REFERENCE = 6; // people/km² — same \"crowded\" threshold gathering uses\nconst MAX_MIGRATION_DESTINATIONS = 4;\nconst MIN_MIGRANT_COHORT = 5;\n")
old = """  const totalScore = scored.reduce((sum, s) => sum + s.score, 0);\n  if (totalScore <= 0) return [];\n\n  return scored.map((s) => ({ dest: s.dest, count: emigrantCount * (s.score / totalScore) }));\n}"""
new = """  scored.sort((a, b) => b.score - a.score);\n  const selected = scored.slice(0, MAX_MIGRATION_DESTINATIONS);\n  let totalScore = selected.reduce((sum, s) => sum + s.score, 0);\n  if (totalScore <= 0) return [];\n\n  let routes = selected.map((s) => ({ dest: s.dest, count: emigrantCount * (s.score / totalScore) }))\n    .filter((route) => route.count >= MIN_MIGRANT_COHORT);\n  if (!routes.length && selected.length && emigrantCount > 0) routes = [{ dest: selected[0].dest, count: emigrantCount }];\n  const retained = routes.reduce((sum, route) => sum + route.count, 0);\n  if (retained > 0 && retained < emigrantCount) {\n    const scale = emigrantCount / retained;\n    routes = routes.map((route) => ({ ...route, count: route.count * scale }));\n  }\n  return routes;\n}"""
assert old in s
p.write_text(s.replace(old,new,1))

p = root / 'js/diplomacy/relations.js'
s = p.read_text()
s = s.replace("export function tickDiplomacy(regions, agreements, toolTypes, currentTick, elapsedDays = 7, profiler = null) {", "export function tickDiplomacy(regions, agreements, toolTypes, currentTick, elapsedDays = 7, profiler = null, options = {}) {")
old = """  const relationshipStart = performance.now();\n  for (const region of regions) {\n    ensureDiplomacy(region);\n    region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };\n    for (const [otherId, relation] of region.relations.entries()) {"""
new = """  const relationshipStart = performance.now();\n  for (const region of regions) {\n    ensureDiplomacy(region);\n    region.diplomacyReport = { paid: 0, received: 0, woodTaken: 0, support: 0 };\n    if (options.maintainRelationships === false) continue;\n    for (const [otherId, relation] of region.relations.entries()) {"""
assert old in s
p.write_text(s.replace(old,new,1))

p = root / 'js/main.js'
s = p.read_text()
anchor = "  let languageChangeAccumulatedDays = 0;\n"
assert anchor in s
s = s.replace(anchor, anchor + "  let diplomacyRelationshipAccumulatedDays = 0;\n", 1)
old = """    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays, profiler));"""
new = """    diplomacyRelationshipAccumulatedDays += time.elapsedDays;\n    const maintainDiplomaticRelationships = diplomacyRelationshipAccumulatedDays >= 90;\n    const diplomacyElapsedDays = maintainDiplomaticRelationships ? diplomacyRelationshipAccumulatedDays : time.elapsedDays;\n    const diplomacyEvents = profiler.measure('Diplomacy', () => tickDiplomacy(regions, agreements, toolTypes, calendarWeek, diplomacyElapsedDays, profiler, { maintainRelationships: maintainDiplomaticRelationships }));\n    if (maintainDiplomaticRelationships) diplomacyRelationshipAccumulatedDays = 0;"""
assert old in s
p.write_text(s.replace(old,new,1))

p = root / 'index.html'
s = p.read_text()
s = s.replace('js/main.js?v=20260912-deep-profiler1', 'js/main.js?v=20260912-migration-diplomacy1')
p.write_text(s)
