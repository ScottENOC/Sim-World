from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'Expected integration anchor missing in {path}: {old[:140]!r}')
    p.write_text(text.replace(old, new, 1))
    return True


replace_once(
    'js/politics/medievalStateSystems.js',
    "import { tickCivilWarFactionPolitics } from './civilWarFactions.js?v=20260913-civil-war2';\n",
    "import { tickCivilWarFactionPolitics } from './civilWarFactions.js?v=20260913-civil-war2';\nimport { successionEliteModifier, tickStateAdministrationElitePolitics } from './stateAdministrationElitePolitics.js?v=20260913-state-admin2';\n",
)

replace_once(
    'js/politics/medievalStateSystems.js',
    "function claimantSupport(region, polity, claimant) {\n  const local = ensureMedievalPoliticalState(region); const s = ensureMedievalSociety(region);\n  const admin = polity.administration || {};\n  if (claimant.kind === 'designated_heir') return clamp((admin.legitimacy || 0) * 0.42 + (admin.officialdom || 0) * 0.24 + (region.governance?.administrativeControl || 0) * 0.22 + (1 - local.grievance) * 0.12);\n  if (claimant.kind === 'military_elite') return clamp(s.estates.privateRetinues * 0.34 + local.eliteOrganisation * 0.28 + local.localDefence * 0.2 + (1 - (admin.officialdom || 0)) * 0.18);\n  return clamp(local.localIdentity * 0.34 + local.grievance * 0.3 + (region.governance?.autonomy || 0) * 0.2 + s.urban.council * 0.16);\n}\n",
    "function claimantSupport(region, polity, claimant) {\n  const local = ensureMedievalPoliticalState(region); const s = ensureMedievalSociety(region);\n  const admin = polity.administration || {};\n  let base;\n  if (claimant.kind === 'designated_heir') base = clamp((admin.legitimacy || 0) * 0.42 + (admin.officialdom || 0) * 0.24 + (region.governance?.administrativeControl || 0) * 0.22 + (1 - local.grievance) * 0.12);\n  else if (claimant.kind === 'military_elite') base = clamp(s.estates.privateRetinues * 0.34 + local.eliteOrganisation * 0.28 + local.localDefence * 0.2 + (1 - (admin.officialdom || 0)) * 0.18);\n  else base = clamp(local.localIdentity * 0.34 + local.grievance * 0.3 + (region.governance?.autonomy || 0) * 0.2 + s.urban.council * 0.16);\n  return clamp(base * successionEliteModifier(polity, claimant.kind));\n}\n",
)

replace_once(
    'js/politics/medievalStateSystems.js',
    "    for (const region of territories) { updateRegionInstitutions(region, polity, years); ensureUrbanPlaces(region); }\n    const succession = ensureSuccessionState(polity);\n",
    "    for (const region of territories) { updateRegionInstitutions(region, polity, years); ensureUrbanPlaces(region); }\n    events.push(...tickStateAdministrationElitePolitics(polity, territories, currentTick, elapsedDays, rng, options));\n    const succession = ensureSuccessionState(polity);\n",
)

replace_once(
    'js/politics/polities.js',
    "  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus *\n    (languageEffects.controlMultiplier || 1) / (distanceBurden * scaleBurden * resistance), 0.05, 0.95);\n",
    "  const elitePoliticsMultiplier = clamp(region.governance?.elitePoliticsControlMultiplier ?? 1, 0.6, 1.1);\n  return clamp(institutional * autonomyLimit * governorFactor * delegationBonus *\n    (languageEffects.controlMultiplier || 1) * elitePoliticsMultiplier / (distanceBurden * scaleBurden * resistance), 0.05, 0.95);\n",
)

replace_once(
    'js/politics/polities.js',
    "      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08 + (languageEffects.corruptionDelta || 0), 0.08, 0.85);\n",
    "      governance.corruption = clamp(0.78 - admin.accounting * 0.28 - admin.recordKeeping * 0.25 -\n        governance.administrativeControl * 0.2 - (governance.governor?.competence || 0) * 0.08 +\n        (1 - (governance.governor?.loyalty || 0.5)) * 0.08 + (languageEffects.corruptionDelta || 0) +\n        (governance.elitePoliticsCorruptionDelta || 0), 0.08, 0.85);\n",
)

replace_once(
    'js/politics/medievalInstitutions.js',
    "  const grievance = clamp(insecure * (1 - protection) * 0.38 + tribute * 0.18 + religion * 0.18 +\n    (1 - clamp(region.governance?.administrativeControl ?? 0.3)) * 0.12 + (1 - clamp(region.stability ?? 0.7)) * 0.14);\n",
    "  const grievance = clamp(insecure * (1 - protection) * 0.38 + tribute * 0.18 + religion * 0.18 +\n    (1 - clamp(region.governance?.administrativeControl ?? 0.3)) * 0.12 + (1 - clamp(region.stability ?? 0.7)) * 0.14 +\n    clamp(region.governance?.elitePoliticsGrievance || 0) * 0.7);\n",
)

print('State administration and elite politics v2 integration applied')
