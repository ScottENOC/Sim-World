from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def rep(path,old,new):
    p=ROOT/path;text=p.read_text()
    if new in text:return
    if old not in text:raise SystemExit(f'marker missing in {path}: {old[:120]!r}')
    p.write_text(text.replace(old,new,1))

# Aviation: add aerial refuelling as a conventional capability and tanker role.
rep('js/military/aviation.js',
"export const JET_PROPULSION_TECH_ID='jet_propulsion';",
"export const JET_PROPULSION_TECH_ID='jet_propulsion';\nexport const AERIAL_REFUELLING_TECH_ID='aerial_refuelling';")
rep('js/military/aviation.js',
"    if(has(region,POWERED_FLIGHT_TECH_ID)&&!has(region,JET_PROPULSION_TECH_ID)&&aircraftEngine>.54&&industry>.58&&a.flightExperience>120){",
"    if(has(region,TRANSPORT_AIRCRAFT_TECH_ID)&&!has(region,AERIAL_REFUELLING_TECH_ID)&&aircraftEngine>.48&&radio>.22&&industry>.52&&a.flightExperience>90){\n      const annual=clamp(.002+aircraftEngine*.014+radio*.010+industry*.010+connectedSources(region,byId,AERIAL_REFUELLING_TECH_ID)*.018,0,.10);\n      if(rng()<1-Math.pow(1-annual,years)){region.unlockedTechIds.add(AERIAL_REFUELLING_TECH_ID);events.push({type:'aviation_breakthrough',techId:AERIAL_REFUELLING_TECH_ID,regionId:region.id,title:'Aerial refuelling'});}\n    }\n    if(has(region,POWERED_FLIGHT_TECH_ID)&&!has(region,JET_PROPULSION_TECH_ID)&&aircraftEngine>.54&&industry>.58&&a.flightExperience>120){")
rep('js/military/aviation.js',
"  if(role==='transport'&&!has(region,TRANSPORT_AIRCRAFT_TECH_ID))return null;",
"  if(role==='transport'&&!has(region,TRANSPORT_AIRCRAFT_TECH_ID))return null;\n  if(role==='tanker'&&(!has(region,TRANSPORT_AIRCRAFT_TECH_ID)||!has(region,AERIAL_REFUELLING_TECH_ID)))return null;")
rep('js/military/aviation.js',
"    const cost=role==='transport'?{wood:40,textiles:24,steel:18,machine:10,cash:22}:{wood:26,textiles:18,steel:10,machine:7,cash:14};",
"    const cost=['transport','tanker'].includes(role)?{wood:40,textiles:24,steel:18,machine:10,cash:22}:{wood:26,textiles:18,steel:10,machine:7,cash:14};")
insert="""
export function aerialRefuellingSupport(region){
  const aircraft=ensureAviation(region).aircraft||[];
  const tankers=aircraft.filter(a=>a.ownerType==='military'&&a.role==='tanker'&&a.status!=='destroyed'&&(a.condition??1)>=.42&&aircraftCrewReadiness(a)>=.35).length;
  const fuel=Math.max(0,region.stockpile?.aviation_fuel||0);
  const enabled=has(region,AERIAL_REFUELLING_TECH_ID)&&tankers>0&&fuel>.25;
  return {enabled,tankers,rangeSupport:enabled?clamp(1+Math.min(.75,tankers*.12)):1,fuelReserve:fuel};
}

"""
rep('js/military/aviation.js',
"export function airDefenceRisk(region,aircraft=null){return airDefenceEngagementRisk(region,aircraft);}\n\n",
"export function airDefenceRisk(region,aircraft=null){return airDefenceEngagementRisk(region,aircraft);}\n\n"+insert)

# Tankers are transport-derived aircraft and need a full multi-person qualified crew.
rep('js/military/qualifiedPersonnel.js',
"  if(role==='transport')return{pilot:2,aircrew:2};",
"  if(['transport','tanker'].includes(role))return{pilot:2,aircrew:2};")

# Deterrence tick joins the normal weekly strategic systems.
rep('js/technology/breakthroughs.js',
"import { tickNuclearWeaponProgramme } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';",
"import { tickNuclearWeaponProgramme } from '../military/nuclearWeaponisation.js?v=20260920-nuclear-weaponisation1';\nimport { tickNuclearDeterrence } from '../diplomacy/nuclearDeterrence.js?v=20260920-nuclear-deterrence1';")
rep('js/technology/breakthroughs.js',
"  for (const region of regions) events.push(...tickNuclearWeaponProgramme(region, currentTick, elapsedDays, rng));",
"  for (const region of regions) events.push(...tickNuclearWeaponProgramme(region, currentTick, elapsedDays, rng));\n  events.push(...tickNuclearDeterrence(regions, currentTick, elapsedDays));")

print('nuclear deterrence and aerial refuelling integration applied')
