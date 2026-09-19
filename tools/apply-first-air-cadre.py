from pathlib import Path
p=Path('js/military/aviation.js');text=p.read_text()
old="""  const family=ownerType==='military'?familyForRole(role):null,productId=productForRole(role);
  let design=null;
"""
new="""  const family=ownerType==='military'?familyForRole(role):null,productId=productForRole(role),foundingMilitaryCadre=ownerType==='military'&&!region.qualifiedMilitaryPersonnel;
  let design=null;
"""
if new not in text:
    if old not in text:raise SystemExit('missing first cadre anchor')
    text=text.replace(old,new,1)
old2="""  ensureAviation(region).aircraft.push(aircraft); if(ownerType==='military')assignAircraftCrew(region,aircraft); return aircraft;
"""
new2="""  ensureAviation(region).aircraft.push(aircraft); if(ownerType==='military')assignAircraftCrew(region,aircraft,{bootstrap:foundingMilitaryCadre}); return aircraft;
"""
if new2 not in text:
    if old2 not in text:raise SystemExit('missing crew assign anchor')
    text=text.replace(old2,new2,1)
p.write_text(text)
print('first military aviation cadre applied')
