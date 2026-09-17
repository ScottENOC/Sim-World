import { electricityIndustrialMultiplier } from './electricity.js?v=20260917-electric1';
import { telephoneIndustrialMultiplier } from './localCommunications.js?v=20260918-telephone1';
import { foreignMarketAccess } from './infrastructureInvestment.js';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const PROCUREMENT_POLICIES = Object.freeze({ BEST_AVAILABLE: 'best_available', PREFER_DOMESTIC: 'prefer_domestic', DOMESTIC_ONLY: 'domestic_only' });
export const INDUSTRIAL_GOODS = Object.freeze({
  steel: { inputs: { iron: 1.25, coal: 0.65 }, capability: 'steelmaking' },
  machine_components: { inputs: { steel: 0.8 }, capability: 'precision_machining' },
  steam_locomotive: { inputs: { steel: 7, machine_components: 2.2 }, capability: 'locomotive_engineering' },
  rail_stock: { inputs: { steel: 2.2, wood: 1.1 }, capability: 'rail_vehicle_manufacture' },
});
const CAPABILITY_KEYS = ['steelmaking', 'precision_machining', 'locomotive_engineering', 'rail_vehicle_manufacture', 'railway_engineering'];

export function ensureIndustrialSupply(region) {
  region.industrialSupply ||= {};
  const s = region.industrialSupply;
  s.capability ||= {}; s.outputCapacity ||= {}; s.inventory ||= {}; s.exposure ||= {};
  for (const key of CAPABILITY_KEYS) { if (!Number.isFinite(s.capability[key])) s.capability[key] = 0; if (!Number.isFinite(s.exposure[key])) s.exposure[key] = 0; }
  for (const key of Object.keys(INDUSTRIAL_GOODS)) { if (!Number.isFinite(s.outputCapacity[key])) s.outputCapacity[key] = 0; if (!Number.isFinite(s.inventory[key])) s.inventory[key] = 0; }
  return s;
}
export function ensureProcurementPolicy(polity) {
  polity.procurementPolicy ||= { infrastructure: PROCUREMENT_POLICIES.BEST_AVAILABLE };
  if (!Object.values(PROCUREMENT_POLICIES).includes(polity.procurementPolicy.infrastructure)) polity.procurementPolicy.infrastructure = PROCUREMENT_POLICIES.BEST_AVAILABLE;
  return polity.procurementPolicy;
}
export function setInfrastructureProcurementPolicy(polity, policy) {
  if (!Object.values(PROCUREMENT_POLICIES).includes(policy)) throw new Error(`Unknown procurement policy: ${policy}`);
  ensureProcurementPolicy(polity).infrastructure = policy;
  return polity.procurementPolicy.infrastructure;
}
export function chooseNpcProcurementPolicy(polity, { securityThreat = 0, industrialAmbition = 0, domesticCapability = 0, capitalShortage = 0, foreignDependence = 0 } = {}) {
  const security = clamp(securityThreat), ambition = clamp(industrialAmbition), capability = clamp(domesticCapability), shortage = clamp(capitalShortage), dependence = clamp(foreignDependence);
  let policy = PROCUREMENT_POLICIES.BEST_AVAILABLE;
  if (security > 0.78 || (security > 0.58 && dependence > 0.55)) policy = PROCUREMENT_POLICIES.DOMESTIC_ONLY;
  else if (ambition > 0.48 || dependence > 0.42 || (capability > 0.55 && shortage < 0.65)) policy = PROCUREMENT_POLICIES.PREFER_DOMESTIC;
  return setInfrastructureProcurementPolicy(polity, policy);
}
function manufacturingBase(region) {
  const structural = region.structuralTransformation || {};
  const capability = clamp(structural.capability?.manufacture || 0);
  const scale = Math.max(0.5, structural.scaleMultipliers?.manufacture || 1);
  const firms = (region.corporateCapital?.firms || []).filter(f => f.status === 'active' && ['manufacture', 'infrastructure'].includes(f.sector));
  const capital = firms.reduce((sum, f) => sum + Math.max(0, f.capitalIndex || 0), 0);
  return clamp(capability * 0.68 + Math.log1p(capital) / 12) * scale;
}
export function tickIndustrialSupply(region, elapsedDays = 7) {
  const s = ensureIndustrialSupply(region); const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR; const base = manufacturingBase(region);
  const ironPractice = clamp((region.resourceDeposits?.iron?.remainingFraction ?? region.resourceDeposits?.iron?.depth ?? 0) + (region.stockpile?.iron || 0) / 1000);
  const coalPractice = clamp((region.resourceDeposits?.coal?.remainingFraction ?? region.resourceDeposits?.coal?.depth ?? 0) + (region.stockpile?.coal || 0) / 1000);
  const targets = { steelmaking: clamp(base * 0.72 + ironPractice * 0.12 + coalPractice * 0.16), precision_machining: clamp(base * 0.78 + s.capability.steelmaking * 0.22), locomotive_engineering: clamp(base * 0.5 + s.capability.precision_machining * 0.3 + s.exposure.locomotive_engineering * 0.2), rail_vehicle_manufacture: clamp(base * 0.6 + s.capability.steelmaking * 0.25 + s.exposure.rail_vehicle_manufacture * 0.15), railway_engineering: clamp(base * 0.45 + s.capability.precision_machining * 0.2 + s.exposure.railway_engineering * 0.35) };
  for (const [key, target] of Object.entries(targets)) { const practice = s.exposure[key] > 0.02 || base > 0.12; const rate = clamp(years * (practice ? 0.075 : 0.012)); s.capability[key] += (target - s.capability[key]) * rate; s.exposure[key] = Math.max(0, s.exposure[key] - years * 0.012); }
  const electric = electricityIndustrialMultiplier(region); const communications = telephoneIndustrialMultiplier(region); s.outputCapacity.steel = Math.max(0, base * s.capability.steelmaking * 140 * electric * communications); s.outputCapacity.machine_components = Math.max(0, base * s.capability.precision_machining * 38 * electric * communications); s.outputCapacity.steam_locomotive = Math.max(0, base * s.capability.locomotive_engineering * 3.2 * electric * communications); s.outputCapacity.rail_stock = Math.max(0, base * s.capability.rail_vehicle_manufacture * 22 * electric * communications); return s;
}
export function supplierCapability(region, requirement) {
  const s = ensureIndustrialSupply(region); const entries = Object.entries(requirement || {}).filter(([, needed]) => Number(needed) > 0); if (!entries.length) return 1;
  const coverage = entries.map(([key, needed]) => clamp((s.outputCapacity[key] || 0) / needed));
  const average = coverage.reduce((sum, v) => sum + v, 0) / coverage.length;
  const minimum = Math.min(...coverage);
  return clamp(average * 0.7 + minimum * 0.3);
}
function accessibleForeignOffer(polity, offer, strategic) {
  if (!offer?.region) return false;
  const investorPolity = offer.polity || { id: offer.polityId || offer.region?.governance?.sovereignPolityId || offer.region?.polityId || 'foreign-supplier' };
  return foreignMarketAccess({ hostPolity: polity, investorPolity, strategic, relation: Number(offer.relation) || 0, atWar: !!offer.atWar, partner: !!offer.partner });
}
export function chooseInfrastructureSupplier({ polity, domesticRegions = [], foreignOffers = [], requirements = {}, strategic = true }) {
  const policy = ensureProcurementPolicy(polity).infrastructure;
  const domestic = domesticRegions.map(region => ({ region, foreign: false, polityId: polity.id, capability: supplierCapability(region, requirements) })).sort((a,b)=>b.capability-a.capability)[0] || null;
  const foreign = policy === PROCUREMENT_POLICIES.DOMESTIC_ONLY ? null : foreignOffers.filter(o => accessibleForeignOffer(polity, o, strategic)).map(o=>({ ...o, foreign:true, capability:supplierCapability(o.region, requirements) })).sort((a,b)=>(b.capability-(b.costPremium||0)*0.08)-(a.capability-(a.costPremium||0)*0.08))[0] || null;
  if (!foreign) return domestic; if (!domestic) return foreign;
  if (policy === PROCUREMENT_POLICIES.PREFER_DOMESTIC && domestic.capability >= foreign.capability * 0.72) return domestic;
  return foreign.capability > domestic.capability * 1.08 ? foreign : domestic;
}
export function applyForeignSupplierExposure(hostRegion, supplierRegion, intensity = 1) {
  const host = ensureIndustrialSupply(hostRegion); const supplier = ensureIndustrialSupply(supplierRegion);
  for (const key of Object.keys(host.exposure)) { const gap = Math.max(0, (supplier.capability[key] || 0) - (host.capability[key] || 0)); host.exposure[key] = clamp(host.exposure[key] + gap * 0.08 * clamp(intensity)); }
}
export function applyDomesticSupplierExperience(hostRegion, supplierRegion = hostRegion, intensity = 1) {
  const host = ensureIndustrialSupply(hostRegion); const supplier = ensureIndustrialSupply(supplierRegion); const practice = clamp(intensity);
  for (const key of CAPABILITY_KEYS) {
    const current = host.capability[key] || 0;
    const supplierLevel = supplier.capability[key] || 0;
    const practiceCeiling = Math.min(1, Math.max(current + 0.12, supplierLevel + 0.04));
    const gap = Math.max(0, practiceCeiling - current);
    host.exposure[key] = clamp((host.exposure[key] || 0) + 0.018 * practice + gap * 0.035 * practice);
  }
}
export function describeProcurementConsequence(polity) {
  const policy = ensureProcurementPolicy(polity).infrastructure;
  if (policy === PROCUREMENT_POLICIES.DOMESTIC_ONLY) return 'Government infrastructure orders are restricted to domestic suppliers. Weak domestic capability can make projects much slower, but construction experience and demand stay at home.';
  if (policy === PROCUREMENT_POLICIES.PREFER_DOMESTIC) return 'Domestic suppliers receive preference when reasonably competitive; foreign expertise remains available when the capability gap is large.';
  return 'Government projects use the strongest accessible supplier, including foreign firms. Delivery is usually faster, but more profits and engineering control may remain abroad.';
}
