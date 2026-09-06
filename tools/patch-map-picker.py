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
      'ALB': { continent: 'Europe', country: 'Albania' },
      'MKD': { continent: 'Europe', country: 'Macedonia' },
      'BGR': { continent: 'Europe', country: 'Bulgaria' },
      'SRB': { continent: 'Europe', country: 'Serbia' },
      'MNE': { continent: 'Europe', country: 'Montenegro' },
      'BIH': { continent: 'Europe', country: 'Bosnia & Herzegovina' },
      'HRV': { continent: 'Europe', country: 'Croatia' },
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
existing_start = "      'ITA': { continent: 'Europe', country: 'Italy' },\n"
if existing_start in text:
    start = text.index(existing_start)
    end_marker = "      'TUN': { continent: 'Africa', country: 'Tunisia' },\n"
    end = text.index(end_marker, start) + len(end_marker)
    text = text[:start] + insert[len(needle):] + text[end:]
else:
    text = text.replace(needle, insert)
path.write_text(text)
