from pathlib import Path
root = Path(__file__).resolve().parents[1]

for rel in ['js/diplomacy/relations.js', 'js/society/demographics.js']:
    p = root / rel
    s = p.read_text()
    s = s.replace("culture.js?v=20260907-culture1", "culture.js?v=20260912-culture-scale1")
    p.write_text(s)

p = root / 'js/main.js'
s = p.read_text()
s = s.replace("./society/demographics.js?v=20260912-deep-profiler1", "./society/demographics.js?v=20260912-culture-scale1")
s = s.replace("./diplomacy/relations.js?v=20260912-deep-profiler1", "./diplomacy/relations.js?v=20260912-migration-diplomacy1")
p.write_text(s)
