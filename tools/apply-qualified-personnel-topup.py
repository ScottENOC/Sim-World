from pathlib import Path
p=Path('js/military/qualifiedPersonnel.js');text=p.read_text()
def rep(old,new):
    global text
    if new in text:return
    if old not in text:raise SystemExit(f'missing: {old[:100]!r}')
    text=text.replace(old,new,1)
rep("""export function assignAircraftCrew(region,aircraft,{bootstrap=false}={}){
  if(!aircraft||aircraft.ownerType!=='military')return null;if(aircraft.crewAssignment)return aircraft.crewAssignment;
  const need=aircraftCrewRequirements(aircraft);
  if(bootstrap){addToPool(region,PERSONNEL_TYPES.PILOT,need.pilot,.12);addToPool(region,PERSONNEL_TYPES.AIRCREW,need.aircrew,.10);}
  const pilots=takeFromPool(region,PERSONNEL_TYPES.PILOT,need.pilot),crew=takeFromPool(region,PERSONNEL_TYPES.AIRCREW,need.aircrew);
  aircraft.crewAssignment={pilots:pilots.count,pilotExperience:pilots.experience,aircrew:crew.count,aircrewExperience:crew.experience};
  aircraft.pilotExperience=Math.max(aircraft.pilotExperience||0,pilots.experience);
  return aircraft.crewAssignment;
}
""","""export function assignAircraftCrew(region,aircraft,{bootstrap=false}={}){
  if(!aircraft||aircraft.ownerType!=='military')return null;const need=aircraftCrewRequirements(aircraft),a=aircraft.crewAssignment||{pilots:0,pilotExperience:0,aircrew:0,aircrewExperience:0};
  if(bootstrap&&!aircraft.crewAssignment){addToPool(region,PERSONNEL_TYPES.PILOT,need.pilot,.12);addToPool(region,PERSONNEL_TYPES.AIRCREW,need.aircrew,.10);}
  const pilotGap=Math.max(0,need.pilot-(a.pilots||0)),crewGap=Math.max(0,need.aircrew-(a.aircrew||0)),pilots=takeFromPool(region,PERSONNEL_TYPES.PILOT,pilotGap),crew=takeFromPool(region,PERSONNEL_TYPES.AIRCREW,crewGap);
  const oldPilots=a.pilots||0,oldCrew=a.aircrew||0;a.pilotExperience=(oldPilots*a.pilotExperience+pilots.count*pilots.experience)/Math.max(1e-9,oldPilots+pilots.count);a.aircrewExperience=(oldCrew*a.aircrewExperience+crew.count*crew.experience)/Math.max(1e-9,oldCrew+crew.count);a.pilots=oldPilots+pilots.count;a.aircrew=oldCrew+crew.count;
  aircraft.crewAssignment=a;aircraft.pilotExperience=Math.max(aircraft.pilotExperience||0,a.pilotExperience||0);return a;
}
""")
rep("""export function assignShipCrew(region,ship,{bootstrap=false}={}){
  if(!ship)return null;if(ship.crewAssignment)return ship.crewAssignment;const need=shipCrewRequirements(ship);
  if(bootstrap){addToPool(region,PERSONNEL_TYPES.SAILOR,need.sailor,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer,.16);}
  const sailors=takeFromPool(region,PERSONNEL_TYPES.SAILOR,need.sailor),tech=takeFromPool(region,PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical),officers=takeFromPool(region,PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer);
  ship.crewRequired=need.total;ship.crewAssignment={sailors:sailors.count,sailorExperience:sailors.experience,technical:tech.count,technicalExperience:tech.experience,officers:officers.count,officerExperience:officers.experience};return ship.crewAssignment;
}
""","""export function assignShipCrew(region,ship,{bootstrap=false}={}){
  if(!ship)return null;const need=shipCrewRequirements(ship),a=ship.crewAssignment||{sailors:0,sailorExperience:0,technical:0,technicalExperience:0,officers:0,officerExperience:0};
  if(bootstrap&&!ship.crewAssignment){addToPool(region,PERSONNEL_TYPES.SAILOR,need.sailor,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical,.12);addToPool(region,PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer,.16);}
  for(const [key,type,required,expKey] of [['sailors',PERSONNEL_TYPES.SAILOR,need.sailor,'sailorExperience'],['technical',PERSONNEL_TYPES.NAVAL_TECH,need.naval_technical,'technicalExperience'],['officers',PERSONNEL_TYPES.NAVAL_OFFICER,need.naval_officer,'officerExperience']]){const old=a[key]||0,taken=takeFromPool(region,type,Math.max(0,required-old));a[expKey]=(old*(a[expKey]||0)+taken.count*taken.experience)/Math.max(1e-9,old+taken.count);a[key]=old+taken.count;}
  ship.crewRequired=need.total;ship.crewAssignment=a;return a;
}
""")
rep("""  for(const s of ships){if(!s.crewAssignment)assignShipCrew(region,s);recordShipCrewPractice(s,weeks,{combat:(s.damageState?.hitLog?.length||0)>0});}
""","""  for(const s of ships){if(!s.crewAssignment||shipCrewReadiness(s)<.99)assignShipCrew(region,s);}
""")
p.write_text(text)
print('qualified personnel top-up behaviour applied')
