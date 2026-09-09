from pathlib import Path

p = Path('js/diplomacy/languageNetworks.js')
text = p.read_text()
old = """export function refreshNativeLanguageCommunities(region) {\n  const n = ensureLanguageNetwork(region);\n  const next = {};\n  for (const group of cultureGroups(region)) {\n    const lang = languageForCulture(group);\n    const share = Math.max(0, finite(group.share, 0));\n    if (!next[lang.languageId]) next[lang.languageId] = { share: 0, familyId: lang.familyId };\n    next[lang.languageId].share += share;\n  }\n  const total = Object.values(next).reduce((s, x) => s + x.share, 0) || 1;\n  for (const entry of Object.values(next)) entry.share /= total;\n  n.communities = next;\n  const dominant = Object.entries(next).sort((a,b) => b[1].share - a[1].share)[0]?.[0];\n  if (dominant && n.institutions.court.length === 0) n.institutions.court = [dominant];\n  if (dominant && n.institutions.administration.length === 0) n.institutions.administration = [dominant];\n  return n.communities;\n}\n"""
new = """export function refreshNativeLanguageCommunities(region) {\n  const n = ensureLanguageNetwork(region);\n  const cultureNow = {};\n  for (const group of cultureGroups(region)) {\n    const lang = languageForCulture(group);\n    const share = Math.max(0, finite(group.share, 0));\n    if (!cultureNow[lang.languageId]) cultureNow[lang.languageId] = { share: 0, familyId: lang.familyId };\n    cultureNow[lang.languageId].share += share;\n  }\n  const cultureTotal = Object.values(cultureNow).reduce((s, x) => s + x.share, 0) || 1;\n  for (const entry of Object.values(cultureNow)) entry.share /= cultureTotal;\n\n  // Culture/ancestry changes (especially migration) perturb the language population,\n  // but do not overwrite language shift that has happened independently over generations.\n  if (!n.communityShares) {\n    n.communityShares = Object.fromEntries(Object.entries(cultureNow).map(([id, x]) => [id, x.share]));\n    n.lastCultureLanguageShares = { ...n.communityShares };\n  } else {\n    const prior = n.lastCultureLanguageShares || {};\n    const ids = new Set([...Object.keys(cultureNow), ...Object.keys(prior)]);\n    for (const id of ids) {\n      const delta = (cultureNow[id]?.share || 0) - (prior[id] || 0);\n      if (Math.abs(delta) > 1e-9) n.communityShares[id] = Math.max(0, (n.communityShares[id] || 0) + delta);\n    }\n    const total = Object.values(n.communityShares).reduce((s, x) => s + Math.max(0, Number(x) || 0), 0) || 1;\n    for (const id of Object.keys(n.communityShares)) n.communityShares[id] = Math.max(0, Number(n.communityShares[id]) || 0) / total;\n    n.lastCultureLanguageShares = Object.fromEntries(Object.entries(cultureNow).map(([id, x]) => [id, x.share]));\n  }\n\n  const next = {};\n  for (const [id, share] of Object.entries(n.communityShares)) {\n    if (share <= 0.000001) continue;\n    const familyId = cultureNow[id]?.familyId || n.languageMetadata?.[id]?.familyId || n.communities?.[id]?.familyId || `langfam:${id}`;\n    next[id] = { share, familyId };\n  }\n  n.communities = next;\n  const dominant = Object.entries(next).sort((a,b) => b[1].share - a[1].share)[0]?.[0];\n  if (dominant && n.institutions.court.length === 0) n.institutions.court = [dominant];\n  if (dominant && n.institutions.administration.length === 0) n.institutions.administration = [dominant];\n  return n.communities;\n}\n"""
if old not in text:
    raise SystemExit('refreshNativeLanguageCommunities block not found')
text = text.replace(old, new, 1)
p.write_text(text)

p = Path('js/main.js')
text = p.read_text()
old = "import { ensureCommunicationState, tickCommunicationPractices } from './diplomacy/languageCommunication.js?v=20260909-language1';"
new = old + "\nimport { tickGenerationalLanguageChange } from './diplomacy/languageChange.js?v=20260909-language-change1';"
if old not in text:
    raise SystemExit('language communication import not found')
text = text.replace(old, new, 1)
old = "    tickCommunicationPractices(regions, polities, agreements, activeCampaigns, calendarWeek, time.elapsedDays);"
new = old + "\n    const languageChangeEvents = tickGenerationalLanguageChange(regions, time.elapsedDays);"
if old not in text:
    raise SystemExit('communication tick not found')
text = text.replace(old, new, 1)
old = "      ...religionEvents.filter((event) => event.regionId === playerRegionId),"
new = old + "\n      ...languageChangeEvents.filter((event) => event.regionId === playerRegionId),"
if old not in text:
    raise SystemExit('player events insertion point not found')
text = text.replace(old, new, 1)
p.write_text(text)
