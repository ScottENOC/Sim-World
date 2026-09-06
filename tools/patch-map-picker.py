from pathlib import Path

path = Path('js/main.js')
text = path.read_text()
text = text.replace(
    "console.log(`Western Europe map loaded: ${regions.length} permanent land regions`);",
    "console.log(`Simulation map loaded: ${regions.length} permanent land regions`);"
)
needle = "      'GGY': { continent: 'Europe', country: 'Guernsey' },\n"
insert = needle + """      'ITA': { continent: 'Europe', country: 'Italy' },
      'GRC': { continent: 'Europe', country: 'Greece' },
      'TUR': { continent: 'Asia', country: 'Anatolia' },
      'CYP': { continent: 'Asia', country: 'Cyprus' },
      'SYR': { continent: 'Asia', country: 'Syria' },
      'LBN': { continent: 'Asia', country: 'Levant' },
      'ISR': { continent: 'Asia', country: 'Southern Levant' },
      'PSE': { continent: 'Asia', country: 'Southern Levant' },
      'JOR': { continent: 'Asia', country: 'Transjordan' },
      'IRQ': { continent: 'Asia', country: 'Mesopotamia' },
      'IRN': { continent: 'Asia', country: 'Western Iran' },
      'EGY': { continent: 'Africa', country: 'Egypt' },
      'LBY': { continent: 'Africa', country: 'Libya' },
      'TUN': { continent: 'Africa', country: 'Tunisia' },
"""
if needle not in text:
    raise SystemExit('picker insertion point not found')
if "'ITA': { continent: 'Europe', country: 'Italy' }" not in text:
    text = text.replace(needle, insert)
path.write_text(text)
