from pathlib import Path

# Wire policy effects into polity administration.
p = Path('js/politics/polities.js')
text = p.read_text()
needle = "import { monumentalPrestige } from '../economy/construction.js?v=20260906-prestige1';"
replacement = needle + "\nimport { languagePolicyAdministrativeEffects } from './languagePolicy.js?v=20260909-language-policy1';"
if replacement not in text:
    text = text.replace(needle, replacement, 1)
old = """  const delegationBonus = 1 + delegatedCount * admin.delegation * 0.04;\n  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus /\n    (distanceBurden * scaleBurden * resistance), 0.05, 0.95);"""
new = """  const delegationBonus = 1 + delegatedCount * admin.delegation * 0.04;\n  const languageEffects = languagePolicyAdministrativeEffects(region);\n  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus *\n    (languageEffects.controlMultiplier || 1) / (distanceBurden * scaleBurden * resistance), 0.05, 0.95);"""
text = text.replace(old, new, 1)
old = """      governance.reportDelayWeeks = Math.max(1, Math.round((centroidDistanceKm(capital, subject) || 100) /\n        (35 + admin.communications * 100) * (writing ? 0.65 : 1)));"""
new = """      const languageEffects = languagePolicyAdministrativeEffects(subject);\n      governance.reportDelayWeeks = Math.max(1, Math.round((centroidDistanceKm(capital, subject) || 100) /\n        (35 + admin.communications * 100) * (writing ? 0.65 : 1) * (languageEffects.reportDelayMultiplier || 1)));"""
text = text.replace(old, new, 1)
old = """      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08, 0.08, 0.85);"""
new = """      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08 + (languageEffects.corruptionDelta || 0), 0.08, 0.85);"""
text = text.replace(old, new, 1)
p.write_text(text)

# Feed language policy into long-run language shift.
p = Path('js/diplomacy/languageChange.js')
text = p.read_text()
old = """  const culture = network.institutions?.cultural?.includes(languageId) ? 0.15 : 0;\n  const concentration = clamp((share - 0.03) / 0.35);"""
new = """  const culture = network.institutions?.cultural?.includes(languageId) ? 0.15 : 0;\n  const policyRetention = Number(network.languagePolicyRetention?.[languageId] || 0);\n  const concentration = clamp((share - 0.03) / 0.35);"""
text = text.replace(old, new, 1)
old = """  return clamp(0.22 + concentration * 0.35 + rural * 0.12 + institutional * 0.18 + religion + culture);"""
new = """  return clamp(0.22 + concentration * 0.35 + rural * 0.12 + institutional * 0.18 + religion + culture + policyRetention);"""
text = text.replace(old, new, 1)
old = """  const attraction = clamp(toShare * 0.28 + institutionalWeight(n, toLanguageId) * 0.32 + prestigeWeight(n, toLanguageId) * 0.22 + secondLanguagePressure(n, toLanguageId) * 0.28);"""
new = """  const policyPressure = Math.max(0, Number(n.languagePolicyPressure?.[toLanguageId] || 0));\n  const attraction = clamp(toShare * 0.28 + institutionalWeight(n, toLanguageId) * 0.32 + prestigeWeight(n, toLanguageId) * 0.22 + secondLanguagePressure(n, toLanguageId) * 0.28 + policyPressure * 0.35);"""
text = text.replace(old, new, 1)
p.write_text(text)

# Main loop and player UI.
p = Path('js/main.js')
text = p.read_text()
needle = "import { tickGenerationalLanguageChange } from './diplomacy/languageChange.js?v=20260909-language-change1';"
replacement = needle + "\nimport { LANGUAGE_POLICIES, ensureRegionalLanguagePolicy, regionalLanguagePolicyAssessment, setRegionalLanguagePolicy, tickRegionalLanguagePolicies } from './politics/languagePolicy.js?v=20260909-language-policy1';"
if replacement not in text:
    text = text.replace(needle, replacement, 1)
old = """    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);"""
new = """    const languagePolicyEvents = tickRegionalLanguagePolicies(regions, polities, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId });\n    const polityEvents = tickPolities(polities, regions, calendarWeek, time.elapsedDays);"""
text = text.replace(old, new, 1)
old = """      ...polityEvents.filter((event) => event.regionId === playerRegionId),"""
new = """      ...languagePolicyEvents.filter((event) => event.polityId === activePlayerPolityId),\n      ...polityEvents.filter((event) => event.regionId === playerRegionId),"""
text = text.replace(old, new, 1)
old = """  const reportAge = governance.lastReport ? clock.tickIndex - governance.lastReport.asOfTick : null;\n  document.getElementById('region-controls').innerHTML = `"""
new = """  const reportAge = governance.lastReport ? clock.tickIndex - governance.lastReport.asOfTick : null;\n  const languagePolicy = ensureRegionalLanguagePolicy(region);\n  const languageAssessment = regionalLanguagePolicyAssessment(region, capital, polity);\n  const languageDifference = languageAssessment.mismatch ? 'Local and state languages differ.' : 'Local and state language are currently the same.';\n  document.getElementById('region-controls').innerHTML = `"""
text = text.replace(old, new, 1)
old = """    <div class=\"raid-status\">Governor: ${governance.governor?.type?.replaceAll('_', ' ') || 'none'} · competence ${((governance.governor?.competence || 0) * 100).toFixed(0)}% · loyalty ${((governance.governor?.loyalty || 0) * 100).toFixed(0)}%</div>\n    <div class=\"delegated-powers\">"""
new = """    <div class=\"raid-status\">Governor: ${governance.governor?.type?.replaceAll('_', ' ') || 'none'} · competence ${((governance.governor?.competence || 0) * 100).toFixed(0)}% · loyalty ${((governance.governor?.loyalty || 0) * 100).toFixed(0)}%</div>\n    <div class=\"raid-section\"><strong>Administrative language</strong>\n      <label class=\"control-row\">Policy\n        <select id=\"subject-language-policy\">\n          <option value=\"local\" ${languagePolicy.mode === 'local' ? 'selected' : ''}>Use the local language</option>\n          <option value=\"bilingual\" ${languagePolicy.mode === 'bilingual' ? 'selected' : ''} ${governance.relationship === 'vassal' ? 'disabled' : ''}>Bilingual administration</option>\n          <option value=\"state\" ${languagePolicy.mode === 'state' ? 'selected' : ''} ${governance.relationship === 'vassal' ? 'disabled' : ''}>Use the state language</option>\n        </select>\n      </label>\n      <div id=\"subject-language-policy-info\" class=\"raid-status\">${languageDifference}<br>\n        Estimated administrative cost ${languageAssessment.costPerWeek.toFixed(2)}/week · control effect ${Math.round((languageAssessment.controlMultiplier - 1) * 100)}% · report delay ${Math.round((languageAssessment.reportDelayMultiplier - 1) * 100)}% · corruption ${languageAssessment.corruptionDelta >= 0 ? '+' : ''}${Math.round(languageAssessment.corruptionDelta * 100)} points.<br>\n        ${languagePolicy.mode === 'local' ? 'Best local legitimacy and language retention, but central oversight is weaker.' : languagePolicy.mode === 'bilingual' ? 'Best compromise when properly staffed, but it consumes more money and scarce bilingual officials.' : 'Cheap and potentially efficient once widely understood, but initially disruptive and assimilationist where the population does not speak it.'}</div>\n    </div>\n    <div class=\"delegated-powers\">"""
text = text.replace(old, new, 1)
old = """  wirePolicy('subject-autonomy', 'subject-autonomy-label', 'autonomy');\n  document.getElementById('subject-form').addEventListener('change', (event) => {"""
new = """  wirePolicy('subject-autonomy', 'subject-autonomy-label', 'autonomy');\n  document.getElementById('subject-language-policy')?.addEventListener('change', (event) => {\n    const result = setRegionalLanguagePolicy(region, event.target.value, { playerChoice: true, currentTick: clock.tickIndex });\n    if (result.changed) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);\n  });\n  document.getElementById('subject-form').addEventListener('change', (event) => {"""
text = text.replace(old, new, 1)
p.write_text(text)
