from pathlib import Path

path = Path('js/main.js')
text = path.read_text()
old = """  const navigationForRegion = (region) => {\n    const sourceGroup = region.feature?.properties?.sourceGroup;\n    const name = region.name;\n\n    // Spain's dataset spans two continents.\n"""
new = """  const navigationForRegion = (region) => {\n    const sourceGroup = region.feature?.properties?.sourceGroup;\n    const name = region.name;\n    const navigationContinent = region.feature?.properties?.navigationContinent;\n    const navigationGroup = region.feature?.properties?.navigationGroup;\n\n    // Geography-first expansion regions carry picker metadata explicitly.\n    // It is navigation only and never defines sovereignty or a modern state.\n    if (navigationContinent && navigationGroup) {\n      return { continent: navigationContinent, country: navigationGroup };\n    }\n\n    // Spain's dataset spans two continents.\n"""
if new not in text:
    if old not in text:
        raise RuntimeError('Region-picker navigation anchor not found in js/main.js')
    text = text.replace(old, new, 1)
    path.write_text(text)
print('Old World / Asia-Pacific runtime integration applied')
