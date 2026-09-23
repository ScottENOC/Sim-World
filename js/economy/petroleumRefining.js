import { PETROLEUM_REFINING_TECH_ID, PETROLEUM_CRACKING_TECH_ID, PETROLEUM_DESULFURISATION_TECH_ID, AVIATION_FRACTIONATION_TECH_ID } from '../technology/petroleum.js?v=20260917-oil3';
import { effectiveInfrastructureCount } from './construction.js?v=20260917-oil3';
import { blendE10 } from './energyTransition.js?v=20260923-energy-transition1';
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

export const PETROLEUM_PRODUCTS = Object.freeze([
  'lamp_fuel',
  'petrol',
  'diesel',
  'heavy_fuel_oil',
  'aviation_fuel',
]);

function stableFraction(text) {
  let hash = 2166136261;
  for (const ch of String(text)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

export function crudeQuality(region) {
  region.petroleum ||= {};
  if (!region.petroleum.crudeQuality) {
    const gravitySignal = stableFraction(`${region.id}:oil:gravity`);
    const sulfurSignal = stableFraction(`${region.id}:oil:sulfur`);
    region.petroleum.crudeQuality = {
      gravity: gravitySignal >= 0.48 ? 'light' : 'heavy',
      sulfur: sulfurSignal >= 0.58 ? 'sour' : 'sweet',
      lightFraction: 0.35 + gravitySignal * 0.42,
      sulfurFraction: 0.002 + sulfurSignal * 0.045,
    };
  }
  return region.petroleum.crudeQuality;
}

export function ensureRefinery(region) {
  region.petroleum ||= {};
  region.petroleum.refinery ||= {
    capacityPerYear: 0,
    simpleDistillation: false,
    cracking: false,
    desulfurisation: false,
    aviationFractionation: false,
    lastThroughput: 0,
    lastProducts: {},
  };
  return region.petroleum.refinery;
}

function syncRefineryCapability(region) {
  const r = ensureRefinery(region);
  const count = effectiveInfrastructureCount(region, 'petroleum_refinery');
  const tech = region.unlockedTechIds || new Set();
  r.simpleDistillation = count > 0 && tech.has(PETROLEUM_REFINING_TECH_ID);
  r.capacityPerYear = count * 2400;
  r.cracking = r.simpleDistillation && tech.has(PETROLEUM_CRACKING_TECH_ID);
  r.desulfurisation = r.simpleDistillation && tech.has(PETROLEUM_DESULFURISATION_TECH_ID);
  r.aviationFractionation = r.cracking && tech.has(AVIATION_FRACTIONATION_TECH_ID);
  return r;
}

export function refineryAvailable(region) {
  const r = syncRefineryCapability(region);
  return Boolean(r.simpleDistillation && r.capacityPerYear > 0);
}

export function refineryProductSlate(region) {
  const q = crudeQuality(region);
  const r = syncRefineryCapability(region);
  const light = clamp01(q.lightFraction);
  const sourPenalty = q.sulfur === 'sour' && !r.desulfurisation ? 0.12 : 0;

  // Simple distillation is constrained by the crude. Cracking can convert
  // heavier fractions into more useful middle/light products, but never
  // arbitrarily select a desired output.
  let lamp = 0.18 + light * 0.15;
  let petrol = 0.06 + light * 0.13;
  let diesel = 0.16 + light * 0.08;
  let heavy = 0.44 - light * 0.20;
  let aviation = 0;

  if (r.cracking) {
    const converted = Math.min(heavy * 0.34, 0.14 + light * 0.04);
    heavy -= converted;
    petrol += converted * 0.45;
    diesel += converted * 0.38;
    lamp += converted * 0.17;
  }
  if (r.aviationFractionation) {
    aviation = Math.min(0.12, lamp * 0.24 + petrol * 0.10);
    lamp -= aviation * 0.65;
    petrol -= aviation * 0.35;
  }

  // Sour crude in an unsophisticated refinery loses more material to dirty,
  // low-value residue rather than pretending sulfur has no processing cost.
  const usefulScale = 1 - sourPenalty;
  const slate = {
    lamp_fuel: lamp * usefulScale,
    petrol: petrol * usefulScale,
    diesel: diesel * usefulScale,
    heavy_fuel_oil: heavy * usefulScale,
    aviation_fuel: aviation * usefulScale,
  };
  const total = Object.values(slate).reduce((a, b) => a + b, 0);
  if (total > 0.96) {
    const scale = 0.96 / total;
    for (const key of Object.keys(slate)) slate[key] *= scale;
  }
  return slate;
}

export function tickPetroleumRefining(region, elapsedDays = 7) {
  if (!refineryAvailable(region)) return { throughput: 0, products: {} };
  region.stockpile ||= {};
  region.marketDemand ||= {};
  const refinery = syncRefineryCapability(region);
  const years = Math.max(0, Number(elapsedDays) || 0) / 365.2425;
  const capacity = Math.max(0, refinery.capacityPerYear || 0) * years;
  const crudeAvailable = Math.max(0, Number(region.stockpile.oil) || 0);
  const throughput = Math.min(crudeAvailable, capacity);
  if (throughput <= 0) {
    refinery.lastThroughput = 0;
    refinery.lastProducts = {};
    return { throughput: 0, products: {} };
  }

  const slate = refineryProductSlate(region);
  const products = {};
  region.stockpile.oil -= throughput;
  for (const [product, fraction] of Object.entries(slate)) {
    const amount = throughput * fraction;
    region.stockpile[product] = Math.max(0, Number(region.stockpile[product]) || 0) + amount;
    products[product] = amount;
  }
  const e10 = blendE10(region, products.petrol || 0);
  if (e10.ethanolBlended > 0) products.petrol = (products.petrol || 0) + e10.ethanolBlended;
  refinery.lastThroughput = throughput;
  refinery.lastProducts = products;
  refinery.lastE10 = { ...e10 };
  return { throughput, products, quality: crudeQuality(region), slate, e10 };
}
