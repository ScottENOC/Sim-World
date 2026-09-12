from pathlib import Path
p=Path('js/politics/medievalStateSystems.js')
s=p.read_text()
s=s.replace("  const technicalTarget = clamp((s.urban.industrialSpecialisation || 0) * 0.42 + (hasTech(region, 'steelmaking') ? 0.22 : 0) + (hasTech(region, 'gunpowder') ? 0.18 : 0) + (hasTech(region, 'ocean_going_sailing') ? 0.18 : 0);", "  const technicalTarget = clamp((s.urban.industrialSpecialisation || 0) * 0.42 + (hasTech(region, 'steelmaking') ? 0.22 : 0) + (hasTech(region, 'gunpowder') ? 0.18 : 0) + (hasTech(region, 'ocean_going_sailing') ? 0.18 : 0));")
p.write_text(s)
