import { BATTERY_TECH_IDS, batteryMobilityCapability } from '../economy/batteryStorage.js?v=20260920-battery1';
import { NUCLEAR_POWER_TECH_ID, REACTOR_ENGINEERING_TECH_ID } from '../economy/nuclearPower.js?v=20260920-nuclear1';

const DAYS_PER_WEEK = 7;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const nonNegative = (v) => Math.max(0, Number(v) || 0);
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id));

export const SUBMARINE_SNORKEL_TECH_ID = 'submarine_snorkel';
export const NAVAL_REACTOR_TECH_ID = 'naval_reactor_propulsion';

export const SUBMARINE_PROPULSION = Object.freeze({
  DIESEL_ELECTRIC: 'diesel_electric',
  NUCLEAR: 'nuclear',
});

export const SUBMARINE_MODES = Object.freeze({
  QUIET: 'quiet_submerged',
  SUBMERGED: 'submerged_cruise',
  SNORKEL: 'snorkelling',
  SURFACED: 'surfaced_recharge',
  NUCLEAR_CRUISE: 'nuclear_submerged',
});

function primitiveBatteryCapability() {
  return { available: true, chemistry: 'primitive_lead_acid', energyDensity: 0.12, endurance: 0.18, quietPropulsion: 0.22 };
}

export function submarineTechnologyChances(region, byId) {
  const tech = region?.unlockedTechIds || new Set();
  const contacts = new Set([...(region?.neighbors || []), ...(region?.tradePartnerIds || [])]);
  if (region?.recentTradePartners instanceof Map) for (const id of region.recentTradePartners.keys()) contacts.add(id);
  const diffusion = (techId, base) => {
    let n = 0;
    for (const id of contacts) if (byId.get(id)?.unlockedTechIds?.has?.(techId)) n++;
    return 1 - Math.pow(1 - base, n);
  };
  const machining = clamp(region?.industrialSupply?.capability?.precision_machining || 0);
  const marine = clamp(region?.industrialMarine?.marineEngineering || 0);
  const electricity = clamp(region?.electricity?.industrialService || 0);
  const nuclear = clamp(region?.nuclearPower?.operationsExperience || 0);

  const snorkel = tech.has(SUBMARINE_SNORKEL_TECH_ID) || !tech.has('practical_submarine') ? 0 :
    (0.22 + machining * 0.38 + marine * 0.40) * 0.000006 + diffusion(SUBMARINE_SNORKEL_TECH_ID, 0.00012);
  const navalReactor = tech.has(NAVAL_REACTOR_TECH_ID) || !tech.has('practical_submarine') ||
    !tech.has(NUCLEAR_POWER_TECH_ID) || !tech.has(REACTOR_ENGINEERING_TECH_ID) ? 0 :
    (0.15 + machining * 0.25 + marine * 0.27 + electricity * 0.18 + nuclear * 0.15) * 0.0000018 +
    diffusion(NAVAL_REACTOR_TECH_ID, 0.000025);
  return { snorkel: clamp(snorkel), navalReactor: clamp(navalReactor) };
}

export function tickSubmarineBreakthroughs(regions, currentTick, rng = Math.random, elapsedDays = 7) {
  const events = [];
  const byId = new Map((regions || []).map((r) => [r.id, r]));
  const scale = Math.max(0, Number(elapsedDays) || 0) / DAYS_PER_WEEK;
  for (const region of regions || []) {
    if (!region.isCoastal) continue;
    region.unlockedTechIds ||= new Set();
    const chances = submarineTechnologyChances(region, byId);
    const attempts = [
      ['snorkel', SUBMARINE_SNORKEL_TECH_ID, 'Submarine snorkel', 'Air-induction masts let diesel-electric submarines run engines and refresh their atmosphere while remaining mostly submerged.'],
      ['navalReactor', NAVAL_REACTOR_TECH_ID, 'Naval reactor propulsion', 'Compact reactor engineering makes sustained high-endurance submerged propulsion practical.'],
    ];
    for (const [key, techId, title, message] of attempts) {
      if (region.unlockedTechIds.has(techId)) continue;
      const chance = 1 - Math.pow(1 - (chances[key] || 0), scale);
      if ((rng?.() ?? Math.random()) >= chance) continue;
      region.unlockedTechIds.add(techId);
      events.push({ type: 'submarine_technology_breakthrough', techId, regionId: region.id, regionName: region.name, tick: currentTick, title: `${title} developed`, message: `${region.name}: ${message}` });
      break;
    }
  }
  return events;
}

export function ensureSubmarineSystems(ship, ownerRegion) {
  if (!ship || ship.designId !== 'submarine') return null;
  if (!ship.submarineSystems) {
    const nuclear = hasTech(ownerRegion, NAVAL_REACTOR_TECH_ID);
    const battery = batteryMobilityCapability(ownerRegion);
    ship.submarineSystems = {
      propulsion: nuclear ? SUBMARINE_PROPULSION.NUCLEAR : SUBMARINE_PROPULSION.DIESEL_ELECTRIC,
      batteryCharge: 1,
      atmosphereReserve: 1,
      storesReserve: 1,
      mode: nuclear ? SUBMARINE_MODES.NUCLEAR_CRUISE : SUBMARINE_MODES.SUBMERGED,
      batteryChemistry: battery.available ? battery.chemistry : 'primitive_lead_acid',
      dieselConsumed: 0,
      reactorFuelConsumed: 0,
      lastSignature: nuclear ? 0.34 : 0.42,
      lastEnduranceReason: null,
    };
  }
  return ship.submarineSystems;
}

export function submarineBatteryCapability(ownerRegion) {
  const capability = batteryMobilityCapability(ownerRegion);
  return capability.available ? capability : primitiveBatteryCapability();
}

function dieselAvailable(region) {
  return nonNegative(region?.stockpile?.diesel);
}

function consumeDiesel(region, requested) {
  region.stockpile ||= {};
  const used = Math.min(dieselAvailable(region), Math.max(0, requested));
  region.stockpile.diesel = dieselAvailable(region) - used;
  return used;
}

function selectConventionalMode(state, ownerRegion, requestedMode = null) {
  if (requestedMode === SUBMARINE_MODES.QUIET && state.batteryCharge > 0.08 && state.atmosphereReserve > 0.08) return requestedMode;
  if (requestedMode === SUBMARINE_MODES.SUBMERGED && state.batteryCharge > 0.12 && state.atmosphereReserve > 0.10) return requestedMode;
  const needsRecharge = state.batteryCharge < 0.24 || state.atmosphereReserve < 0.20;
  if (needsRecharge) return hasTech(ownerRegion, SUBMARINE_SNORKEL_TECH_ID) ? SUBMARINE_MODES.SNORKEL : SUBMARINE_MODES.SURFACED;
  return requestedMode || SUBMARINE_MODES.QUIET;
}

export function setSubmarineMode(ship, ownerRegion, requestedMode) {
  const state = ensureSubmarineSystems(ship, ownerRegion);
  if (!state) return { changed: false, reason: 'not_submarine' };
  if (state.propulsion === SUBMARINE_PROPULSION.NUCLEAR) {
    state.mode = SUBMARINE_MODES.NUCLEAR_CRUISE;
    return { changed: requestedMode === SUBMARINE_MODES.NUCLEAR_CRUISE, mode: state.mode };
  }
  const mode = selectConventionalMode(state, ownerRegion, requestedMode);
  state.mode = mode;
  return { changed: mode === requestedMode, mode };
}

export function tickSubmarineShip(ship, ownerRegion, { elapsedDays = 7, requestedMode = null, atSea = true } = {}) {
  const state = ensureSubmarineSystems(ship, ownerRegion);
  if (!state) return null;
  const days = Math.max(0, Number(elapsedDays) || 0);
  const scale = days / DAYS_PER_WEEK;
  const battery = submarineBatteryCapability(ownerRegion);

  if (!atSea) {
    state.batteryCharge = 1;
    state.atmosphereReserve = 1;
    state.storesReserve = 1;
    state.mode = state.propulsion === SUBMARINE_PROPULSION.NUCLEAR ? SUBMARINE_MODES.NUCLEAR_CRUISE : SUBMARINE_MODES.SUBMERGED;
    state.lastSignature = 0.12;
    state.lastEnduranceReason = null;
    return { ...state, recharging: false, surfaced: false };
  }

  if (state.propulsion === SUBMARINE_PROPULSION.NUCLEAR) {
    state.mode = SUBMARINE_MODES.NUCLEAR_CRUISE;
    state.batteryCharge = clamp(state.batteryCharge + 0.03 * scale);
    state.atmosphereReserve = clamp(state.atmosphereReserve + 0.08 * scale);
    state.storesReserve = clamp(state.storesReserve - 0.018 * scale);
    state.reactorFuelConsumed = nonNegative(state.reactorFuelConsumed) + 0.0012 * scale;
    state.lastSignature = clamp(0.31 - battery.quietPropulsion * 0.035, 0.22, 0.34);
    state.lastEnduranceReason = state.storesReserve < 0.12 ? 'stores' : null;
    return { ...state, recharging: false, surfaced: false };
  }

  state.mode = selectConventionalMode(state, ownerRegion, requestedMode);
  let batteryDelta = 0;
  let airDelta = 0;
  let signature = 0.40;
  let dieselConsumed = 0;
  if (state.mode === SUBMARINE_MODES.QUIET) {
    batteryDelta = -(0.115 - battery.endurance * 0.045) * scale;
    airDelta = -0.105 * scale;
    signature = clamp(0.19 - battery.quietPropulsion * 0.055, 0.10, 0.19);
  } else if (state.mode === SUBMARINE_MODES.SUBMERGED) {
    batteryDelta = -(0.205 - battery.endurance * 0.065) * scale;
    airDelta = -0.12 * scale;
    signature = 0.29;
  } else {
    const snorkelling = state.mode === SUBMARINE_MODES.SNORKEL;
    const fuelNeed = (snorkelling ? 0.72 : 0.88) * scale;
    dieselConsumed = consumeDiesel(ownerRegion, fuelNeed);
    const fuelRatio = fuelNeed > 0 ? clamp(dieselConsumed / fuelNeed) : 1;
    batteryDelta = (0.48 + battery.quietPropulsion * 0.18) * scale * fuelRatio;
    airDelta = (snorkelling ? 0.68 : 1.05) * scale;
    signature = snorkelling ? 0.68 : 0.94;
    if (fuelRatio < 0.12) {
      batteryDelta = 0;
      state.lastEnduranceReason = 'diesel';
    }
  }
  state.batteryCharge = clamp(state.batteryCharge + batteryDelta);
  state.atmosphereReserve = clamp(state.atmosphereReserve + airDelta);
  state.storesReserve = clamp(state.storesReserve - 0.026 * scale);
  state.dieselConsumed = nonNegative(state.dieselConsumed) + dieselConsumed;
  state.batteryChemistry = battery.chemistry;
  state.lastSignature = signature;
  if (state.atmosphereReserve <= 0.03) state.lastEnduranceReason = 'atmosphere';
  else if (state.batteryCharge <= 0.03) state.lastEnduranceReason = 'battery';
  else if (state.storesReserve <= 0.06) state.lastEnduranceReason = 'stores';
  else if (state.lastEnduranceReason !== 'diesel') state.lastEnduranceReason = null;

  return {
    ...state,
    recharging: state.mode === SUBMARINE_MODES.SNORKEL || state.mode === SUBMARINE_MODES.SURFACED,
    surfaced: state.mode === SUBMARINE_MODES.SURFACED,
  };
}

export function tickSubmarineFleet(fleet, ownerRegion, { elapsedDays = 7 } = {}) {
  if (!fleet?.ships?.length || !fleet.ships.every((s) => s.designId === 'submarine')) return null;
  const atSea = fleet.locationType === 'sea';
  const requestedMode = fleet.submarineMode || null;
  const states = fleet.ships.map((ship) => tickSubmarineShip(ship, ownerRegion, { elapsedDays, requestedMode, atSea })).filter(Boolean);
  if (!states.length) return null;
  const average = (key) => states.reduce((sum, s) => sum + nonNegative(s[key]), 0) / states.length;
  fleet.submarineStatus = {
    propulsion: states.every((s) => s.propulsion === SUBMARINE_PROPULSION.NUCLEAR) ? SUBMARINE_PROPULSION.NUCLEAR :
      states.every((s) => s.propulsion === SUBMARINE_PROPULSION.DIESEL_ELECTRIC) ? SUBMARINE_PROPULSION.DIESEL_ELECTRIC : 'mixed',
    mode: states.every((s) => s.mode === states[0].mode) ? states[0].mode : 'mixed',
    batteryCharge: average('batteryCharge'),
    atmosphereReserve: average('atmosphereReserve'),
    storesReserve: average('storesReserve'),
    signature: average('lastSignature'),
    recharging: states.some((s) => s.recharging),
    surfaced: states.some((s) => s.surfaced),
  };
  return fleet.submarineStatus;
}

export function submarineDetectionSignature(fleet) {
  const s = fleet?.submarineStatus;
  if (!s) return 0.42;
  return clamp(s.signature, 0.08, 1);
}

export function submarineCanAmbush(fleet) {
  const s = fleet?.submarineStatus;
  if (!s) return true;
  if (s.mode === SUBMARINE_MODES.SURFACED || s.mode === SUBMARINE_MODES.SNORKEL) return false;
  return s.atmosphereReserve > 0.025 && (s.propulsion === SUBMARINE_PROPULSION.NUCLEAR || s.batteryCharge > 0.025);
}

export { BATTERY_TECH_IDS };
