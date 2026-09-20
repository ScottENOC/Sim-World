import { operationalInfrastructure } from '../economy/construction.js?v=20260918-aviation1';
import { createEquipmentDesign, currentEquipmentDesign } from './equipmentGenerations.js?v=20260919-aircraft-industry2';
import { airDefenceEngagementRisk } from './preDigitalAirNaval.js?v=20260919-aa-naval1';
import { assignAircraftCrew, aircraftCrewReadiness, recordAircraftCrewPractice, resolveAircraftCrewLoss } from './qualifiedPersonnel.js?v=20260919-personnel1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const has = (r, id) => Boolean(r?.unlockedTechIds?.has?.(id));
const actorId = (r) => r?.governance?.sovereignPolityId || r?.controllingActorId || r?.polityId || r?.id || null;

export const ROTARY_WING_FLIGHT_TECH_ID = 'rotary_wing_flight';
export const AIR_ASSAULT_TECH_ID = 'air_assault';
export const ATTACK_HELICOPTER_TECH_ID = 'attack_helicopter';
export const TRANSPORT_HELICOPTER_FAMILY = 'transport_helicopter';
export const ATTACK_HELICOPTER_FAMILY = 'attack_helicopter';

export const HELICOPTER_ROLES = Object.freeze({
  TRANSPORT: 'transport_helicopter',
  ATTACK: 'attack_helicopter',
});

export const HELICOPTER_MISSIONS = Object.freeze({
  IDLE: 'helicopter_idle',
  AIR_ASSAULT: 'helicopter_air_assault',
  RAPID_REDEPLOYMENT: 'helicopter_rapid_redeployment',
  CLOSE_SUPPORT: 'helicopter_close_support',
});

function ensureAviation(region) {
  region.aviation ||= { aircraft: [], flightExperience: 0, lastBreakthroughs: [], civilianDemand: 0 };
  region.aviation.aircraft ||= [];
  return region.aviation;
}

export function ensureRotorcraftState(region) {
  const av = ensureAviation(region);
  av.rotorcraft ||= {
    operationalExperience: 0,
    buildExperience: 0,
    nextId: 1,
    componentExperience: {
      rotorSystem: 0,
      rotorTransmission: 0,
      flightControls: 0,
      fieldMaintenance: 0,
      weaponsIntegration: 0,
    },
  };
  av.rotorcraft.componentExperience ||= {};
  for (const key of ['rotorSystem', 'rotorTransmission', 'flightControls', 'fieldMaintenance', 'weaponsIntegration']) {
    if (!Number.isFinite(av.rotorcraft.componentExperience[key])) av.rotorcraft.componentExperience[key] = 0;
  }
  if (!Number.isFinite(av.rotorcraft.operationalExperience)) av.rotorcraft.operationalExperience = 0;
  if (!Number.isFinite(av.rotorcraft.buildExperience)) av.rotorcraft.buildExperience = 0;
  if (!Number.isFinite(av.rotorcraft.nextId)) av.rotorcraft.nextId = 1;
  return av.rotorcraft;
}

function industrialReadiness(region) {
  const c = region.industrialSupply?.capability || {};
  return clamp((c.precision_machining || 0) * .45 + (c.steelmaking || 0) * .15 + (region.structuralTransformation?.capability?.manufacture || 0) * .25 + (region.electricity?.industrialService || 0) * .15);
}

function connectedSources(region, regionsById, techId) {
  const ids = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) ids.add(id);
  if (region.recentTradePartners?.keys) for (const id of region.recentTradePartners.keys()) ids.add(id);
  return [...ids].filter(id => regionsById.get(id)?.unlockedTechIds?.has?.(techId)).length;
}

function industrialComponents(region) {
  const c = region.industrialPlants?.componentCapability || {};
  return {
    engine: clamp(c.aircraft_engine || Math.max(.02, (c.engine || 0) * .45)),
    transmission: clamp(c.transmission || 0),
    airframe: clamp(c.airframe || 0),
    radio: clamp(c.radio_navigation || (c.electronics || 0) * .35),
    optics: clamp(c.optics || 0),
    weapons: clamp(c.aircraft_weapon || (c.gun_system || 0) * .35),
  };
}

function learn(value, amount) {
  return clamp(value + Math.max(0, amount) * (1 - value));
}

function recordRotorcraftLearning(region, { build = 0, operation = 0, attack = false } = {}) {
  const state = ensureRotorcraftState(region), e = state.componentExperience;
  if (build > 0) {
    state.buildExperience += build;
    e.rotorSystem = learn(e.rotorSystem, .018 * build);
    e.rotorTransmission = learn(e.rotorTransmission, .016 * build);
    e.flightControls = learn(e.flightControls, .010 * build);
    e.fieldMaintenance = learn(e.fieldMaintenance, .008 * build);
    if (attack) e.weaponsIntegration = learn(e.weaponsIntegration, .010 * build);
  }
  if (operation > 0) {
    state.operationalExperience += operation;
    e.rotorSystem = learn(e.rotorSystem, .0014 * operation);
    e.rotorTransmission = learn(e.rotorTransmission, .0013 * operation);
    e.flightControls = learn(e.flightControls, .0015 * operation);
    e.fieldMaintenance = learn(e.fieldMaintenance, .0018 * operation);
    if (attack) e.weaponsIntegration = learn(e.weaponsIntegration, .0016 * operation);
  }
  const productId = attack ? ATTACK_HELICOPTER_FAMILY : TRANSPORT_HELICOPTER_FAMILY;
  if (region.industrialPlants?.productExperience) {
    region.industrialPlants.productExperience[productId] = learn(region.industrialPlants.productExperience[productId] || 0, build * .012 + operation * .0011);
  }
}

export function tickHelicopterBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const years = Math.max(.0001, elapsedDays / DAYS_PER_YEAR), byId = new Map(regions.map(r => [r.id, r])), events = [];
  for (const region of regions) {
    const state = ensureRotorcraftState(region), c = industrialComponents(region), industry = industrialReadiness(region);
    const rotarySources = connectedSources(region, byId, ROTARY_WING_FLIGHT_TECH_ID);
    if (!has(region, ROTARY_WING_FLIGHT_TECH_ID) && has(region, 'powered_flight') && c.engine > .28 && c.transmission > .22 && c.airframe > .22 && industry > .42) {
      const flightExperience = clamp((region.aviation?.flightExperience || 0) / 400);
      const annual = clamp(.0015 + c.engine * .010 + c.transmission * .012 + c.airframe * .007 + flightExperience * .012 + rotarySources * .018, 0, .12);
      if (rng() < 1 - Math.pow(1 - annual, years)) {
        region.unlockedTechIds.add(ROTARY_WING_FLIGHT_TECH_ID);
        events.push({ type: 'aviation_breakthrough', techId: ROTARY_WING_FLIGHT_TECH_ID, regionId: region.id, title: 'Practical rotary-wing flight' });
      }
    }
    if (has(region, ROTARY_WING_FLIGHT_TECH_ID) && has(region, 'military_aviation') && !has(region, AIR_ASSAULT_TECH_ID) && state.operationalExperience > 12) {
      const annual = clamp(.008 + state.componentExperience.fieldMaintenance * .018 + state.componentExperience.flightControls * .014 + connectedSources(region, byId, AIR_ASSAULT_TECH_ID) * .02, 0, .16);
      if (rng() < 1 - Math.pow(1 - annual, years)) {
        region.unlockedTechIds.add(AIR_ASSAULT_TECH_ID);
        events.push({ type: 'aviation_breakthrough', techId: AIR_ASSAULT_TECH_ID, regionId: region.id, title: 'Heliborne air-assault doctrine' });
      }
    }
    if (has(region, AIR_ASSAULT_TECH_ID) && has(region, 'aircraft_armament') && !has(region, ATTACK_HELICOPTER_TECH_ID) && c.weapons > .30 && state.operationalExperience > 35) {
      const annual = clamp(.004 + c.weapons * .016 + state.componentExperience.weaponsIntegration * .022 + connectedSources(region, byId, ATTACK_HELICOPTER_TECH_ID) * .018, 0, .13);
      if (rng() < 1 - Math.pow(1 - annual, years)) {
        region.unlockedTechIds.add(ATTACK_HELICOPTER_TECH_ID);
        events.push({ type: 'aviation_breakthrough', techId: ATTACK_HELICOPTER_TECH_ID, regionId: region.id, title: 'Dedicated attack helicopter' });
      }
    }
  }
  return events;
}

export function helicopterDesignFrontier(region, role = HELICOPTER_ROLES.TRANSPORT) {
  const c = industrialComponents(region), state = ensureRotorcraftState(region), e = state.componentExperience;
  const productExperience = clamp(region.industrialPlants?.productExperience?.[role] || 0);
  const attack = role === HELICOPTER_ROLES.ATTACK;
  const power = clamp(c.engine * .58 + e.rotorTransmission * .25 + c.transmission * .17);
  const rotor = clamp(e.rotorSystem * .58 + e.flightControls * .22 + c.airframe * .12 + c.transmission * .08);
  const integration = clamp(productExperience * .42 + e.fieldMaintenance * .22 + e.flightControls * .20 + state.buildExperience / 80 * .16);
  const weapons = clamp(c.weapons * .48 + c.optics * .18 + c.radio * .10 + e.weaponsIntegration * .24);
  return {
    family: role,
    speed: clamp(.10 + power * .42 + rotor * .28),
    range: clamp(.08 + power * .32 + c.radio * .10 + integration * .18),
    payload: clamp((attack ? .12 : .25) + power * (attack ? .18 : .38) + rotor * .15),
    manoeuvrability: clamp(.18 + rotor * .50 + e.flightControls * .18),
    reliability: clamp(.24 + c.engine * .15 + c.transmission * .13 + e.fieldMaintenance * .24 + integration * .24),
    firepower: attack ? clamp(.18 + weapons * .66 + integration * .10) : clamp(.03 + weapons * .08),
    hoverLift: clamp(.18 + power * .38 + rotor * .32),
    battlefieldPersistence: clamp(.20 + e.fieldMaintenance * .34 + integration * .30 + c.radio * .12),
    fieldBasing: clamp(.22 + e.fieldMaintenance * .46 + reliabilityFrom(power, rotor, integration) * .18),
    troopLift: attack ? 0 : clamp(.18 + power * .34 + rotor * .25 + integration * .12),
    antiArmour: attack ? clamp(.10 + weapons * .56 + c.optics * .14 + integration * .10) : 0,
    enginePower: power,
    radioNavigation: c.radio,
    integration,
  };
}

function reliabilityFrom(power, rotor, integration) {
  return clamp(power * .25 + rotor * .35 + integration * .40);
}

function designScore(stats) {
  return (stats.reliability || 0) * .22 + (stats.range || 0) * .10 + (stats.payload || 0) * .12 + (stats.manoeuvrability || 0) * .10 + (stats.hoverLift || 0) * .16 + (stats.battlefieldPersistence || 0) * .12 + (stats.firepower || 0) * .10 + (stats.troopLift || 0) * .08;
}

export function helicopterDesignImprovement(region, role = HELICOPTER_ROLES.TRANSPORT) {
  const frontier = helicopterDesignFrontier(region, role), current = currentEquipmentDesign(region, role);
  if (!current) return 1;
  return Math.max(0, designScore(frontier) - designScore(current.stats || {}));
}

export function ensureCurrentHelicopterDesign(region, role = HELICOPTER_ROLES.TRANSPORT, tick = 0) {
  return currentEquipmentDesign(region, role) || createEquipmentDesign(region, role, helicopterDesignFrontier(region, role), { reason: 'first_rotary_wing_design', tick, authorisedBy: 'initial_standard' });
}

export function authoriseHelicopterGeneration(region, role = HELICOPTER_ROLES.TRANSPORT, { tick = 0, authorisedBy = 'player' } = {}) {
  if (!has(region, ROTARY_WING_FLIGHT_TECH_ID)) return { authorised: false, reason: 'rotary_wing_flight_not_known' };
  if (role === HELICOPTER_ROLES.ATTACK && !has(region, ATTACK_HELICOPTER_TECH_ID)) return { authorised: false, reason: 'attack_helicopter_not_known' };
  const current = currentEquipmentDesign(region, role), improvement = helicopterDesignImprovement(region, role);
  if (current && improvement < .035) return { authorised: false, reason: 'insufficient_frontier_improvement', improvement };
  const design = createEquipmentDesign(region, role, helicopterDesignFrontier(region, role), { reason: 'rotorcraft_generation_upgrade', tick, authorisedBy });
  return { authorised: true, design, improvement };
}

function buildCost(role) {
  return role === HELICOPTER_ROLES.ATTACK
    ? { steel: 20, machine: 22, cash: 48 }
    : { steel: 14, machine: 16, cash: 32 };
}

function spendBuildInputs(region, cost) {
  region.stockpile ||= {};
  region.industrialSupply ||= {};
  region.industrialSupply.inventory ||= {};
  const inv = region.industrialSupply.inventory;
  if ((region.stockpile.steel || 0) < cost.steel || (inv.machine_components || 0) < cost.machine || (region.treasury || 0) < cost.cash) return false;
  region.stockpile.steel -= cost.steel;
  inv.machine_components -= cost.machine;
  region.treasury -= cost.cash;
  region.wallet = (region.wallet || 0) + cost.cash;
  return true;
}

export function canBuildHelicopter(region, role = HELICOPTER_ROLES.TRANSPORT) {
  if (!has(region, ROTARY_WING_FLIGHT_TECH_ID) || !has(region, 'military_aviation')) return false;
  if (role === HELICOPTER_ROLES.ATTACK && !has(region, ATTACK_HELICOPTER_TECH_ID)) return false;
  const c = industrialComponents(region);
  return industrialReadiness(region) > .38 && c.engine > .22 && c.transmission > .18 && c.airframe > .18;
}

export function buildHelicopter(region, { role = HELICOPTER_ROLES.TRANSPORT, tick = 0 } = {}) {
  if (!canBuildHelicopter(region, role)) return null;
  if (!spendBuildInputs(region, buildCost(role))) return null;
  const state = ensureRotorcraftState(region), design = ensureCurrentHelicopterDesign(region, role, tick), foundingMilitaryCadre = !region.qualifiedMilitaryPersonnel;
  const helicopter = {
    id: `helo-${region.id || 'region'}-${state.nextId++}`,
    aircraftType: 'helicopter',
    ownerType: 'military',
    ownerActorId: actorId(region),
    role,
    baseType: operationalInfrastructure(region, 'airfield') ? 'airfield' : 'field_site',
    homeBaseRegionId: region.id,
    baseRegionId: region.id,
    condition: 1,
    fuel: 1,
    status: 'serviceable',
    mission: HELICOPTER_MISSIONS.IDLE,
    targetRegionId: null,
    pilotExperience: 0,
    totalFlights: 0,
    repairNeed: 0,
    designId: design.id,
    modelName: design.name,
    designSequence: design.sequence,
    designStats: { ...design.stats },
  };
  ensureAviation(region).aircraft.push(helicopter);
  assignAircraftCrew(region, helicopter, { bootstrap: foundingMilitaryCadre });
  recordRotorcraftLearning(region, { build: 1, attack: role === HELICOPTER_ROLES.ATTACK });
  return helicopter;
}

export function assignHelicopterMission(region, helicopterId, mission, targetRegionId = null) {
  const h = ensureAviation(region).aircraft.find(a => a.id === helicopterId && a.aircraftType === 'helicopter');
  if (!h || h.status === 'destroyed' || h.condition < .42) return { assigned: false, reason: 'unserviceable' };
  if (aircraftCrewReadiness(h) < .35) return { assigned: false, reason: 'no_qualified_aircrew' };
  if ([HELICOPTER_MISSIONS.AIR_ASSAULT, HELICOPTER_MISSIONS.RAPID_REDEPLOYMENT].includes(mission) && h.role !== HELICOPTER_ROLES.TRANSPORT) return { assigned: false, reason: 'transport_helicopter_required' };
  if (mission === HELICOPTER_MISSIONS.AIR_ASSAULT && !has(region, AIR_ASSAULT_TECH_ID)) return { assigned: false, reason: 'air_assault_doctrine_not_known' };
  if (mission === HELICOPTER_MISSIONS.CLOSE_SUPPORT && h.role !== HELICOPTER_ROLES.ATTACK) return { assigned: false, reason: 'attack_helicopter_required' };
  h.mission = mission;
  h.targetRegionId = targetRegionId;
  h.status = 'assigned';
  return { assigned: true, helicopter: h };
}

function damageHelicopter(region, h, amount, rng) {
  h.condition = clamp((h.condition ?? 1) - Math.max(0, amount));
  h.repairNeed = Math.max(h.repairNeed || 0, 1 - h.condition);
  if (h.condition <= .12) {
    h.status = 'destroyed';
    h.mission = HELICOPTER_MISSIONS.IDLE;
    resolveAircraftCrewLoss(region, h, { rng });
  } else if (h.condition < .42) {
    h.status = 'damaged';
    h.mission = HELICOPTER_MISSIONS.IDLE;
  }
  return h.status;
}

function missionFuel(h) {
  const persistence = clamp(h.designStats?.battlefieldPersistence || 0), range = clamp(h.designStats?.range || 0);
  const base = h.mission === HELICOPTER_MISSIONS.CLOSE_SUPPORT ? .26 : h.mission === HELICOPTER_MISSIONS.AIR_ASSAULT ? .22 : .17;
  return base * (1 - persistence * .16 - range * .08);
}

function fieldRepair(region, h, elapsedDays) {
  if (h.status === 'destroyed' || h.condition >= .999 || h.baseRegionId !== region.id) return;
  const stats = h.designStats || {}, field = clamp(stats.fieldBasing || 0), atAirfield = operationalInfrastructure(region, 'airfield');
  const rate = elapsedDays / DAYS_PER_YEAR * (atAirfield ? .9 : .28 + field * .35);
  const scale = Math.min(1 - h.condition, rate);
  if (scale <= 0) return;
  const cash = scale * 28, steel = scale * 5, machine = scale * 4;
  const inv = region.industrialSupply?.inventory || {};
  if ((region.treasury || 0) < cash || (region.stockpile?.steel || 0) < steel || (inv.machine_components || 0) < machine) return;
  region.treasury -= cash;
  region.wallet = (region.wallet || 0) + cash;
  region.stockpile.steel -= steel;
  inv.machine_components -= machine;
  h.condition = clamp(h.condition + scale);
  h.repairNeed = 1 - h.condition;
  if (h.condition >= .42 && h.status === 'damaged') h.status = 'serviceable';
}

export function helicopterBattlefieldSupport(region, targetRegionId = null) {
  const helicopters = ensureAviation(region).aircraft.filter(h => h.aircraftType === 'helicopter' && h.status !== 'destroyed' && (!targetRegionId || h.targetRegionId === targetRegionId));
  let troopLift = 0, rapidRedeployment = 0, closeSupport = 0, antiArmour = 0, persistence = 0;
  for (const h of helicopters) {
    const readiness = clamp((h.condition ?? 1) * (.65 + aircraftCrewReadiness(h) * .35)), s = h.designStats || {};
    if (h.role === HELICOPTER_ROLES.TRANSPORT) {
      troopLift += (s.troopLift || 0) * readiness;
      rapidRedeployment += (s.hoverLift || 0) * readiness;
    } else {
      closeSupport += (s.firepower || 0) * readiness;
      antiArmour += (s.antiArmour || 0) * readiness;
    }
    persistence += (s.battlefieldPersistence || 0) * readiness;
  }
  return { helicopters: helicopters.length, troopLift, rapidRedeployment, closeSupport, antiArmour, persistence };
}

export function tickHelicopters(regions, currentTick, elapsedDays = 7, rng = Math.random) {
  const byId = new Map(regions.map(r => [r.id, r])), events = [];
  for (const region of regions) {
    const av = ensureAviation(region);
    for (const h of av.aircraft.filter(a => a.aircraftType === 'helicopter')) {
      fieldRepair(region, h, elapsedDays);
      if (h.status === 'destroyed') continue;
      if ((h.fuel ?? 0) < 1) {
        const available = Math.max(0, region.stockpile?.aviation_fuel || 0), need = Math.max(0, 1 - h.fuel), take = Math.min(available, need);
        if (take > 0) { region.stockpile.aviation_fuel -= take; h.fuel = clamp((h.fuel || 0) + take); }
      }
      if (h.mission === HELICOPTER_MISSIONS.IDLE) continue;
      const target = byId.get(h.targetRegionId) || region, fuelNeed = missionFuel(h), stock = Math.max(0, region.stockpile?.aviation_fuel || 0);
      if (h.fuel < fuelNeed || stock < fuelNeed) {
        h.status = 'grounded';
        events.push({ type: 'helicopter_grounded_no_fuel', helicopterId: h.id, regionId: region.id });
        continue;
      }
      region.stockpile.aviation_fuel -= fuelNeed;
      h.fuel = clamp(h.fuel - fuelNeed * .18);
      h.totalFlights++;
      recordAircraftCrewPractice(h, 1);
      recordRotorcraftLearning(region, { operation: 1, attack: h.role === HELICOPTER_ROLES.ATTACK });

      const terrainMasking = clamp(.12 + (h.designStats?.manoeuvrability || 0) * .20), risk = clamp(airDefenceEngagementRisk(target, h) * (1.38 - terrainMasking));
      if (rng() < risk) {
        const reliability = clamp(h.designStats?.reliability || 0), damage = (.20 + rng() * .65) * (1 - reliability * .18), status = damageHelicopter(region, h, damage, rng);
        events.push({ type: status === 'destroyed' ? 'helicopter_shot_down' : 'helicopter_damaged', helicopterId: h.id, targetRegionId: target.id, damage });
      }
      if (h.status !== 'destroyed') {
        target.rotaryWingEffects ||= { tick: currentTick, troopLift: 0, rapidRedeployment: 0, closeSupport: 0, antiArmour: 0 };
        if (target.rotaryWingEffects.tick !== currentTick) target.rotaryWingEffects = { tick: currentTick, troopLift: 0, rapidRedeployment: 0, closeSupport: 0, antiArmour: 0 };
        const readiness = clamp(h.condition * (.65 + aircraftCrewReadiness(h) * .35)), s = h.designStats || {};
        if (h.mission === HELICOPTER_MISSIONS.AIR_ASSAULT) {
          target.rotaryWingEffects.troopLift += (s.troopLift || 0) * readiness;
          events.push({ type: 'helicopter_air_assault', helicopterId: h.id, targetRegionId: target.id, troopLift: (s.troopLift || 0) * readiness });
        } else if (h.mission === HELICOPTER_MISSIONS.RAPID_REDEPLOYMENT) {
          target.rotaryWingEffects.rapidRedeployment += (s.hoverLift || 0) * readiness;
          events.push({ type: 'helicopter_rapid_redeployment', helicopterId: h.id, targetRegionId: target.id, mobility: (s.hoverLift || 0) * readiness });
        } else if (h.mission === HELICOPTER_MISSIONS.CLOSE_SUPPORT) {
          target.rotaryWingEffects.closeSupport += (s.firepower || 0) * readiness;
          target.rotaryWingEffects.antiArmour += (s.antiArmour || 0) * readiness;
          target.warDamage ||= { infrastructureDamage: 0, bombardmentWeeks: 0 };
          target.warDamage.combatEquipmentAttrition = (target.warDamage.combatEquipmentAttrition || 0) + .0035 * readiness * ((s.firepower || 0) + (s.antiArmour || 0));
          events.push({ type: 'helicopter_close_support', helicopterId: h.id, targetRegionId: target.id, closeSupport: (s.firepower || 0) * readiness, antiArmour: (s.antiArmour || 0) * readiness });
        }
        h.condition = clamp(h.condition - .0025 * (1.15 - clamp(s.reliability || 0)));
      }
      if (h.status !== 'destroyed') {
        h.mission = HELICOPTER_MISSIONS.IDLE;
        h.status = h.condition < .42 ? 'damaged' : 'serviceable';
        h.targetRegionId = null;
      }
    }
  }
  return events;
}

export function helicopterSummary(region) {
  const helicopters = ensureAviation(region).aircraft.filter(a => a.aircraftType === 'helicopter'), state = ensureRotorcraftState(region);
  const models = new Map();
  for (const h of helicopters) {
    if (h.status === 'destroyed' || !h.designId) continue;
    const row = models.get(h.designId) || { designId: h.designId, name: h.modelName || 'Unknown helicopter', count: 0, role: h.role, stats: h.designStats || {} };
    row.count++;
    models.set(h.designId, row);
  }
  return {
    total: helicopters.filter(h => h.status !== 'destroyed').length,
    transport: helicopters.filter(h => h.status !== 'destroyed' && h.role === HELICOPTER_ROLES.TRANSPORT).length,
    attack: helicopters.filter(h => h.status !== 'destroyed' && h.role === HELICOPTER_ROLES.ATTACK).length,
    destroyed: helicopters.filter(h => h.status === 'destroyed').length,
    operationalExperience: state.operationalExperience,
    buildExperience: state.buildExperience,
    componentExperience: { ...state.componentExperience },
    models: [...models.values()],
  };
}
