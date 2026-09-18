from pathlib import Path
p=Path('js/diplomacy/couriers.js')
t=p.read_text()
t=t.replace('messageRouteBetween(origin,target,regionsById)', 'messageRouteBetween(origin, target, regionsById)')
p.write_text(t)
print('courier routing compatibility formatting applied')
