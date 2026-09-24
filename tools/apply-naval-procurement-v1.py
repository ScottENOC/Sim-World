from pathlib import Path

# Class-aware naval procurement is part of the runtime. Keep this helper
# idempotent for CI and validate the current authoritative architecture rather
# than trying to re-apply the original scalar-target patch.
labor_path = Path('js/economy/laborCore.js')
labor = labor_path.read_text()
fleet = Path('js/military/fleets.js').read_text()
region = Path('js/world/region.js').read_text()
ui = Path('js/ui/mobileGameplayControls.js').read_text()

required = [
    'ensureNavalProcurement',
    'navalConstructionProfile',
    'buildWarshipClass',
    'WARSHIP_BUILD_COST',
    'completedByClass',
    'procurement.built',
]
combined = fleet + labor
if not all(marker in combined for marker in required):
    raise SystemExit('class-aware naval procurement runtime is incomplete')
if 'this.navalProcurement' not in region:
    raise SystemExit('regional naval procurement state is missing')
if 'setNavalClassTarget' not in ui:
    raise SystemExit('player class-specific naval procurement UI is missing')
for obsolete in ('targetNavySize', 'input-navy', 'council-navy-target'):
    if obsolete in combined + region + ui:
        raise SystemExit(f'obsolete scalar naval procurement marker remains: {obsolete}')

print('class-aware naval procurement already integrated')
