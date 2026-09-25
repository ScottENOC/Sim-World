const trackers = new WeakMap();
const accumulators = new WeakMap();
let recording = true;
let suppressDepth = 0;

const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function emptyFlow() {
  return { production: {}, consumption: {}, netProduction: {} };
}

function accumulator(region) {
  if (!accumulators.has(region)) accumulators.set(region, emptyFlow());
  return accumulators.get(region);
}

function add(bucket, key, amount) {
  if (!(amount > 0)) return;
  bucket[key] = (bucket[key] || 0) + amount;
}

function recordDelta(region, key, delta) {
  if (!recording || suppressDepth > 0 || !key || !Number.isFinite(delta) || delta === 0) return;
  const flow = accumulator(region);
  if (delta > 0) add(flow.production, key, delta);
  else add(flow.consumption, key, -delta);
}

function trackedProxy(region, object) {
  const target = object && typeof object === 'object' ? object : {};
  return new Proxy(target, {
    set(targetObject, property, value) {
      const key = typeof property === 'string' ? property : null;
      const before = key ? number(targetObject[property]) : 0;
      const result = Reflect.set(targetObject, property, value);
      if (result && key) recordDelta(region, key, number(value) - before);
      return result;
    },
    deleteProperty(targetObject, property) {
      const key = typeof property === 'string' ? property : null;
      const before = key ? number(targetObject[property]) : 0;
      const result = Reflect.deleteProperty(targetObject, property);
      if (result && key && before > 0) recordDelta(region, key, -before);
      return result;
    },
  });
}

function ensureTracker(region) {
  let state = trackers.get(region);
  if (!state) {
    state = {};
    trackers.set(region, state);
  }

  region.stockpile ||= {};
  if (region.stockpile !== state.stockpileProxy) {
    state.stockpileTarget = region.stockpile;
    state.stockpileProxy = trackedProxy(region, region.stockpile);
    region.stockpile = state.stockpileProxy;
  }

  region.industrialSupply ||= {};
  region.industrialSupply.inventory ||= {};
  if (region.industrialSupply.inventory !== state.inventoryProxy) {
    state.inventoryTarget = region.industrialSupply.inventory;
    state.inventoryProxy = trackedProxy(region, region.industrialSupply.inventory);
    region.industrialSupply.inventory = state.inventoryProxy;
  }
  return state;
}

export function installResourceFlowTracking(regions = []) {
  for (const region of regions) ensureTracker(region);
  return regions.length;
}

export function withResourceFlowSuppressed(fn) {
  suppressDepth += 1;
  try { return fn(); }
  finally { suppressDepth = Math.max(0, suppressDepth - 1); }
}

export function setResourceFlowRecording(enabled) {
  recording = Boolean(enabled);
}

export function finalizeResourceFlowTick(regions = [], tickIndex = null, elapsedDays = 0) {
  installResourceFlowTracking(regions);
  for (const region of regions) {
    const current = accumulator(region);
    const keys = new Set([...Object.keys(current.production), ...Object.keys(current.consumption)]);
    const netProduction = {};
    for (const key of keys) netProduction[key] = (current.production[key] || 0) - (current.consumption[key] || 0);
    region.resourceFlow = {
      last: {
        production: { ...current.production },
        consumption: { ...current.consumption },
        netProduction,
      },
      lastTick: tickIndex,
      elapsedDays: Math.max(0, number(elapsedDays)),
    };
    accumulators.set(region, emptyFlow());
  }
}

export function resourceQuantity(region, resourceId) {
  if (!region || !resourceId) return 0;
  return Math.max(0, number(region.stockpile?.[resourceId])) +
    Math.max(0, number(region.industrialSupply?.inventory?.[resourceId]));
}

export function resourceMetricValue(region, resourceId, metric = 'stockpiled') {
  if (metric === 'stockpiled') return resourceQuantity(region, resourceId);
  if (metric === 'production') return Math.max(0, number(region?.resourceFlow?.last?.production?.[resourceId]));
  if (metric === 'consumption') return Math.max(0, number(region?.resourceFlow?.last?.consumption?.[resourceId]));
  if (metric === 'net') return number(region?.resourceFlow?.last?.netProduction?.[resourceId]);
  return 0;
}

export function availableResourceIds(regions = [], extraIds = []) {
  const ids = new Set(extraIds.filter(Boolean));
  for (const region of regions) {
    for (const key of Object.keys(region?.stockpile || {})) ids.add(key);
    for (const key of Object.keys(region?.industrialSupply?.inventory || {})) ids.add(key);
    for (const section of ['production', 'consumption', 'netProduction']) {
      for (const key of Object.keys(region?.resourceFlow?.last?.[section] || {})) ids.add(key);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}
