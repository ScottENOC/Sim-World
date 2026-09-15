from pathlib import Path


def replace_once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'missing expected block: {label}')
    return text.replace(old, new, 1)

fleet_path = Path('js/military/fleets.js')
fleet = fleet_path.read_text()

anchor = """export function preferredWarshipDesign(region, serial = 0) {
  const tech = region?.unlockedTechIds;
  if (tech?.has(STEEL_HULL_TECH_ID)) return 'steel_warship';
  if (tech?.has(IRON_HULL_TECH_ID)) return 'ironclad';
  if (tech?.has(SCREW_PROPULSION_TECH_ID)) return 'steam_frigate';
  if (tech?.has(MARINE_STEAM_TECH_ID)) return 'paddle_steam_warship';
  if (tech?.has('gunpowder') && tech?.has('ocean_sailing')) {
    const readiness = clamp(region.earlyModernMilitary?.naval?.readiness || 0);
    const heavyFleet = region.militaryPolicy?.navalPriority === 'war' && readiness >= 0.60 && operationalInfrastructure(region, 'naval_base');
    if (heavyFleet && serial % 3 === 0) return 'ship_of_line';
    if (readiness >= 0.30 && operationalInfrastructure(region, 'shipyard')) return 'frigate';
    return 'gunpowder_sailing_warship';
  }
  if (tech?.has('ocean_sailing')) return 'ocean_sailing_warship';
  if (tech?.has('advanced_boatbuilding')) return 'galley';
  return 'basic_war_boat';
}
"""
addition = anchor + """
export function desiredWarshipComposition(region, total = region?.targetNavySize || 0) {
  const count = Math.max(0, Math.round(total || 0));
  const targets = {};
  for (let i = 0; i < count; i++) {
    const id = preferredWarshipDesign(region, i);
    targets[id] = (targets[id] || 0) + 1;
  }
  return targets;
}

export function ensureNavalProcurement(region) {
  region.navalProcurement ||= { targets: {}, built: {}, lastDecisionTick: null };
  region.navalProcurement.targets ||= {};
  region.navalProcurement.built ||= {};
  return region.navalProcurement;
}

export function refreshNavalProcurementTargets(region, currentTick = null) {
  const procurement = ensureNavalProcurement(region);
  procurement.targets = desiredWarshipComposition(region);
  procurement.lastDecisionTick = currentTick;
  return procurement.targets;
}

function targetCountForClass(region, designId) {
  return Math.max(0, Math.round(ensureNavalProcurement(region).targets?.[designId] || 0));
}

function actualClassCounts(fleets) {
  const counts = {};
  for (const fleet of fleets) for (const ship of fleet.ships || []) counts[ship.designId] = (counts[ship.designId] || 0) + 1;
  return counts;
}
"""
fleet = replace_once(fleet, anchor, addition, 'naval procurement helpers')

old_reconcile = """    const owned = byOwner.get(region.id) || [];
    const wantedTotal = Math.max(0, Math.round(region.navy?.boats || 0));
    const wantedAdvanced = Math.min(wantedTotal, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));
"""
new_reconcile = """    const owned = byOwner.get(region.id) || [];
    const procurement = ensureNavalProcurement(region);
    const explicitTargets = Object.values(procurement.targets || {}).reduce((sum, value) => sum + Math.max(0, Math.round(value || 0)), 0);
    const wantedTotal = explicitTargets > 0 ? explicitTargets : Math.max(0, Math.round(region.navy?.boats || 0));
    const wantedAdvanced = explicitTargets > 0
      ? Object.entries(procurement.targets).reduce((sum, [id, value]) => sum + (SHIP_DESIGNS[id]?.advanced ? Math.max(0, Math.round(value || 0)) : 0), 0)
      : Math.min(wantedTotal, Math.max(0, Math.round(region.navy?.advancedBoats || 0)));
"""
fleet = replace_once(fleet, old_reconcile, new_reconcile, 'class-aware reconcile targets')

old_build = """    if (!target) continue;
    for (let i = actualAdvanced; i < wantedAdvanced; i++) target.ships.push(makeShip(preferredWarshipDesign(region, i), region.id));
    const basicActual = actualTotal - actualAdvanced;
    const basicWanted = wantedTotal - wantedAdvanced;
    for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
    moderniseOwnedFleet(region, owned, weeks, events);
"""
new_build = """    if (!target) continue;
    if (explicitTargets > 0) {
      const classCounts = actualClassCounts(owned);
      for (const [designId, wanted] of Object.entries(procurement.targets)) {
        if (!SHIP_DESIGNS[designId]) continue;
        const actual = classCounts[designId] || 0;
        for (let i = actual; i < Math.max(0, Math.round(wanted || 0)); i++) target.ships.push(makeShip(designId, region.id));
      }
    } else {
      for (let i = actualAdvanced; i < wantedAdvanced; i++) target.ships.push(makeShip(preferredWarshipDesign(region, i), region.id));
      const basicActual = actualTotal - actualAdvanced;
      const basicWanted = wantedTotal - wantedAdvanced;
      for (let i = basicActual; i < basicWanted; i++) target.ships.push(makeShip('basic_war_boat', region.id));
    }
    moderniseOwnedFleet(region, owned, weeks, events);
"""
fleet = replace_once(fleet, old_build, new_build, 'class-aware fleet construction')
fleet_path.write_text(fleet)

region_path = Path('js/world/region.js')
region = region_path.read_text()
region = replace_once(region,
"    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0, scoutingBoats: 0 };",
"    this.targetNavySize = 0; this.navy = { boats: 0, advancedBoats: 0, personnel: 0, scoutingBoats: 0 };\n    this.navalProcurement = { targets: {}, built: {}, lastDecisionTick: null };",
'naval procurement region state')
region_path.write_text(region)

labor_path = Path('js/economy/laborCore.js')
labor = labor_path.read_text()
labor = replace_once(labor,
"import { educationLaborReservation } from '../society/massEducation.js?v=20260914-mass-education1';",
"import { educationLaborReservation } from '../society/massEducation.js?v=20260914-mass-education1';\nimport { ensureNavalProcurement, refreshNavalProcurementTargets, SHIP_DESIGNS } from '../military/fleets.js?v=20260916-procurement1';",
'procurement imports')

old_boat_constants = """const ADVANCED_BOAT_BUILD_RATE_MULTIPLIER = 0.6;
const ADVANCED_BOAT_COST = { wood: 300, pitch: 20, textiles: 15, metal: 5 };"""
new_boat_constants = """const ADVANCED_BOAT_BUILD_RATE_MULTIPLIER = 0.6;
const ADVANCED_BOAT_COST = { wood: 300, pitch: 20, textiles: 15, metal: 5 };
const WARSHIP_BUILD_COST = {
  basic_war_boat: { wood: 200 },
  galley: { wood: 300, pitch: 20, textiles: 15, metal: 5 },
  ocean_sailing_warship: { wood: 420, pitch: 28, textiles: 30, metal: 8 },
  gunpowder_sailing_warship: { wood: 520, pitch: 32, textiles: 38, metal: 14, gunpowder: 2 },
  frigate: { wood: 700, pitch: 42, textiles: 52, metal: 25, gunpowder: 5 },
  ship_of_line: { wood: 1100, pitch: 65, textiles: 80, metal: 45, gunpowder: 10 },
  paddle_steam_warship: { wood: 650, iron: 45, coal: 25, machine: 10 },
  steam_frigate: { wood: 600, iron: 70, coal: 35, machine: 16 },
  ironclad: { wood: 350, iron: 150, coal: 45, machine: 24 },
  steel_warship: { wood: 180, steel: 220, coal: 55, machine: 34 },
};
const WARSHIP_BUILD_RATE = {
  basic_war_boat: 0.020, galley: 0.012, ocean_sailing_warship: 0.009,
  gunpowder_sailing_warship: 0.007, frigate: 0.0045, ship_of_line: 0.0025,
  paddle_steam_warship: 0.0040, steam_frigate: 0.0035, ironclad: 0.0025, steel_warship: 0.0022,
};"""
labor = replace_once(labor, old_boat_constants, new_boat_constants, 'class build costs')

marker = """export function buildFleetBoats(region, gap, makersAvailable) {"""
helper = """function availableShipbuildingInput(region, key) {
  if (key === 'metal') return (region.stockpile.bronze || 0) + (region.stockpile.iron || 0) + (region.stockpile.steel || 0);
  if (key === 'machine') return region.industrialSupply?.inventory?.machine_components || 0;
  return region.stockpile[key] || 0;
}

function consumeShipbuildingInput(region, key, amount) {
  if (key === 'metal') {
    for (const metal of ['bronze', 'iron', 'steel']) {
      const used = Math.min(amount, region.stockpile[metal] || 0);
      region.stockpile[metal] = (region.stockpile[metal] || 0) - used;
      amount -= used;
    }
    return;
  }
  if (key === 'machine') {
    region.industrialSupply.inventory.machine_components -= amount;
    return;
  }
  region.stockpile[key] = (region.stockpile[key] || 0) - amount;
}

export function buildWarshipClass(region, designId, gap, makersAvailable) {
  const cost = WARSHIP_BUILD_COST[designId];
  const rate = WARSHIP_BUILD_RATE[designId] || 0;
  if (!cost || rate <= 0 || gap <= 0 || makersAvailable <= 0) return { built: 0, makers: 0, designId };
  let possible = Math.min(gap, makersAvailable * rate);
  for (const [key, amount] of Object.entries(cost)) possible = Math.min(possible, availableShipbuildingInput(region, key) / amount);
  possible = Math.max(0, possible);
  if (possible <= 0) return { built: 0, makers: 0, designId };
  for (const [key, amount] of Object.entries(cost)) consumeShipbuildingInput(region, key, possible * amount);
  return { built: possible, makers: possible / rate, designId };
}

export function buildFleetBoats(region, gap, makersAvailable) {"""
labor = replace_once(labor, marker, helper, 'class shipbuilder')

old_navy = """    const navyGap = Math.max(0, region.targetNavySize - region.navy.boats);
    const navyBoatsWanted = navyGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);
    const navyMakersWanted = BOATMAKER_BUILD_RATE > 0 ? navyBoatsWanted / BOATMAKER_BUILD_RATE : 0;
    const navyMakersAvailable = Math.min(navyMakersWanted, remainingSurplus);
    const navyBuild = buildFleetBoats(region, Math.min(navyGap, navyBoatsWanted), navyMakersAvailable);
    region.navy.boats += navyBuild.built;
    region.navy.advancedBoats = (region.navy.advancedBoats || 0) + navyBuild.advanced;
    const navyMakersUsed = navyBuild.makers;
"""
new_navy = """    const procurement = ensureNavalProcurement(region);
    const targetTotal = Object.values(procurement.targets || {}).reduce((sum, value) => sum + Math.max(0, Math.round(value || 0)), 0);
    if (targetTotal !== Math.max(0, Math.round(region.targetNavySize || 0))) refreshNavalProcurementTargets(region, currentTick);
    procurement.built = { ...(procurement.built || {}) };
    const navyGap = Math.max(0, region.targetNavySize - region.navy.boats);
    let navyMakersUsed = 0;
    let navyBuilt = 0;
    let navyAdvancedBuilt = 0;
    for (const [designId, wanted] of Object.entries(procurement.targets)) {
      const already = Math.max(0, procurement.built[designId] || 0);
      const classGap = Math.max(0, wanted - already);
      if (classGap <= 0) continue;
      const classWanted = classGap * Math.min(1, BOAT_MOBILIZATION_RATE * weekScale);
      const build = buildWarshipClass(region, designId, classWanted, Math.max(0, remainingSurplus - navyMakersUsed));
      if (build.built <= 0) continue;
      procurement.built[designId] = already + build.built;
      navyBuilt += build.built;
      if (SHIP_DESIGNS[designId]?.advanced) navyAdvancedBuilt += build.built;
      navyMakersUsed += build.makers;
    }
    region.navy.boats += navyBuilt;
    region.navy.advancedBoats = (region.navy.advancedBoats || 0) + navyAdvancedBuilt;
"""
labor = replace_once(labor, old_navy, new_navy, 'class-aware naval procurement')
labor_path.write_text(labor)

print('class-aware naval procurement integrated')
