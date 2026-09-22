from pathlib import Path
p=Path('index.html')
s=p.read_text()
old="          report('Simulation module loaded · starting world setup…');\n"
if old not in s:
    raise SystemExit('loader completion report not found')
p.write_text(s.replace(old,'',1))
