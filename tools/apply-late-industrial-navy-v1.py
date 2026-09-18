from pathlib import Path

# Breakthrough pipeline.
p=Path('js/technology/breakthroughs.js'); t=p.read_text()
imp="import { tickLateIndustrialNavalBreakthroughs } from '../military/lateIndustrialNavy.js?v=20260918-navy1';\n"
anchor="import { tickModernLandBreakthroughs } from '../military/modernLandWarfare.js?v=20260918-modern-war1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('breakthrough import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
call="  events.push(...tickLateIndustrialNavalBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
anchor2="  events.push(...tickModernLandBreakthroughs(regions, currentTick, rng, elapsedDays));\n"
if call not in t:
    if anchor2 not in t: raise RuntimeError('breakthrough call anchor missing')
    t=t.replace(anchor2,anchor2+call,1)
p.write_text(t)

# Fleet missions, designs, composition and submarine detection behaviour.
p=Path('js/military/fleets.js'); t=p.read_text()
imp="import { DREADNOUGHT_TECH_ID, SUBMARINE_TECH_ID, tickLateIndustrialNavalWarfare } from './lateIndustrialNavy.js?v=20260918-navy1';\n"
anchor="import { MARINE_STEAM_TECH_ID, SCREW_PROPULSION_TECH_ID, IRON_HULL_TECH_ID, STEEL_HULL_TECH_ID } from '../technology/industrialMarine.js?v=20260916-steam1';\n"
if imp not in t:
    if anchor not in t: raise RuntimeError('fleet import anchor missing')
    t=t.replace(anchor,anchor+imp,1)
mission_anchor="  RAID_SHIPPING: 'raid_shipping',\n"
mission_insert=mission_anchor+"  LAY_MINES: 'lay_mines',\n  SWEEP_MINES: 'sweep_mines',\n  SUBMARINE_PATROL: 'submarine_patrol',\n  SUBMARINE_RAID_SHIPPING: 'submarine_raid_shipping',\n"
if "LAY_MINES: 'lay_mines'" not in t:
    if mission_anchor not in t: raise RuntimeError('mission anchor missing')
    t=t.replace(mission_anchor,mission_insert,1)
design_anchor="""  steel_warship: {
    id: 'steel_warship', label: 'steel steam warship', tier: 8, advanced: true, propulsion: 'steam', crew: 42, speed: 1.72,
    fallbackSpeed: 0.38, combat: 4.10, durability: 3.05, pursuit: 1.30, captureResistance: 1.24, gunCapacity: 16, armour: 1.25,
    coalCapacity: 36, coalPerWeek: 2.5, refitCost: { wood: 40, steel: 55, coal: 16, machine: 10 },
  },
"""
design_insert=design_anchor+"""  destroyer: {
    id: 'destroyer', label: 'destroyer', tier: 9, advanced: true, propulsion: 'steam', crew: 30, speed: 2.25,
    fallbackSpeed: 0.42, combat: 3.55, durability: 2.20, pursuit: 2.10, captureResistance: 1.12, gunCapacity: 9, armour: 0.55,
    coalCapacity: 28, coalPerWeek: 2.6, refitCost: { steel: 38, coal: 12, machine: 11, gunpowder: 1 },
  },
  submarine: {
    id: 'submarine', label: 'submarine', tier: 9, advanced: true, propulsion: 'submersible', crew: 18, speed: 1.08,
    combat: 0.62, durability: 0.78, pursuit: 0.72, captureResistance: 1.30, gunCapacity: 0, armour: 0.18, submersible: true,
    refitCost: { steel: 24, machine: 12, petrol: 8 },
  },
  dreadnought: {
    id: 'dreadnought', label: 'dreadnought', tier: 10, advanced: true, propulsion: 'steam', crew: 80, speed: 1.68,
    fallbackSpeed: 0.30, combat: 7.20, durability: 5.20, pursuit: 1.18, captureResistance: 1.55, gunCapacity: 30, armour: 2.45,
    coalCapacity: 70, coalPerWeek: 4.8, refitCost: { steel: 125, coal: 30, machine: 28, gunpowder: 4 },
  },
"""
if "id: 'dreadnought'" not in t:
    if design_anchor not in t: raise RuntimeError('design anchor missing')
    t=t.replace(design_anchor,design_insert,1)
helper_anchor="function designOf(ship) { return SHIP_DESIGNS[ship?.designId] || SHIP_DESIGNS.basic_war_boat; }\n"
helper=helper_anchor+"function isSubmarineFleet(fleet) { return (fleet?.ships?.length || 0) > 0 && fleet.ships.every((ship) => ship.designId === 'submarine'); }\nfunction fleetDestroyerCount(fleet) { return (fleet?.ships || []).filter((ship) => ship.designId === 'destroyer').length; }\n"
if 'function isSubmarineFleet(fleet)' not in t:
    if helper_anchor not in t: raise RuntimeError('helper anchor missing')
    t=t.replace(helper_anchor,helper,1)
pref_anchor="  const tech = region?.unlockedTechIds;\n"
if "tech?.has(DREADNOUGHT_TECH_ID)" not in t:
    t=t.replace(pref_anchor,pref_anchor+"  if (tech?.has(DREADNOUGHT_TECH_ID)) return 'dreadnought';\n",1)
old_comp="""export function desiredWarshipComposition(region, total = region?.targetNavySize || 0) {
  const count = Math.max(0, Math.round(total || 0));
  const targets = {};
  for (let i = 0; i < count; i++) {
    const id = preferredWarshipDesign(region, i);
    targets[id] = (targets[id] || 0) + 1;
  }
  return targets;
}
"""
new_comp="""export function desiredWarshipComposition(region, total = region?.targetNavySize || 0) {
  const count = Math.max(0, Math.round(total || 0));
  const targets = {};
  const late = region?.unlockedTechIds?.has(DREADNOUGHT_TECH_ID);
  const submarines = region?.unlockedTechIds?.has(SUBMARINE_TECH_ID);
  for (let i = 0; i < count; i++) {
    let id;
    if (late) {
      if (submarines && i % 5 === 4) id = 'submarine';
      else if (i % 3 === 2) id = 'destroyer';
      else if (i % 4 === 0) id = 'dreadnought';
      else id = 'steel_warship';
    } else id = preferredWarshipDesign(region, i);
    targets[id] = (targets[id] || 0) + 1;
  }
  return targets;
}
"""
if 'if (late) {' not in t:
    if old_comp not in t: raise RuntimeError('composition anchor missing')
    t=t.replace(old_comp,new_comp,1)
old_conceal="""function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  return clamp(0.42 + hideBonus - sizePenalty - activePenalty, 0.05, 0.92);
}
"""
new_conceal="""function targetConcealment(fleet) {
  const sizePenalty = Math.min(0.45, Math.log2(1 + fleet.ships.length) * 0.08);
  const hideBonus = fleet.mission === FLEET_MISSIONS.HIDE ? 0.5 : 0;
  const submarineBonus = isSubmarineFleet(fleet) ? 0.40 : 0;
  const activePenalty = fleet.mission === FLEET_MISSIONS.BLOCKADE ? 0.25 : fleet.mission === FLEET_MISSIONS.PATROL ? 0.14 : 0;
  return clamp(0.42 + hideBonus + submarineBonus - sizePenalty - activePenalty, 0.05, 0.97);
}
"""
if 'const submarineBonus = isSubmarineFleet' not in t:
    if old_conceal not in t: raise RuntimeError('concealment anchor missing')
    t=t.replace(old_conceal,new_conceal,1)
old_detect="""  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize - targetConcealment(target) * 0.22, 0.01, 0.65);
"""
new_detect="""  const antiSubmarineSearch = isSubmarineFleet(target) ? fleetDestroyerCount(observer) * 0.075 : 0;
  const perWeek = clamp(0.03 + searchMission + scouting * 0.2 + searchSize + antiSubmarineSearch - targetConcealment(target) * 0.22, 0.01, 0.65);
"""
if 'const antiSubmarineSearch' not in t:
    if old_detect not in t: raise RuntimeError('detection anchor missing')
    t=t.replace(old_detect,new_detect,1)
# Tick special warfare before ordinary contact generation; submarine mission fleets are not SEARCH_MISSIONS.
tick_anchor="""  const events = [];
  reconcileFleetLedger(regions, fleets, events, weeks);
"""
tick_repl="""  const events = [];
  reconcileFleetLedger(regions, fleets, events, weeks);
  events.push(...tickLateIndustrialNavalWarfare(fleets, regions, seaRegions, currentTick, elapsedDays, rng));
"""
if 'events.push(...tickLateIndustrialNavalWarfare' not in t:
    if tick_anchor not in t: raise RuntimeError('tick fleet anchor missing')
    t=t.replace(tick_anchor,tick_repl,1)
p.write_text(t)

# Fleet UI mission orders.
p=Path('js/ui/fleetUi.js'); t=p.read_text()
old="['patrol','intercept','blockade','port_assault','raid_shipping','escort','hide','return_refit']"
new="['patrol','intercept','blockade','port_assault','raid_shipping','escort','lay_mines','sweep_mines','submarine_patrol','submarine_raid_shipping','hide','return_refit']"
if 'submarine_patrol' not in t:
    if old not in t: raise RuntimeError('fleet ui mission anchor missing')
    t=t.replace(old,new,1)
p.write_text(t)

# Strategic naval consumables.
p=Path('js/economy/tradeGoods.js'); t=p.read_text()
anchor="  artillery_shells: { label: 'Artillery shells', basePrice: 38, referenceStock: 180, category: 'military_supply', strategic: true, cargoKgPerUnit: 4.5 },\n"
insert=anchor+"  torpedoes: { label: 'Torpedoes', basePrice: 85, referenceStock: 60, category: 'military_supply', strategic: true, cargoKgPerUnit: 12 },\n  naval_mines: { label: 'Naval mines', basePrice: 44, referenceStock: 120, category: 'military_supply', strategic: true, cargoKgPerUnit: 18 },\n"
if 'torpedoes:' not in t:
    if anchor not in t: raise RuntimeError('trade goods anchor missing')
    t=t.replace(anchor,insert,1)
p.write_text(t)

# Simple industrial production of naval consumables inside the existing munitions economy.
p=Path('js/economy/industrialWarEconomy.js'); t=p.read_text()
old=""" return{smallArms,shells,spending,value:smallArms*12+shells*38};
}
"""
new=""" let torpedoes=0,navalMines=0;
 if(has(region,'self_propelled_torpedo')){
  const gap=Math.max(0,12-(region.stockpile.torpedoes||0)),cashPer=.08,steelPer=.12,powderPer=.08;
  torpedoes=Math.min(gap,base*18*years,(region.stockpile.steel||0)/steelPer,(region.stockpile.gunpowder||0)/powderPer,Math.max(0,region.treasury||0)/cashPer);
  if(torpedoes>0){const cash=torpedoes*cashPer;region.stockpile.steel-=torpedoes*steelPer;region.stockpile.gunpowder-=torpedoes*powderPer;region.treasury-=cash;region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.torpedoes=(region.stockpile.torpedoes||0)+torpedoes;}
  region.marketDemand.torpedoes=Math.max(region.marketDemand.torpedoes||0,gap/Math.max(1,elapsedDays/7));
 }
 if(has(region,'naval_mines')){
  const gap=Math.max(0,24-(region.stockpile.naval_mines||0)),cashPer=.035,steelPer=.07,powderPer=.06;
  navalMines=Math.min(gap,base*36*years,(region.stockpile.steel||0)/steelPer,(region.stockpile.gunpowder||0)/powderPer,Math.max(0,region.treasury||0)/cashPer);
  if(navalMines>0){const cash=navalMines*cashPer;region.stockpile.steel-=navalMines*steelPer;region.stockpile.gunpowder-=navalMines*powderPer;region.treasury-=cash;region.wallet=(region.wallet||0)+cash;spending+=cash;region.stockpile.naval_mines=(region.stockpile.naval_mines||0)+navalMines;}
  region.marketDemand.naval_mines=Math.max(region.marketDemand.naval_mines||0,gap/Math.max(1,elapsedDays/7));
 }
 return{smallArms,shells,torpedoes,navalMines,spending,value:smallArms*12+shells*38+torpedoes*85+navalMines*44};
}
"""
if 'let torpedoes=0,navalMines=0;' not in t:
    if old not in t: raise RuntimeError('munitions return anchor missing')
    t=t.replace(old,new,1)
report_old="region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,munitionsSpending:output.spending};"
report_new="region.report.warEconomy={...s,smallArmsAmmunitionMade:output.smallArms,artilleryShellsMade:output.shells,torpedoesMade:output.torpedoes,navalMinesMade:output.navalMines,munitionsSpending:output.spending};"
if 'torpedoesMade:output.torpedoes' not in t:
    if report_old not in t: raise RuntimeError('war report anchor missing')
    t=t.replace(report_old,report_new,1)
p.write_text(t)

print('late industrial navy integration applied')
