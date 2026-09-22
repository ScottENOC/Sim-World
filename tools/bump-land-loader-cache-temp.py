from pathlib import Path
main=Path('js/main.js')
s=main.read_text()
old="./world/region.js?v=20260912-silkroad1"
new="./world/region.js?v=20260922-land-loader1"
if old not in s: raise SystemExit('region import cache anchor not found')
main.write_text(s.replace(old,new,1))
idx=Path('index.html')
s=idx.read_text()
old="./js/main.js?v=20260922-main-graph1"
new="./js/main.js?v=20260922-main-graph2"
if old not in s: raise SystemExit('main graph cache anchor not found')
idx.write_text(s.replace(old,new,1))
