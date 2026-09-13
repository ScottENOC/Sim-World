import { ensureSettlements, principalSettlement } from '../society/settlements.js?v=20260907-settlements1';

const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;
}

function assetCount(region, typeId) {
  return (region.construction?.assets || []).filter((asset) => asset.typeId === typeId && (asset.condition ?? 1) > 0.25).length;
}

function desiredPlaceCount(region) {
  const population = Math.max(0, region.population || 0);
  const urban = Math.max(0, region.urbanisation?.urbanPopulation || 0);
  return {
    towns: Math.min(3, Math.max(0, Math.floor(Math.log10(Math.max(1, urban)) - 2.4))),
    villageDistricts: Math.min(4, Math.max(1, Math.ceil(Math.log10(Math.max(10, population)) - 3.1))),
  };
}

function place(id, name, kind, controllerActorId, strategicValue, population = 0) {
  return {
    id, name, kind, population: Math.max(0, Math.round(population)), strategicValue,
    nativeControllerActorId: controllerActorId,
    controllerActorId,
    occupationMode: 'sovereign',
    garrisonActorId: null,
    garrisonPersonnel: 0,
    contested: false,
    capturedTick: null,
  };
}

export function ensureSubregionalControl(region) {
  ensureSettlements(region);
  const sovereign = actorId(region);
  if (!region.subregionalControl || !Array.isArray(region.subregionalControl.places)) {
    const principal = principalSettlement(region);
    const counts = desiredPlaceCount(region);
    const places = [];
    const principalPopulation = Math.max(0, principal.population || 0, region.urbanisation?.urbanPopulation || 0);
    const principalKind = principalPopulation >= 5000 ? 'city' : principalPopulation >= 1000 ? 'town' : 'principal_settlement';
    places.push(place(`${region.id}:principal`, principal.name || region.name, principalKind, sovereign, 1, principalPopulation));
    if (region.isCoastal) places.push(place(`${region.id}:port`, `${region.name} harbour`, 'port', sovereign, 0.92, Math.min(principalPopulation, Math.max(100, principalPopulation * 0.22))));
    for (let i = 0; i < counts.towns; i++) places.push(place(`${region.id}:town:${i + 1}`, `${region.name} town ${i + 1}`, 'town', sovereign, 0.58 - i * 0.05, Math.max(150, (principal.population || 0) * (0.16 - i * 0.025))));
    for (let i = 0; i < counts.villageDistricts; i++) places.push(place(`${region.id}:rural:${i + 1}`, `${region.name} village district ${i + 1}`, 'village_district', sovereign, 0.28, 0));
    if (assetCount(region, 'hill_fort') + assetCount(region, 'coastal_fortifications') > 0) places.push(place(`${region.id}:fort`, `${region.name} fortified position`, 'fort', sovereign, 0.74, 0));
    region.subregionalControl = {
      version: 1,
      places,
      ruralControl: { [sovereign]: 1 },
      sovereignActorId: sovereign,
      operationalControllerActorId: sovereign,
      contested: false,
      lastChangedTick: 0,
    };
  }
  // New infrastructure can create a strategically meaningful node without rebuilding the map.
  const control = region.subregionalControl;
  control.sovereignActorId ||= sovereign;

  // Settlement entities are authoritative. Military control nodes reference the
  // same IDs rather than inventing parallel towns that disappear on conquest.
  const settlementLedger = ensureSettlements(region);
  for (const settlement of settlementLedger.places) {
    let node = control.places.find((candidate) => candidate.id === settlement.id);
    if (!node) {
      node = place(settlement.id, settlement.name, settlement.kind, control.sovereignActorId, settlement.isPrincipal ? 1 : 0.55, settlement.population || 0);
      control.places.push(node);
    }
    node.name = settlement.name;
    node.population = Math.max(0, Math.round(settlement.population || 0));
    node.settlementStatus = settlement.status || 'active';
    node.isSettlement = true;
    node.isPrincipalSettlement = !!settlement.isPrincipal;
    node.location = settlement.location || node.location;
    node.spatialSiteId = settlement.spatialSiteId || node.spatialSiteId;
    if (settlement.status === 'active') {
      node.kind = settlement.kind;
      node.strategicValue = settlement.isPrincipal ? 1 : settlement.kind === 'city' ? 0.78 : settlement.kind === 'town' ? 0.62 : 0.42;
    } else {
      node.kind = 'ruins';
      node.strategicValue = settlement.isPrincipal ? 0.36 : 0.14;
    }
  }
  if ((assetCount(region, 'hill_fort') + assetCount(region, 'coastal_fortifications')) > 0 && !control.places.some((p) => p.kind === 'fort')) {
    control.places.push(place(`${region.id}:fort`, `${region.name} fortified position`, 'fort', control.sovereignActorId, 0.74, 0));
  }
  return control;
}

function normaliseRural(control) {
  for (const [key, value] of Object.entries(control.ruralControl || {})) {
    if (value <= 0.0001) delete control.ruralControl[key];
  }
  const total = Object.values(control.ruralControl || {}).reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) {
    control.ruralControl = { [control.sovereignActorId]: 1 };
    return;
  }
  for (const key of Object.keys(control.ruralControl)) control.ruralControl[key] = Math.max(0, control.ruralControl[key]) / total;
}

function updateOperationalController(control) {
  const scores = new Map();
  for (const [actor, share] of Object.entries(control.ruralControl || {})) scores.set(actor, (scores.get(actor) || 0) + share * 0.55);
  for (const node of control.places) scores.set(node.controllerActorId, (scores.get(node.controllerActorId) || 0) + node.strategicValue * 0.11);
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  control.operationalControllerActorId = ranked[0]?.[0] || control.sovereignActorId;
  control.contested = ranked.length > 1 && (ranked[1][1] > ranked[0][1] * 0.28 || Object.keys(control.ruralControl || {}).length > 1);
}

export function establishCampaignFootprint(region, attackerActorId, currentTick, { viaSea = false } = {}) {
  const control = ensureSubregionalControl(region);
  control.ruralControl[attackerActorId] = Math.max(control.ruralControl[attackerActorId] || 0, viaSea ? 0.035 : 0.06);
  control.ruralControl[control.sovereignActorId] = Math.max(0, (control.ruralControl[control.sovereignActorId] || 0) - (viaSea ? 0.035 : 0.06));
  const preferred = viaSea ? control.places.find((p) => p.kind === 'port') : control.places.find((p) => p.kind === 'village_district');
  if (preferred && preferred.controllerActorId === control.sovereignActorId && preferred.kind === 'village_district') {
    preferred.controllerActorId = attackerActorId;
    preferred.occupationMode = 'military';
    preferred.capturedTick = currentTick;
  }
  normaliseRural(control); updateOperationalController(control); control.lastChangedTick = currentTick;
  return control;
}

function captureCandidate(control, attackerActorId, pressure) {
  const order = ['village_district', 'port', 'town', 'fort', 'principal_settlement', 'city'];
  const threshold = { village_district: 0.12, port: 0.24, town: 0.38, fort: 0.58, principal_settlement: 0.72, city: 0.78 };
  return control.places
    .filter((node) => node.controllerActorId !== attackerActorId && pressure >= (threshold[node.kind] ?? 0.5))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.strategicValue - a.strategicValue)[0] || null;
}

export function advanceCampaignControl(region, attackerActorId, pressureDelta, pressure, currentTick, options = {}) {
  const control = ensureSubregionalControl(region);
  if (pressureDelta > 0) {
    const gain = clamp(pressureDelta * 1.6 + Math.max(0, pressure - 0.55) * 0.012, 0, 0.09);
    const sovereignShare = control.ruralControl[control.sovereignActorId] || 0;
    const transferable = Math.min(gain, sovereignShare);
    control.ruralControl[control.sovereignActorId] = sovereignShare - transferable;
    control.ruralControl[attackerActorId] = (control.ruralControl[attackerActorId] || 0) + transferable;
    const candidate = options.capturePlaces === false ? null : captureCandidate(control, attackerActorId, pressure);
    if (candidate) {
      candidate.controllerActorId = attackerActorId;
      candidate.occupationMode = 'military';
      candidate.garrisonActorId = null;
      candidate.garrisonPersonnel = 0;
      candidate.capturedTick = currentTick;
    }
  } else if (pressureDelta < 0) {
    const lost = Math.min(control.ruralControl[attackerActorId] || 0, Math.abs(pressureDelta) * 0.8);
    control.ruralControl[attackerActorId] = Math.max(0, (control.ruralControl[attackerActorId] || 0) - lost);
    control.ruralControl[control.sovereignActorId] = (control.ruralControl[control.sovereignActorId] || 0) + lost;
  }
  normaliseRural(control); updateOperationalController(control); control.lastChangedTick = currentTick;
  return occupationSummary(region);
}

export function requiredGarrison(region, node) {
  const population = Math.max(0, node.population || 0);
  const kindBase = { city: 180, principal_settlement: 100, town: 70, port: 90, fort: 45, village_district: 24 }[node.kind] || 30;
  const hostility = clamp((1 - (region.stability ?? 0.7)) * 0.7 + (region.conflictPressure || 0) * 0.5);
  return Math.max(10, Math.round(kindBase + Math.sqrt(population) * (1.1 + hostility)));
}

export function assignOccupationGarrison(region, actor, personnel, currentTick) {
  const control = ensureSubregionalControl(region);
  let remaining = Math.max(0, Math.floor(personnel));
  const occupied = control.places.filter((node) => node.controllerActorId === actor && node.occupationMode === 'military')
    .sort((a, b) => b.strategicValue - a.strategicValue);
  let assigned = 0;
  for (const node of occupied) {
    const need = requiredGarrison(region, node);
    const amount = Math.min(remaining, need);
    node.garrisonActorId = amount > 0 ? actor : null;
    node.garrisonPersonnel = amount;
    remaining -= amount; assigned += amount;
  }
  control.lastChangedTick = currentTick;
  return { assigned, remaining };
}

export function releaseUnsupportedOccupation(region, actor, currentTick) {
  const control = ensureSubregionalControl(region);
  let reverted = 0;
  for (const node of control.places) {
    if (node.controllerActorId !== actor || node.occupationMode !== 'military') continue;
    if (node.garrisonActorId === actor && node.garrisonPersonnel >= requiredGarrison(region, node) * 0.55) continue;
    node.controllerActorId = node.nativeControllerActorId || control.sovereignActorId;
    node.occupationMode = 'sovereign';
    node.garrisonActorId = null;
    node.garrisonPersonnel = 0;
    reverted += 1;
  }
  // Unsupported rural occupation is presence-based too. Keep only a small share around surviving garrisons.
  const supportedNodes = control.places.filter((node) => node.garrisonActorId === actor && node.garrisonPersonnel > 0).length;
  const retained = Math.min(control.ruralControl[actor] || 0, supportedNodes * 0.045);
  const released = Math.max(0, (control.ruralControl[actor] || 0) - retained);
  control.ruralControl[actor] = retained;
  control.ruralControl[control.sovereignActorId] = (control.ruralControl[control.sovereignActorId] || 0) + released;
  normaliseRural(control); updateOperationalController(control); control.lastChangedTick = currentTick;
  return { reverted, releasedRuralShare: released };
}

export function convertOccupationToSovereignty(region, newActorId, currentTick) {
  const control = ensureSubregionalControl(region);
  control.sovereignActorId = newActorId;
  control.ruralControl = { [newActorId]: 1 };
  for (const node of control.places) {
    node.nativeControllerActorId = newActorId;
    node.controllerActorId = newActorId;
    node.occupationMode = 'sovereign';
    node.garrisonActorId = null;
    node.garrisonPersonnel = 0;
    node.contested = false;
  }
  control.operationalControllerActorId = newActorId;
  control.contested = false;
  control.lastChangedTick = currentTick;
  return control;
}

export function occupationSummary(region) {
  const control = ensureSubregionalControl(region);
  const byActor = {};
  for (const [actor, share] of Object.entries(control.ruralControl || {})) byActor[actor] = { ruralShare: share, places: [], strategicValue: 0 };
  for (const node of control.places) {
    byActor[node.controllerActorId] ||= { ruralShare: 0, places: [], strategicValue: 0 };
    byActor[node.controllerActorId].places.push({ id: node.id, name: node.name, kind: node.kind, garrisonPersonnel: node.garrisonPersonnel || 0 });
    byActor[node.controllerActorId].strategicValue += node.strategicValue;
  }
  return { sovereignActorId: control.sovereignActorId, operationalControllerActorId: control.operationalControllerActorId, contested: control.contested, byActor };
}
