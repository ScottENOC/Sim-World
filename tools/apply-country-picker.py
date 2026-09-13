#!/usr/bin/env python3
from pathlib import Path

main_path = Path('js/main.js')
text = main_path.read_text()

old = "  const toolTypes = await (await fetch('data/world/toolTypes.json?v=20260904-weather1')).json();\n"
new = "  const [toolTypes, regionNavigation] = await Promise.all([\n    fetch('data/world/toolTypes.json?v=20260904-weather1').then((response) => response.json()),\n    fetch('data/world/region-navigation.json?v=20260913-country-picker1').then((response) => response.json()),\n  ]);\n"
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise RuntimeError('toolTypes integration anchor missing')

text = text.replace('  showRegionPicker(regions, (chosen) => {', '  showRegionPicker(regions, regionNavigation, (chosen) => {', 1)
text = text.replace('function showRegionPicker(regions, onChosen) {', 'function showRegionPicker(regions, navigationIndex, onChosen) {', 1)

start = text.find('  // Navigation metadata only: this does not define sovereignty.')
end_marker = '  const entries = regions.map((region) => ({ region, ...navigationForRegion(region) }));\n'
end = text.find(end_marker, start)
if start >= 0 and end >= 0:
    end += len(end_marker)
    replacement = """  // Modern countries/territories are a navigation index only. They never define\n  // simulation sovereignty, culture, region borders or ownership. A simulation\n  // region can deliberately appear under several countries if a present-day\n  // border crosses it.\n  const entries = regions.flatMap((region) => {\n    const memberships = navigationIndex?.regions?.[region.id] || [];\n    return memberships.map((membership) => ({ region, ...membership }));\n  });\n"""
    text = text[:start] + replacement + text[end:]
elif 'const memberships = navigationIndex?.regions?.[region.id]' not in text:
    raise RuntimeError('navigation picker block anchor missing')

text = text.replace("        `${countryCount} ${countryCount === 1 ? 'area' : 'areas'} · ${matches.length} regions`,", "        `${countryCount} ${countryCount === 1 ? 'country' : 'countries'} · ${new Set(matches.map((entry) => entry.region.id)).size} regions`,")
text = text.replace("    pickerHelp.textContent = 'Choose a country or geographic grouping.';", "    pickerHelp.textContent = 'Choose a modern country or territory.';")
text = text.replace("      .map((entry) => entry.region)\n      .sort((a, b) => alphabetically(a.name, b.name));", "      .map((entry) => entry.region)\n      .filter((region, index, array) => array.findIndex((other) => other.id === region.id) === index)\n      .sort((a, b) => alphabetically(a.name, b.name));")

main_path.write_text(text)

index_path = Path('index.html')
index = index_path.read_text()
css_anchor = '<link rel="stylesheet" href="css/main.css?v=20260904-build1">'
mobile_css = '<link rel="stylesheet" href="css/mobile-fixes.css?v=20260913-menu-scroll1">'
if mobile_css not in index:
    if css_anchor not in index:
        raise RuntimeError('main stylesheet anchor missing')
    index = index.replace(css_anchor, css_anchor + '\n' + mobile_css, 1)
index = index.replace('js/ui/startupPicker.js?v=20260907-startup1', 'js/ui/startupPicker.js?v=20260913-country-picker1')
index_path.write_text(index)

print('Country-navigation runtime picker and mobile menu integration applied')
