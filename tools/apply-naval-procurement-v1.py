from pathlib import Path

# Runtime integration is already committed on this branch. Keep this helper
# idempotent for CI and patch the one legacy report reference that still used
# the removed aggregate navyBuild object.
labor_path = Path('js/economy/laborCore.js')
labor = labor_path.read_text()
old = """    report.boatmaking = { workers: Math.round(boatMakers), navyBoats: navyBuild.built,
      advancedNavyBoats: navyBuild.advanced, fishingBoats: fishBuild.built,
      advancedFishingBoats: fishBuild.advanced, newBoatsForMarket: marketBuild.built };"""
new = """    report.boatmaking = { workers: Math.round(boatMakers), navyBoats: navyBuilt,
      advancedNavyBoats: navyAdvancedBuilt, navalClasses: { ...(procurement.built || {}) }, fishingBoats: fishBuild.built,
      advancedFishingBoats: fishBuild.advanced, newBoatsForMarket: marketBuild.built };"""
if old in labor:
    labor_path.write_text(labor.replace(old, new, 1))
elif new not in labor:
    raise SystemExit('class-aware naval procurement runtime is incomplete')

fleet = Path('js/military/fleets.js').read_text()
region = Path('js/world/region.js').read_text()
required = ['desiredWarshipComposition', 'ensureNavalProcurement', 'explicitTargets', 'buildWarshipClass', 'WARSHIP_BUILD_COST']
combined = fleet + labor_path.read_text()
if not all(marker in combined for marker in required) or 'this.navalProcurement' not in region:
    raise SystemExit('class-aware naval procurement runtime is incomplete')
print('class-aware naval procurement already integrated')
