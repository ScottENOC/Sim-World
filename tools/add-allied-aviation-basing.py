from pathlib import Path

p=Path('js/military/aviation.js'); t=p.read_text()
# Add polity ownership helper and REBASE mission.
if "const actorId=" not in t:
    t=t.replace("const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));", "const has=(r,id)=>Boolean(r?.unlockedTechIds?.has?.(id));\nconst actorId=(r)=>r?.governance?.sovereignPolityId||r?.controllingActorId||r?.polityId||r?.id||null;")
t=t.replace("TRANSPORT:'transport'});", "TRANSPORT:'transport',REBASE:'rebase'});")
# Aircraft remember owner/home separately from current base.
old="const aircraft={id:`air-${nextAircraftId++}`,ownerType,role,baseType:'airfield',baseRegionId:region.id,carrierId:null,condition:1,fuel:1,status:'serviceable',mission:AIR_MISSIONS.IDLE,targetRegionId:null,pilotExperience:0,totalFlights:0,repairNeed:0};"
new="const aircraft={id:`air-${nextAircraftId++}`,ownerType,ownerActorId:actorId(region),role,baseType:'airfield',homeBaseRegionId:region.id,baseRegionId:region.id,carrierId:null,condition:1,fuel:1,status:'serviceable',mission:AIR_MISSIONS.IDLE,targetRegionId:null,pilotExperience:0,totalFlights:0,repairNeed:0};"
if old in t: t=t.replace(old,new)

# Insert basing helpers before air defence.
marker="export function airDefenceRisk(region){"
helpers="""
export function aviationBasingRelationship(aircraft,hostRegion,agreements=[],regionsById=new Map()){
  if(!aircraft||!hostRegion||!operationalInfrastructure(hostRegion,'airfield'))return{allowed:false,repair:false,reason:'no_airfield'};
  const hostActor=actorId(hostRegion),owner=aircraft.ownerActorId||actorId(regionsById.get(aircraft.homeBaseRegionId));
  if(!owner||hostActor===owner)return{allowed:true,repair:true,relationship:'own_base'};
  const ownerRegions=[...regionsById.values()].filter(r=>actorId(r)===owner).map(r=>r.id);
  const hostRegions=[...regionsById.values()].filter(r=>actorId(r)===hostActor).map(r=>r.id);
  const related=(agreements||[]).find(a=>a?.active&&['military_support','joint_operation','war_commitment','air_basing'].includes(a.type)&&
    ((ownerRegions.includes(a.fromId)&&hostRegions.includes(a.toId))||(ownerRegions.includes(a.toId)&&hostRegions.includes(a.fromId))||
     (a.proposerActorId===owner&&a.partnerActorId===hostActor)||(a.proposerActorId===hostActor&&a.partnerActorId===owner)||
     (a.fromActorId===owner&&a.toActorId===hostActor)||(a.fromActorId===hostActor&&a.toActorId===owner)));
  if(!related)return{allowed:false,repair:false,reason:'no_basing_rights'};
  return{allowed:true,repair:Boolean(related.aviationMaintenanceSupport||related.maintenanceSupport),relationship:'allied_base',agreementId:related.id};
}

export function rebaseAircraft(origin,target,aircraftId,agreements=[],regionsById=new Map([[origin?.id,origin],[target?.id,target]])){
  const a=ensureAviation(origin).aircraft.find(x=>x.id===aircraftId);if(!a||a.status==='destroyed'||a.condition<.42)return{rebased:false,reason:'unserviceable'};
  const rights=aviationBasingRelationship(a,target,agreements,regionsById);if(!rights.allowed)return{rebased:false,reason:rights.reason};
  const fuelNeed=.14;if((origin.stockpile?.aviation_fuel||0)<fuelNeed)return{rebased:false,reason:'insufficient_fuel'};
  origin.stockpile.aviation_fuel-=fuelNeed;a.fuel=clamp((a.fuel??1)-fuelNeed*.2);a.totalFlights++;a.mission=AIR_MISSIONS.IDLE;a.status='serviceable';a.targetRegionId=null;
  origin.aviation.aircraft=origin.aviation.aircraft.filter(x=>x!==a);a.baseRegionId=target.id;ensureAviation(target).aircraft.push(a);
  return{rebased:true,aircraft:a,rights};
}

"""
if 'export function aviationBasingRelationship' not in t:
    if marker not in t: raise RuntimeError('air defence marker missing')
    t=t.replace(marker,helpers+marker,1)

# Repair only at own base or explicit allied maintenance support; refuel at any legal base.
t=t.replace("function repairAtBase(region,a,elapsedDays){\n  if(a.status==='destroyed'||a.condition>=.999||a.baseRegionId!==region.id||!operationalInfrastructure(region,'airfield'))return;", "function repairAtBase(region,a,elapsedDays,agreements=[],regionsById=new Map()) {\n  const rights=aviationBasingRelationship(a,region,agreements,regionsById);\n  if(a.status==='destroyed'||a.condition>=.999||a.baseRegionId!==region.id||!rights.allowed||!rights.repair)return;")
t=t.replace("export function tickAviation(regions,currentTick,elapsedDays=7,rng=Math.random){\n  const byId=new Map(regions.map(r=>[r.id,r])),events=[];", "export function tickAviation(regions,currentTick,elapsedDays=7,rng=Math.random,options={}){\n  const byId=new Map(regions.map(r=>[r.id,r])),agreements=options.agreements||[],events=[];")
t=t.replace("repairAtBase(region,a,elapsedDays);", "repairAtBase(region,a,elapsedDays,agreements,byId);")
old_refuel="if(a.status!=='destroyed'&&a.baseRegionId===region.id&&operationalInfrastructure(region,'airfield')&&(a.fuel??0)<1){"
new_refuel="if(a.status!=='destroyed'&&a.baseRegionId===region.id&&aviationBasingRelationship(a,region,agreements,byId).allowed&&(a.fuel??0)<1){"
t=t.replace(old_refuel,new_refuel)

# Courier arrival is a temporary rebase; owner/home remain unchanged.
# Existing completeAircraftCourier already moves the aircraft and sets current base only.
p.write_text(t)

# Main: pass agreements and expose management API.
p=Path('js/main.js'); t=p.read_text()
t=t.replace("import { tickAviation, syncNextAircraftId } from './military/aviation.js?v=20260918-aviation1';", "import { tickAviation, syncNextAircraftId, buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary } from './military/aviation.js?v=20260918-aviation1';")
t=t.replace("tickAviation(regions, calendarWeek, time.elapsedDays, Math.random)", "tickAviation(regions, calendarWeek, time.elapsedDays, Math.random, { agreements })")
old="    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },"
new="    fleetApi: { deployFleet, dockFleet, orderFleetHome, orderFleetToSea, setFleetFlag, setFleetMission, syncRegionalNavyLedger },\n    aviationApi: { buildAircraft, assignAircraftMission, rebaseAircraft, aviationSummary },"
if old in t and 'aviationApi:' not in t:t=t.replace(old,new,1)
p.write_text(t)

# Extend regression with allied refuel/no-repair semantics.
p=Path('tools/test-early-aviation.mjs'); t=p.read_text()
t=t.replace("buildAircraft, assignAircraftMission, tickAviation, airDefenceRisk, reserveAircraftCourier, completeAircraftCourier, aviationSummary", "buildAircraft, assignAircraftMission, tickAviation, airDefenceRisk, reserveAircraftCourier, completeAircraftCourier, aviationSummary, rebaseAircraft")
if 'allied basing should permit physical rebasing' not in t:
    insert="""
// Allied basing grants reach and refuelling, but not automatically major repair capability.
const ally=region('ally'); ally.governance={sovereignPolityId:'ally-polity'}; home.governance={sovereignPolityId:'home-polity'};
const basingPlane=buildAircraft(home,{ownerType:'military',role:'recon'}); basingPlane.condition=.6; basingPlane.fuel=.2;
const agreements=[{id:'support-1',type:'military_support',active:true,fromId:home.id,toId:ally.id}];
const byId=new Map([[home.id,home],[ally.id,ally]]);
const rebased=rebaseAircraft(home,ally,basingPlane.id,agreements,byId);
assert.equal(rebased.rebased,true,'allied basing should permit physical rebasing');
assert.equal(basingPlane.baseRegionId,ally.id,'rebased aircraft should now operate from allied airfield');
assert.equal(basingPlane.homeBaseRegionId,home.id,'rebasing must not change the aircraft home maintenance base');
const damagedBefore=basingPlane.condition; const allyFuelBefore=ally.stockpile.aviation_fuel;
tickAviation([home,ally],20,30,()=>.99,{agreements});
assert.ok(basingPlane.fuel>.05,'allied base should be able to refuel a visiting aircraft');
assert.ok(ally.stockpile.aviation_fuel<allyFuelBefore,'allied refuelling should consume host aviation fuel');
assert.equal(basingPlane.condition,damagedBefore,'ordinary allied basing should not provide major structural repairs');

"""
    t=t.replace("console.log('early aviation regression passed');",insert+"console.log('early aviation regression passed');")
p.write_text(t)
print('allied aviation basing applied')
