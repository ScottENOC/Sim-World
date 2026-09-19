from pathlib import Path
p=Path('js/military/qualifiedPersonnel.js');text=p.read_text()
def rep(old,new):
    global text
    if new in text:return
    if old not in text:raise SystemExit(f'missing: {old[:120]!r}')
    text=text.replace(old,new,1)
rep("const INITIAL_EXPERIENCE=Object.freeze({pilot:.08,aircrew:.06,sailor:.08,naval_technical:.10,naval_officer:.12});",
    "const INITIAL_EXPERIENCE=Object.freeze({pilot:.04,aircrew:.06,sailor:.08,naval_technical:.10,naval_officer:.12});")
rep("function literacy(region){return clamp(region?.massEducation?.literacy??region?.education?.literacy??region?.literacy??.15);}\nfunction trainingCapacity(region,type){",
"""function literacy(region){return clamp(region?.massEducation?.literacy??region?.education?.literacy??region?.literacy??.15);}
export function civilianPilotBase(region){
  const aircraft=(region?.aviation?.aircraft||[]).filter(a=>a.ownerType==='civilian'&&a.status!=='destroyed').length,flights=Math.max(0,Number(region?.aviation?.flightExperience)||0);
  const powered=Boolean(region?.unlockedTechIds?.has?.('powered_flight')||aircraft>0||flights>0);if(!powered)return 0;
  // Civilian flying creates a much broader basic airmanship/instructor base than the combat-qualified military pool.
  return Math.max(2,aircraft*1.7+Math.sqrt(flights)*.55);
}
function pilotTrainingDays(region){
  const civilian=civilianPilotBase(region);return TRAINING_DAYS.pilot/(1+Math.min(.48,civilian/80));
}
function trainingCapacity(region,type){""")
rep("""  if(type==='pilot'||type==='aircrew'){
    const airfields=(region?.construction?.assets||[]).filter(a=>a.typeId==='airfield'&&(a.condition??1)>.45).reduce((s,a)=>s+Math.max(.5,a.scale||1),0);if(!airfields)return 0;
    return airfields*(type==='pilot'?10:28)*(.45+lit*.55)*(1+military*.35);
  }
""","""  if(type==='pilot'||type==='aircrew'){
    const airfields=(region?.construction?.assets||[]).filter(a=>a.typeId==='airfield'&&(a.condition??1)>.45).reduce((s,a)=>s+Math.max(.5,a.scale||1),0);if(!airfields)return 0;
    const civilian=type==='pilot'?civilianPilotBase(region):0;
    // Civilian instructors expand access to flight 101; military infrastructure still limits combat conversion throughput.
    const base=type==='pilot'?10+Math.min(34,civilian*.55):28;
    return airfields*base*(.45+lit*.55)*(1+military*.35);
  }
""")
rep("""    const graduate=Math.min(t.trainees,t.trainees*Math.max(0,elapsedDays)/TRAINING_DAYS[type]);if(graduate>0){t.trainees-=graduate;addToPool(region,type,graduate,INITIAL_EXPERIENCE[type]);}
""","""    const trainingDays=type==='pilot'?pilotTrainingDays(region):TRAINING_DAYS[type];
    const graduate=Math.min(t.trainees,t.trainees*Math.max(0,elapsedDays)/trainingDays);if(graduate>0){t.trainees-=graduate;addToPool(region,type,graduate,INITIAL_EXPERIENCE[type]);}
""")
rep("""  return{pools,lastTrainingCost:s.lastTrainingCost||0,lastTrainingFuel:s.lastTrainingFuel||0};
""","""  return{pools,civilianPilotBase:civilianPilotBase(region),lastTrainingCost:s.lastTrainingCost||0,lastTrainingFuel:s.lastTrainingFuel||0};
""")
p.write_text(text)
print('civilian pilot pipeline applied')
