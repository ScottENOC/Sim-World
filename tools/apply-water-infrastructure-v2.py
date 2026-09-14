from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text()
    if new in text:
        return False
    if old not in text:
        raise RuntimeError(f'anchor not found in {path}: {old[:90]!r}')
    p.write_text(text.replace(old, new, 1))
    return True

# River-control works require an actual river corridor in the region.
replace_once('js/economy/construction.js',
"""    id: 'river_weir', name: 'River weir and diversion works', requiredTechId: 'water_management', unique: true,\n    requiresInfrastructure: 'irrigation', minPopulation: 4000,\n""",
"""    id: 'river_weir', name: 'River weir and diversion works', requiredTechId: 'water_management', unique: true, requiresRiver: true,\n    requiresInfrastructure: 'irrigation', minPopulation: 4000,\n""")
replace_once('js/economy/construction.js',
"""    id: 'reservoir_dam', name: 'Major reservoir dam', requiredTechId: 'hydraulic_engineering', unique: true,\n    requiresInfrastructure: 'river_weir', minPopulation: 12000,\n""",
"""    id: 'reservoir_dam', name: 'Major reservoir dam', requiredTechId: 'hydraulic_engineering', unique: true, requiresRiver: true,\n    requiresInfrastructure: 'river_weir', minPopulation: 12000,\n""")
replace_once('js/economy/construction.js',
"""    (!type.requiresDeposit || Boolean(region.deposits?.[type.requiresDeposit])) &&\n    (!type.minPopulation || (region.population || 0) >= type.minPopulation) &&\n""",
"""    (!type.requiresDeposit || Boolean(region.deposits?.[type.requiresDeposit])) &&\n    (!type.requiresRiver || (region.hydrology?.riverIds || []).length > 0) &&\n    (!type.minPopulation || (region.population || 0) >= type.minPopulation) &&\n""")
replace_once('js/economy/construction.js',
"""      (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) ||\n      (type.minPopulation && (region.population || 0) < type.minPopulation)) return null;\n""",
"""      (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) ||\n      (type.requiresRiver && !(region.hydrology?.riverIds || []).length) ||\n      (type.minPopulation && (region.population || 0) < type.minPopulation)) return null;\n""")

# Persist which real/procedural rivers pass through each region so construction
# availability does not have to rediscover spatial geometry every UI render.
replace_once('js/world/hydrology.js',
"""  for (const region of regions) ensureRegionalHydrology(region);\n  if (!graph?.corridors) return graph;\n""",
"""  for (const region of regions) {\n    const h = ensureRegionalHydrology(region);\n    h.riverIds = [];\n  }\n  if (!graph?.corridors) return graph;\n""")
replace_once('js/world/hydrology.js',
"""    if (!river.hydrology) river.hydrology = { segments: {}, lastUpdatedDay: null };\n  }\n""",
"""    if (!river.hydrology) river.hydrology = { segments: {}, lastUpdatedDay: null };\n    for (const regionId of river.regionIds || []) {\n      const region = regions.find((candidate) => candidate.id === regionId);\n      if (region) {\n        const h = ensureRegionalHydrology(region);\n        if (!h.riverIds.includes(river.id)) h.riverIds.push(river.id);\n      }\n    }\n  }\n""")

old_regulation = """  if (inflow > targetReleaseFlow && stored < capacity) {\n    const capture = Math.min(inflow - targetReleaseFlow, (capacity - stored) / dayScale);\n    outflow -= capture;\n    stored += capture * dayScale;\n  } else if (inflow < targetReleaseFlow && stored > 0) {\n    const release = Math.min(targetReleaseFlow - inflow, stored / dayScale);\n    outflow += release;\n    stored -= release * dayScale;\n  }\n"""
new_regulation = """  const priority = region?.waterPolicy?.operatingPriority || 'balanced';\n  const isFloodPulse = inflow > naturalFlow * 1.18;\n  // Ordinary operation aims for the chosen target fill. Flood-control operation\n  // deliberately preserves empty capacity, but may use that spare capacity when\n  // a real high-flow pulse arrives. This makes timing matter even when annual\n  // inflow and outflow are almost equal.\n  const desiredCeiling = isFloodPulse && priority === 'flood_control' ? capacity : targetStorage;\n  if (inflow > targetReleaseFlow && stored < desiredCeiling) {\n    const capture = Math.min(inflow - targetReleaseFlow, (desiredCeiling - stored) / dayScale);\n    outflow -= capture;\n    stored += capture * dayScale;\n  } else if ((inflow < targetReleaseFlow || stored > targetStorage) && stored > 0) {\n    const releaseForFlow = Math.max(0, targetReleaseFlow - inflow);\n    const releaseForLevel = Math.max(0, stored - targetStorage) / dayScale;\n    const release = Math.min(Math.max(releaseForFlow, releaseForLevel), stored / dayScale);\n    outflow += release;\n    stored -= release * dayScale;\n  }\n"""
replace_once('js/world/hydrology.js', old_regulation, new_regulation)

print('water infrastructure v2 siting and reservoir operation applied')
