const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(value) || 0));

export const ECONOMIC_SECTORS = Object.freeze([
  'agriculture',
  'mining',
  'manufacture',
  'shipping',
  'rail',
  'power_generation',
  'power_grid',
  'water',
  'telecommunications',
  'finance',
  'long_distance_trade',
  'infrastructure',
]);

export const INFRASTRUCTURE_OWNERSHIP_SECTORS = Object.freeze({
  port: 'shipping',
  canal: 'infrastructure',
  mine: 'mining',
  steelworks: 'manufacture',
  factory: 'manufacture',
  telegraph: 'telecommunications',
  power_generation: 'power_generation',
  power_grid: 'power_grid',
  water_supply: 'water',
});

export function ownershipSectorForInfrastructureType(type) {
  return INFRASTRUCTURE_OWNERSHIP_SECTORS[type] || 'infrastructure';
}

export const SECTOR_ACCESS = Object.freeze({
  OPEN: 'open',
  DOMESTIC_ONLY: 'domestic_only',
  LICENSED: 'licensed',
  STATE_MAJORITY: 'state_majority',
  STATE_MONOPOLY: 'state_monopoly',
});

function defaultSectorRule() {
  return {
    access: SECTOR_ACCESS.OPEN,
    foreignAllowed: true,
    maxForeignOwnership: 1,
    minimumStateShare: 0,
    licencePredictability: 0.75,
  };
}

export function ensureEconomicOwnershipPolicy(polity) {
  polity.economicOwnership ||= {};
  const state = polity.economicOwnership;
  state.nextEnterpriseId = Number.isFinite(state.nextEnterpriseId) ? state.nextEnterpriseId : 1;
  state.policyPredictability = Number.isFinite(state.policyPredictability) ? clamp(state.policyPredictability) : 0.65;
  state.nationalisationMemory = Number.isFinite(state.nationalisationMemory) ? clamp(state.nationalisationMemory) : 0;
  state.contractReliability = Number.isFinite(state.contractReliability) ? clamp(state.contractReliability) : 0.7;
  state.sectors ||= {};
  state.stateEnterprises ||= [];
  for (const sector of ECONOMIC_SECTORS) {
    state.sectors[sector] ||= defaultSectorRule();
    const rule = state.sectors[sector];
    if (!Object.values(SECTOR_ACCESS).includes(rule.access)) rule.access = SECTOR_ACCESS.OPEN;
    if (typeof rule.foreignAllowed !== 'boolean') rule.foreignAllowed = true;
    rule.maxForeignOwnership = clamp(rule.maxForeignOwnership ?? 1);
    rule.minimumStateShare = clamp(rule.minimumStateShare ?? 0);
    rule.licencePredictability = clamp(rule.licencePredictability ?? 0.75);
    if (rule.access === SECTOR_ACCESS.DOMESTIC_ONLY || rule.access === SECTOR_ACCESS.STATE_MONOPOLY) {
      rule.foreignAllowed = false;
      rule.maxForeignOwnership = 0;
    }
    if (rule.access === SECTOR_ACCESS.STATE_MAJORITY) rule.minimumStateShare = Math.max(0.51, rule.minimumStateShare);
    if (rule.access === SECTOR_ACCESS.STATE_MONOPOLY) rule.minimumStateShare = 1;
  }
  return state;
}

export function setSectorOwnershipPolicy(polity, sector, patch = {}) {
  if (!ECONOMIC_SECTORS.includes(sector)) return { changed: false, reason: 'unknown_sector' };
  const state = ensureEconomicOwnershipPolicy(polity);
  const previous = { ...state.sectors[sector] };
  const next = { ...previous, ...patch };
  if (!Object.values(SECTOR_ACCESS).includes(next.access)) return { changed: false, reason: 'invalid_access' };
  next.maxForeignOwnership = clamp(next.maxForeignOwnership ?? previous.maxForeignOwnership);
  next.minimumStateShare = clamp(next.minimumStateShare ?? previous.minimumStateShare);
  next.licencePredictability = clamp(next.licencePredictability ?? previous.licencePredictability);
  if (next.access === SECTOR_ACCESS.DOMESTIC_ONLY || next.access === SECTOR_ACCESS.STATE_MONOPOLY) {
    next.foreignAllowed = false;
    next.maxForeignOwnership = 0;
  }
  if (next.access === SECTOR_ACCESS.STATE_MAJORITY) next.minimumStateShare = Math.max(0.51, next.minimumStateShare);
  if (next.access === SECTOR_ACCESS.STATE_MONOPOLY) next.minimumStateShare = 1;
  state.sectors[sector] = next;
  state.policyPredictability = clamp(state.policyPredictability - 0.01);
  return { changed: JSON.stringify(previous) !== JSON.stringify(next), previous, rule: next };
}

export function investmentAccess(polity, sector, { foreign = false, proposedStateShare = 0, proposedForeignShare = foreign ? 1 : 0 } = {}) {
  const state = ensureEconomicOwnershipPolicy(polity);
  const rule = state.sectors[sector] || defaultSectorRule();
  if (rule.access === SECTOR_ACCESS.STATE_MONOPOLY && proposedStateShare < 0.999) return { allowed: false, reason: 'state_monopoly', rule };
  if (rule.access === SECTOR_ACCESS.STATE_MAJORITY && proposedStateShare < rule.minimumStateShare) return { allowed: false, reason: 'state_majority_required', rule };
  if (foreign && (!rule.foreignAllowed || rule.access === SECTOR_ACCESS.DOMESTIC_ONLY)) return { allowed: false, reason: 'foreign_ownership_banned', rule };
  if (foreign && proposedForeignShare > rule.maxForeignOwnership + 1e-9) return { allowed: false, reason: 'foreign_ownership_cap', rule };
  return { allowed: true, reason: rule.access === SECTOR_ACCESS.LICENSED ? 'licence_required' : 'allowed', rule };
}

export function createStateEnterprise(polity, {
  name,
  sectors = [],
  governmentCapital = 0,
  stateOwnership = 1,
  profitTarget = 0,
  serviceObligation = 0.5,
  commercialIndependence = 0.5,
} = {}) {
  const state = ensureEconomicOwnershipPolicy(polity);
  const validSectors = [...new Set(sectors)].filter((sector) => ECONOMIC_SECTORS.includes(sector));
  if (!validSectors.length) return { created: false, reason: 'no_valid_sector' };
  const id = `${polity.id || 'polity'}:state-enterprise:${state.nextEnterpriseId++}`;
  const enterprise = {
    id,
    name: String(name || `State Enterprise ${state.nextEnterpriseId - 1}`),
    sectors: validSectors,
    stateOwnership: clamp(stateOwnership),
    governmentCapital: Math.max(0, Number(governmentCapital) || 0),
    retainedEarnings: 0,
    debt: 0,
    profitTarget: Math.max(0, Number(profitTarget) || 0),
    serviceObligation: clamp(serviceObligation),
    commercialIndependence: clamp(commercialIndependence),
    status: 'active',
    assets: [],
  };
  state.stateEnterprises.push(enterprise);
  return { created: true, enterprise };
}

export function stateEnterpriseById(polity, enterpriseId) {
  return ensureEconomicOwnershipPolicy(polity).stateEnterprises.find((candidate) => candidate.id === enterpriseId) || null;
}

export function fundStateEnterprise(polity, enterpriseId, amount) {
  const state = ensureEconomicOwnershipPolicy(polity);
  const enterprise = state.stateEnterprises.find((candidate) => candidate.id === enterpriseId && candidate.status === 'active');
  if (!enterprise) return { funded: false, reason: 'enterprise_not_found' };
  const value = Math.max(0, Number(amount) || 0);
  if (value <= 0) return { funded: false, reason: 'invalid_amount' };
  enterprise.governmentCapital += value;
  return { funded: true, amount: value, enterprise };
}

export function economicOwnershipIndicators(polity) {
  const state = ensureEconomicOwnershipPolicy(polity);
  const rules = ECONOMIC_SECTORS.map((sector) => state.sectors[sector]);
  const stateControl = rules.reduce((sum, rule) => {
    const accessWeight = rule.access === SECTOR_ACCESS.STATE_MONOPOLY ? 1
      : rule.access === SECTOR_ACCESS.STATE_MAJORITY ? 0.72
      : rule.access === SECTOR_ACCESS.LICENSED ? 0.3
      : rule.access === SECTOR_ACCESS.DOMESTIC_ONLY ? 0.16
      : 0;
    return sum + Math.max(accessWeight, rule.minimumStateShare || 0);
  }, 0) / Math.max(1, rules.length);
  const foreignOpenness = rules.reduce((sum, rule) => sum + (rule.foreignAllowed ? rule.maxForeignOwnership : 0), 0) / Math.max(1, rules.length);
  const enterprises = state.stateEnterprises.filter((enterprise) => enterprise.status === 'active');
  const publicEnterpriseWeight = clamp(enterprises.reduce((sum, enterprise) => sum + enterprise.stateOwnership * Math.log1p(enterprise.governmentCapital), 0) / 20);
  return {
    stateControl: clamp(stateControl * 0.72 + publicEnterpriseWeight * 0.28),
    foreignOpenness: clamp(foreignOpenness),
    publicEnterpriseWeight,
    policyPredictability: clamp(state.policyPredictability),
    contractReliability: clamp(state.contractReliability),
    nationalisationMemory: clamp(state.nationalisationMemory),
  };
}
