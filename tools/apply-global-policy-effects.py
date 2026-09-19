from pathlib import Path

def patch(path,repls):
    p=Path(path); text=p.read_text()
    for old,new in repls:
        if new in text: continue
        if old not in text: raise SystemExit(f'missing anchor {path}: {old[:100]!r}')
        text=text.replace(old,new,1)
    p.write_text(text)

patch('js/world/climateChange.js',[
("function fossilCarbonFlux(regions) {\n  // Proto-industry reports physical coal burned during its previous operating tick.\n  // This is deliberately an abstract carbon index rather than atmospheric ppm.\n  return regions.reduce((sum, region) => sum + positive(region?.protoIndustry?.coalHeatUse), 0) * 0.00002;\n}",
 "function fossilCarbonFlux(regions) {\n  // International commitments are not magic: they represent the fraction of\n  // otherwise-emitting activity actually avoided through member-state policy,\n  // efficiency, substitution and enforcement. Weak/illegitimate organisations\n  // generate low commitments and therefore little physical effect.\n  return regions.reduce((sum, region) => {\n    const commitment = clamp(region?.internationalPolicy?.climateCommitment || 0, 0, 1);\n    const abatement = 1 - commitment * 0.65;\n    return sum + positive(region?.protoIndustry?.coalHeatUse) * abatement;\n  }, 0) * 0.00002;\n}")
])

patch('js/society/externalities.js',[
("export function tickExternalities(region, elapsedDays = 7) {\n  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;\n  const e = ensureExternalities(region);",
 "export function tickExternalities(region, elapsedDays = 7) {\n  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;\n  const e = ensureExternalities(region);\n  const internationalPollution = clamp01(region.internationalPolicy?.pollutionCommitment || 0);\n  if (internationalPollution > 0) {\n    for (const [hazardId, knowledge] of Object.entries(e.knowledge || {})) {\n      if (!knowledge?.recognised) continue;\n      e.regulation[hazardId] = Math.max(clamp01(e.regulation[hazardId] || 0), internationalPollution * 0.75);\n    }\n  }")
])
print('global policy effects applied')
