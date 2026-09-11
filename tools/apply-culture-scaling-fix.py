from pathlib import Path

p = Path(__file__).resolve().parents[1] / 'js' / 'society' / 'culture.js'
s = p.read_text()

s = s.replace("const MIN_GROUP_SHARE = 0.0005;", "const MIN_GROUP_SHARE = 0.005;\nconst SALIENT_CULTURE_COVERAGE = 0.95;\nconst MAX_SALIENT_CULTURE_GROUPS = 6;", 1)

old = """function normaliseGroups(region) {\n  const groups = region.cultureGroups.filter((group) => group.share >= MIN_GROUP_SHARE);\n  const total = groups.reduce((sum, group) => sum + Math.max(0, group.share || 0), 0);\n  if (total <= 0) return initialiseRegionCulture(region);\n  for (const group of groups) group.share = Math.max(0, group.share || 0) / total;\n  region.cultureGroups = groups;\n  return groups;\n}\n"""
new = """function normaliseGroups(region) {\n  // Tiny minorities remain part of historical ancestry, but are not retained as\n  // live simulation groups forever. At world scale a 0.05% cutoff allowed\n  // migration to create dozens of computationally significant groups per region.\n  const groups = region.cultureGroups.filter((group) => group.share >= MIN_GROUP_SHARE);\n  const total = groups.reduce((sum, group) => sum + Math.max(0, group.share || 0), 0);\n  if (total <= 0) return initialiseRegionCulture(region);\n  for (const group of groups) group.share = Math.max(0, group.share || 0) / total;\n  region.cultureGroups = groups;\n  return groups;\n}\n\nfunction salientGroups(groups, coverage = SALIENT_CULTURE_COVERAGE, maxGroups = MAX_SALIENT_CULTURE_GROUPS) {\n  const sorted = [...groups].filter((group) => (group.share || 0) > 0).sort((a, b) => b.share - a.share);\n  const out = [];\n  let covered = 0;\n  for (const group of sorted) {\n    if (out.length >= maxGroups) break;\n    out.push(group);\n    covered += group.share || 0;\n    if (covered >= coverage) break;\n  }\n  return out;\n}\n"""
assert old in s
s = s.replace(old, new, 1)

old = """export function cultureAffinity(regionA, regionB) {\n  if (!regionA || !regionB) return 0.5;\n  const groupsA = ensureRegionCulture(regionA);\n  const groupsB = ensureRegionCulture(regionB);\n  regionA._cultureAffinityCache ||= {};\n  const cached = regionA._cultureAffinityCache[regionB.id];\n  if (cached && cached.aRevision === regionA._cultureRevision && cached.bRevision === regionB._cultureRevision) return cached.value;\n  let affinity = 0;\n  for (const a of groupsA) for (const b of groupsB) affinity += a.share * b.share * groupSimilarity(a, b);\n  affinity = clamp01(affinity);\n"""
new = """export function cultureAffinity(regionA, regionB) {\n  if (!regionA || !regionB) return 0.5;\n  const groupsA = salientGroups(ensureRegionCulture(regionA));\n  const groupsB = salientGroups(ensureRegionCulture(regionB));\n  regionA._cultureAffinityCache ||= {};\n  const cached = regionA._cultureAffinityCache[regionB.id];\n  if (cached && cached.aRevision === regionA._cultureRevision && cached.bRevision === regionB._cultureRevision) return cached.value;\n  const totalA = Math.max(1e-9, groupsA.reduce((sum, group) => sum + group.share, 0));\n  const totalB = Math.max(1e-9, groupsB.reduce((sum, group) => sum + group.share, 0));\n  let affinity = 0;\n  for (const a of groupsA) for (const b of groupsB) {\n    affinity += (a.share / totalA) * (b.share / totalB) * groupSimilarity(a, b);\n  }\n  affinity = clamp01(affinity);\n"""
assert old in s
s = s.replace(old, new, 1)

old = """export function migrateCulture(origin, destination, count) {\n  if (!origin || !destination || count <= 0) return;\n  const originGroups = ensureRegionCulture(origin);\n  const destGroups = ensureRegionCulture(destination);\n"""
new = """export function migrateCulture(origin, destination, count) {\n  if (!origin || !destination || count <= 0) return;\n  // Migrants carry the culturally salient mixture, not an arbitrarily long tail\n  // of tiny minorities. Re-normalising preserves the whole migrant cohort while\n  // preventing every destination from inheriting every historical micro-group.\n  const originGroups = salientGroups(ensureRegionCulture(origin));\n  const originSalientShare = Math.max(1e-9, originGroups.reduce((sum, group) => sum + group.share, 0));\n  const destGroups = ensureRegionCulture(destination);\n"""
assert old in s
s = s.replace(old, new, 1)

old = """  for (const source of originGroups) {\n    const incomingShare = migrantShareOfDestination * source.share;\n"""
new = """  for (const source of originGroups) {\n    const incomingShare = migrantShareOfDestination * (source.share / originSalientShare);\n"""
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
