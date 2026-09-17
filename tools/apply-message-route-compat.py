#!/usr/bin/env python3
from pathlib import Path
p=Path('js/diplomacy/messageRouting.js')
s=p.read_text()
old="  return {mode:legs.length===1?legs[0].mode:'multimodal',legs,days:legs.reduce((s,l)=>s+l.days,0),regionIds,seaIds,modes};"
new="  const singleMode=legs.length===1?(legs[0].mode==='horse'?'land':legs[0].mode):'multimodal';\n  return {mode:singleMode,legs,days:legs.reduce((s,l)=>s+l.days,0),regionIds,seaIds,modes};"
if old not in s:
    raise RuntimeError('message route summary anchor missing')
p.write_text(s.replace(old,new,1))
print('message route compatibility applied')
