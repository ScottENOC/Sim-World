from pathlib import Path

# Fix core syntax, add refuelling and save/load id syncing, and rare military acquisition.
p=Path('js/military/aviation.js'); t=p.read_text()
t=t.replace("import { effectiveInfrastructureCount, operationalInfrastructure }", "import { operationalInfrastructure }")
t=t.replace("const mg=has(region,'machine_guns')?.10:0;", "const mg=has(region,'machine_guns') ? .10 : 0;")
t=t.replace("const modernGuns=has(region,'quick_firing_artillery')?.07:has(region,'breech_loading_artillery')?.035:0;", "const modernGuns=has(region,'quick_firing_artillery') ? .07 : has(region,'breech_loading_artillery') ? .035 : 0;")
if 'export function syncNextAircraftId' not in t:
    t=t.replace("export function ensureAviation(region){", "export function syncNextAircraftId(regions=[]){\n  let max=0; for(const region of regions) for(const a of region.aviation?.aircraft||[]) max=Math.max(max,Number(String(a.id||'').replace(/\\D/g,''))||0);\n  nextAircraftId=max+1;\n}\n\nexport function ensureAviation(region){",1)
old="""    for(const a of av.aircraft){
      repairAtBase(region,a,elapsedDays); if(a.status==='destroyed'||a.mission===AIR_MISSIONS.IDLE||a.mission===AIR_MISSIONS.COURIER)continue;
"""
new="""    for(const a of av.aircraft){
      repairAtBase(region,a,elapsedDays);
      if(a.status!=='destroyed'&&a.baseRegionId===region.id&&operationalInfrastructure(region,'airfield')&&(a.fuel??0)<1){
        const need=Math.max(0,1-(a.fuel||0)); const available=Math.max(0,region.stockpile?.aviation_fuel||0); const take=Math.min(need,available);
        if(take>0){region.stockpile.aviation_fuel-=take;a.fuel=clamp((a.fuel||0)+take);if(a.status==='grounded'&&a.fuel>.12)a.status='serviceable';}
      }
      if(a.status==='destroyed'||a.mission===AIR_MISSIONS.IDLE||a.mission===AIR_MISSIONS.COURIER)continue;
"""
if old in t: t=t.replace(old,new,1)
anchor="""    const civil=av.aircraft.filter(a=>a.ownerType==='civilian'&&a.status!=='destroyed').length;
    if(canBuild(region)&&civil<Math.max(1,Math.floor(Math.log10(Math.max(10,region.population||0))-3))){
      const wealth=clamp(Math.log1p(Math.max(0,region.wallet||0))/12),industry=industrialReadiness(region); if(rng()<elapsedDays/DAYS_PER_YEAR*.08*wealth*industry)buildAircraft(region,{ownerType:'civilian',role:'mail'});
    }
"""
replacement=anchor+"""    const military=av.aircraft.filter(a=>a.ownerType==='military'&&a.status!=='destroyed').length;
    const militaryCap=Math.max(1,Math.floor(Math.max(0,region.population||0)/250000));
    if(canBuild(region)&&has(region,MILITARY_AVIATION_TECH_ID)&&military<militaryCap){
      const urgency=clamp(.2+(region.conflictPressure||0)*1.5+(region.militaryStrategy?.spendingPriority||0)*.35),industry=industrialReadiness(region);
      if(rng()<elapsedDays/DAYS_PER_YEAR*.12*urgency*industry)buildAircraft(region,{ownerType:'military',role:'recon'});
    }
"""
if 'const militaryCap=' not in t:
    if anchor not in t: raise RuntimeError('civilian aviation anchor missing')
    t=t.replace(anchor,replacement,1)
p.write_text(t)

p=Path('js/economy/construction.js'); t=p.read_text()
anchor="""  shipyard: {
    id: 'shipyard', name: 'Advanced shipyard', requiredTechId: 'advanced_boatbuilding', coastal: true, unique: true,
    requiresInfrastructure: 'harbour',
    description: 'Specialist slips, sheds, cranes and stores for constructing advanced vessels.',
    workRequired: 6200, defaultWorkers: 80, minWorkers: 25, maxWorkers: 350,
    materials: { stone: 350, wood: 900, bronze: 20 }, wagePerWorkerWeek: 0.002,
    maintenanceRate: 0.03,
  },
"""
insert=anchor+"""  airfield: {
    id: 'airfield', name: 'Airfield and aircraft workshops', requiredTechId: 'powered_flight', unique: false,
    minPopulation: 8000,
    description: 'Prepared flying ground, hangars, fuel stores and workshops supporting persistent aircraft. Damaged aircraft require materials, money and time here to return to service.',
    workRequired: 18000, defaultWorkers: 180, minWorkers: 55, maxWorkers: 750,
    materials: { wood: 1000, stone: 450, steel: 160, textiles: 100 }, wagePerWorkerWeek: 0.0042,
    maintenanceRate: 0.07,
  },
"""
if "id: 'airfield'" not in t:
    if anchor not in t: raise RuntimeError('shipyard construction anchor missing')
    t=t.replace(anchor,insert,1)
p.write_text(t)

p=Path('js/technology/breakthroughs.js'); t=p.read_text()
imp="import { tickAviationBreakthroughs } from '../military/aviation.js?v=20260918-aviation1';\n"
anchor="import { tickModernLandBreakthroughs } from '../military/modernLandWarfare.js?v=20260918-modern-war1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('breakthrough import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
call="  events.push(...tickAviationBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
anchor2="  events.push(...tickModernLandBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
if call not in t:
    if anchor2 not in t: raise RuntimeError('breakthrough call anchor missing')
    t=t.replace(anchor2,anchor2+call,1)
p.write_text(t)

p=Path('js/main.js'); t=p.read_text()
imp="import { tickAviation, syncNextAircraftId } from './military/aviation.js?v=20260918-aviation1';\n"
anchor="import { tickIndustrialWarEconomy } from './economy/industrialWarEconomy.js?v=20260918-industrial-war1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('main aviation import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
if 'syncNextAircraftId(regions);' not in t:
    anchor2='    syncNextDiplomaticMessageId(regions);\n'
    if anchor2 not in t: raise RuntimeError('load sync anchor missing')
    t=t.replace(anchor2,anchor2+'    syncNextAircraftId(regions);\n',1)
call="    const aviationEvents = profiler.measure('Aviation', () => tickAviation(regions, calendarWeek, time.elapsedDays, Math.random));\n"
anchor3="    const fleetResult = profiler.measure('Fleets', () => tickFleets(fleets, regions, seaRegions, agreements, calendarWeek, time.elapsedDays, Math.random, { playerActorId: activePlayerPolityId }));\n"
if call not in t:
    if anchor3 not in t: raise RuntimeError('fleet tick anchor missing')
    t=t.replace(anchor3,call+anchor3,1)
p.write_text(t)

p=Path('js/diplomacy/messageRouting.js'); t=p.read_text()
t=t.replace("['horse','rail','sea'].includes(l.mode)", "['horse','rail','sea','air'].includes(l.mode)")
p.write_text(t)

p=Path('js/diplomacy/couriers.js'); t=p.read_text()
imp="import { airDefenceRisk, availableAircraftCourier, reserveAircraftCourier, completeAircraftCourier } from '../military/aviation.js?v=20260918-aviation1';\n"
anchor="import { messageRouteBetween, messageRouteDeliveryTicks } from './messageRouting.js?v=20260917-message-routing1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('courier import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
old="""export function routeFor(origin, target, regionsById) {
  return messageRouteBetween(origin, target, regionsById);
}
"""
new="""export function routeFor(origin, target, regionsById) {
  const ordinary=messageRouteBetween(origin,target,regionsById);
  const aircraft=availableAircraftCourier(origin,target);
  if(!aircraft||ordinary?.days<=.65)return ordinary;
  const leg=reserveAircraftCourier(origin,target); if(!leg)return ordinary;
  return {mode:'air',legs:[leg],days:leg.days,regionIds:[origin.id,target.id],seaIds:[],modes:['air'],reservedAircraftId:leg.aircraftId};
}
"""
if 'reservedAircraftId:leg.aircraftId' not in t:
    if old not in t: raise RuntimeError('routeFor anchor missing')
    t=t.replace(old,new,1)
sea_anchor="""    } else if (leg.mode === 'sea') {
"""
if "leg.mode === 'air'" not in t:
    air_block="""    } else if (leg.mode === 'air') {
      const destination=regionsById.get(leg.toRegionId);
      legRisk=destination ? airDefenceRisk(destination)*0.55 + clamp(destination.conflictPressure||0)*0.08 : 0.03;
    } else if (leg.mode === 'sea') {
"""
    if sea_anchor not in t: raise RuntimeError('route risk sea anchor missing')
    t=t.replace(sea_anchor,air_block,1)
old_destroy="""        if (destroyed) message.status = 'intercepted_lost';
"""
new_destroy="""        if (destroyed) {
          message.status = 'intercepted_lost';
          const airLeg=(message.route?.legs||[]).find((leg)=>leg.mode==='air');
          if(airLeg) completeAircraftCourier(airLeg,regionsById,{lost:true,rng});
        }
"""
if 'const airLeg=(message.route?.legs||[]).find' not in t:
    if old_destroy not in t: raise RuntimeError('destroyed courier anchor missing')
    t=t.replace(old_destroy,new_destroy,1)
arrival="""      message.receivedTick = currentTick;
      resolveDeliveryLanguage(message, sender, target);
"""
arrival_new="""      message.receivedTick = currentTick;
      const deliveredAirLeg=(message.route?.legs||[]).find((leg)=>leg.mode==='air');
      if(deliveredAirLeg) completeAircraftCourier(deliveredAirLeg,regionsById,{lost:false,rng});
      resolveDeliveryLanguage(message, sender, target);
"""
if 'deliveredAirLeg' not in t:
    if arrival not in t: raise RuntimeError('courier arrival anchor missing')
    t=t.replace(arrival,arrival_new,1)
p.write_text(t)

print('early aviation integration applied')
# trigger workflow
