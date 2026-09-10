#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
main = ROOT / 'js' / 'main.js'
s = main.read_text()

s = s.replace(
    '// Navigation metadata only: this does not define sovereignty.',
    '// Modern picker labels follow Australian Government recognition. They are navigation metadata only; historical sovereignty still emerges in simulation.',
    1,
)

anchor = "    return groups[sourceGroup] || { continent: 'Other', country: sourceGroup || 'Other' };"
assert anchor in s, 'region-picker navigation fallback not found'
recognised = """    Object.assign(groups, {
      'ALB': { continent: 'Europe', country: 'Albania' },
      'AND': { continent: 'Europe', country: 'Andorra' },
      'ARM': { continent: 'Asia', country: 'Armenia' },
      'AUT': { continent: 'Europe', country: 'Austria' },
      'AZE': { continent: 'Asia', country: 'Azerbaijan' },
      'BEL': { continent: 'Europe', country: 'Belgium' },
      'BGR': { continent: 'Europe', country: 'Bulgaria' },
      'BIH': { continent: 'Europe', country: 'Bosnia and Herzegovina' },
      'BLR': { continent: 'Europe', country: 'Belarus' },
      'CHE': { continent: 'Europe', country: 'Switzerland' },
      'CYP': { continent: 'Europe', country: 'Cyprus' },
      'CZE': { continent: 'Europe', country: 'Czechia' },
      'DEU': { continent: 'Europe', country: 'Germany' },
      'DNK': { continent: 'Europe', country: 'Denmark' },
      'EST': { continent: 'Europe', country: 'Estonia' },
      'FIN': { continent: 'Europe', country: 'Finland' },
      'GEO': { continent: 'Asia', country: 'Georgia' },
      'GGY': { continent: 'Europe', country: 'Guernsey' },
      'GIB': { continent: 'Europe', country: 'Gibraltar' },
      'GRC': { continent: 'Europe', country: 'Greece' },
      'HRV': { continent: 'Europe', country: 'Croatia' },
      'HUN': { continent: 'Europe', country: 'Hungary' },
      'IMN': { continent: 'Europe', country: 'Isle of Man' },
      'IRL': { continent: 'Europe', country: 'Ireland' },
      'ISL': { continent: 'Europe', country: 'Iceland' },
      'ITA': { continent: 'Europe', country: 'Italy' },
      'JEY': { continent: 'Europe', country: 'Jersey' },
      'KOS': { continent: 'Europe', country: 'Kosovo' },
      'LTU': { continent: 'Europe', country: 'Lithuania' },
      'LUX': { continent: 'Europe', country: 'Luxembourg' },
      'LVA': { continent: 'Europe', country: 'Latvia' },
      'MDA': { continent: 'Europe', country: 'Moldova' },
      'MKD': { continent: 'Europe', country: 'North Macedonia' },
      'MNE': { continent: 'Europe', country: 'Montenegro' },
      'NLD': { continent: 'Europe', country: 'Netherlands' },
      'NOR': { continent: 'Europe', country: 'Norway' },
      'POL': { continent: 'Europe', country: 'Poland' },
      'ROU': { continent: 'Europe', country: 'Romania' },
      'RUS': { continent: 'Europe', country: 'Russia' },
      'SRB': { continent: 'Europe', country: 'Serbia' },
      'SVK': { continent: 'Europe', country: 'Slovakia' },
      'SVN': { continent: 'Europe', country: 'Slovenia' },
      'SWE': { continent: 'Europe', country: 'Sweden' },
      'UKR': { continent: 'Europe', country: 'Ukraine' },
      'DZA': { continent: 'Africa', country: 'Algeria' },
      'EGY': { continent: 'Africa', country: 'Egypt' },
      'ESH': { continent: 'Africa', country: 'Western Sahara' },
      'LBY': { continent: 'Africa', country: 'Libya' },
      'MAR': { continent: 'Africa', country: 'Morocco' },
      'TUN': { continent: 'Africa', country: 'Tunisia' },
      'ARE': { continent: 'Asia', country: 'United Arab Emirates' },
      'BHR': { continent: 'Asia', country: 'Bahrain' },
      'IRN': { continent: 'Asia', country: 'Iran' },
      'IRQ': { continent: 'Asia', country: 'Iraq' },
      'ISR': { continent: 'Asia', country: 'Israel' },
      'JOR': { continent: 'Asia', country: 'Jordan' },
      'KWT': { continent: 'Asia', country: 'Kuwait' },
      'LBN': { continent: 'Asia', country: 'Lebanon' },
      'OMN': { continent: 'Asia', country: 'Oman' },
      'PSE': { continent: 'Asia', country: 'Palestine' },
      'QAT': { continent: 'Asia', country: 'Qatar' },
      'SAU': { continent: 'Asia', country: 'Saudi Arabia' },
      'SYR': { continent: 'Asia', country: 'Syria' },
      'TUR': { continent: 'Asia', country: 'Turkey' },
      'YEM': { continent: 'Asia', country: 'Yemen' },
    });

""" + anchor
s = s.replace(anchor, recognised, 1)
main.write_text(s)
print('Aligned modern region picker with Australian-recognition labels')
