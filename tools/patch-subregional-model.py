from pathlib import Path
p = Path('js/military/subregionalControl.js')
s = p.read_text()
old = "    const places = [];\n    const principalKind = (principal.population || 0) >= 5000 ? 'city' : (principal.population || 0) >= 1000 ? 'town' : 'principal_settlement';\n    places.push(place(`${region.id}:principal`, principal.name || region.name, principalKind, sovereign, 1, principal.population || 0));\n    if (region.isCoastal) places.push(place(`${region.id}:port`, `${region.name} harbour`, 'port', sovereign, 0.92, Math.min(principal.population || 0, Math.max(100, (principal.population || 0) * 0.22))));"
new = "    const places = [];\n    const principalPopulation = Math.max(0, principal.population || 0, region.urbanisation?.urbanPopulation || 0);\n    const principalKind = principalPopulation >= 5000 ? 'city' : principalPopulation >= 1000 ? 'town' : 'principal_settlement';\n    places.push(place(`${region.id}:principal`, principal.name || region.name, principalKind, sovereign, 1, principalPopulation));\n    if (region.isCoastal) places.push(place(`${region.id}:port`, `${region.name} harbour`, 'port', sovereign, 0.92, Math.min(principalPopulation, Math.max(100, principalPopulation * 0.22))));"
if 'const principalPopulation =' not in s:
    assert old in s
    s = s.replace(old, new)
p.write_text(s)
print('subregional model patch applied')
