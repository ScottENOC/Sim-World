from pathlib import Path
import subprocess
import sys

path = Path('js/main.js')
text = path.read_text()

# The near-global map expansion originally patched physical-zone labels into the
# startup picker. Modern-country navigation now lives in region-navigation.json
# and is deliberately separate from the simulation's physical regions. If that
# architecture is present, do not rewrite it back to physical groupings.
country_picker_present = (
    'region-navigation.json' in text
    and 'navigationIndex?.regions?.[region.id]' in text
)

if not country_picker_present:
    old = """  const navigationForRegion = (region) => {\n    const sourceGroup = region.feature?.properties?.sourceGroup;\n    const name = region.name;\n\n    // Spain's dataset spans two continents.\n"""
    new = """  const navigationForRegion = (region) => {\n    const sourceGroup = region.feature?.properties?.sourceGroup;\n    const name = region.name;\n    const navigationContinent = region.feature?.properties?.navigationContinent;\n    const navigationGroup = region.feature?.properties?.navigationGroup;\n\n    // Geography-first expansion regions carry picker metadata explicitly.\n    // It is navigation only and never defines sovereignty or a modern state.\n    if (navigationContinent && navigationGroup) {\n      return { continent: navigationContinent, country: navigationGroup };\n    }\n\n    // Spain's dataset spans two continents.\n"""
    if new not in text:
        if old not in text:
            raise RuntimeError('Region-picker navigation anchor not found in js/main.js')
        text = text.replace(old, new, 1)
        path.write_text(text)
else:
    print('Modern-country picker detected; skipping obsolete physical-zone picker patch')

# Keep narrow/strategic sea regions ahead of broad ocean basins so the additive
# sea builder cannot consume them first. This is idempotent.
subprocess.run([sys.executable, 'tools/apply-old-world-sea-order-fix.py'], check=True)
print('Old World / Asia-Pacific runtime integration applied')
