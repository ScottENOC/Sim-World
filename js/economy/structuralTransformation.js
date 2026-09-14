import { educationSkillMultiplier } from '../society/massEducation.js?v=20260914-mass-education1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

const SECTORS = ['agriculture', 'extraction', 'manufacture', 'trade_transport', 'administration', 'services'];
const URBAN_SECTORS = new Set(['manufacture', 'trade_transport', 'administration', 'services']);
const MIN_SCALE = {
  extraction: 0.003,
  manufacture: 0.006,
  trade_transport: 0.004,
  administration: 0.002,
  services: 0.003,
};

function activeFirms(region) {
  return region.corporateCapital?.firms?.filter((f) => f.status === 'active') || [];
}

function protoAssets(region) {
  return region.protoIndustry?.assets?.filter((a) => a.status === 'active') || [];
}

function occupation(region, ...names) {
  return names.reduce((sum, name) => sum + Math.max(0, Number(region.occupations?.[name]) || 0), 0);
}

function sectorWorkers(region) {
  const teachers = Math.max(0, region.publicEducation?.teacherWorkersReserved || 0);
  const agriculture = occupation(region, 'farmer', 'gatherer', 'shoreFisher', 'boatFisher', 'horseWorker');
  const extraction = occupation(region, 'miner', 'lumberjack');
  const manufacture = occupation(region, 'smith', 'potter', 'textileWorker', 'tailor', 'boatMaker', 'pitchWorker') +
    Math.max(0, region.structuralTransformation?.committedIndustrialSupport || 0);
  const tradeTransport = occupation(region, 'trader') + Math.max(0, region.tradeEconomy?.merchantPopulation || 0) * 0.25;
  const administration = teachers + Math.max(0, region.education?.juniorScribes || 0) * 0.12 +
    Math.max(0, region.education?.experiencedScribes || 0) * 0.35 + Math.max(0, region.education?.masterScribes || 0) * 0.7;
  const services = occupation(region, 'artist', 'artStudent') + Math.max(0, region.structuralTransformation?.committedServices || 0);
  return { agriculture, extraction, manufacture, trade_transport: tradeTransport, administration, services };
}

function marketReach(region) {
  const partners = region.tradePartnerIds?.size ?? region.recentTradePartners?.size ?? 0;
  const reliability = clamp(region.tradeEconomy?.routeReliabilityEma || 0);
  const throughput = Math.max(0, region.tradeEconomy?.exportIncomeEma || 0) + Math.max(0, region.tradeEconomy?.importSpendEma || 0);
  return clamp(Math.log1p(partners) / Math.log(12) * 0.35 + reliability * 0.35 + Math.log1p(throughput) / 12 * 0.3);
}

function capitalBySector(region, sector) {
  const map = {
    manufacture: new Set(['manufacture']),
    extraction: new Set(['mining']),
    trade_transport: new Set(['long_distance_trade', 'shipping', 'infrastructure']),
    services: new Set(['infrastructure']),
  };
  const accepted = map[sector] || new Set();
  return activeFirms(region).filter((f) => accepted.has(f.sector)).reduce((sum, f) => sum + Math.max(0, f.capitalIndex || 0), 0);
}

function industrialDemand(region) {
  const assets = protoAssets(region);
  const assetDemand = assets.reduce((sum, asset) => sum + Math.max(0.3, asset.productivity || 0.6), 0);
  const firms = capitalBySector(region, 'manufacture') + capitalBySector(region, 'extraction');
  const external = Object.values(region._externalManufacturedDemand || {}).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
  return assetDemand * 1.6 + firms * 1.8 + Math.log1p(external) * 1.2;
}

function serviceDemand(region) {
  const urban = clamp(region.urbanisation?.urbanShare ?? ((region.urbanisation?.urbanPopulation || 0) / Math.max(1, region.population || 1)));
  const firms = activeFirms(region).length;
  const education = clamp(region.publicEducation?.literacy || region.educationLevel || 0);
  return Math.max(0, (region.population || 0) * (0.002 + urban * 0.018 + firms * 0.0005 + education * 0.006));
}

export function ensureStructuralTransformation(region) {
  region.structuralTransformation ||= {};
  const s = region.structuralTransformation;
  s.capability ||= {};
  s.sectorShares ||= {};
  s.scaleMultipliers ||= {};
  for (const sector of SECTORS) {
    if (!Number.isFinite(s.capability[sector])) s.capability[sector] = sector === 'agriculture' ? 0.2 : 0;
    if (!Number.isFinite(s.sectorShares[sector])) s.sectorShares[sector] = sector === 'agriculture' ? 1 : 0;
    if (!Number.isFinite(s.scaleMultipliers[sector])) s.scaleMultipliers[sector] = 1;
  }
  if (!Number.isFinite(s.wageLabourShare)) s.wageLabourShare = 0;
  if (!Number.isFinite(s.specialisationIndex)) s.specialisationIndex = 0;
  if (!Number.isFinite(s.committedIndustrialSupport)) s.committedIndustrialSupport = 0;
  if (!Number.isFinite(s.committedServices)) s.committedServices = 0;
  if (!Number.isFinite(s.urbanJobShare)) s.urbanJobShare = 0;
  return s;
}

export function prepareStructuralTransformation(region, elapsedDays = 7) {
  const s = ensureStructuralTransformation(region);
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const workingAge = Math.max(0, region.demographics?.workingAge || 0);
  const industrialTarget = Math.min(workingAge * 0.16, industrialDemand(region) * 4);
  const serviceTarget = Math.min(workingAge * 0.12, serviceDemand(region));
  const skill = educationSkillMultiplier(region, 'manufacture');
  const ramp = clamp(years * (0.45 + (skill - 1) * 1.8), 0, 0.35);
  s.committedIndustrialSupport += (industrialTarget - s.committedIndustrialSupport) * ramp;
  s.committedServices += (serviceTarget - s.committedServices) * ramp;
  const reserveCap = workingAge * 0.22;
  const requested = Math.max(0, s.committedIndustrialSupport) + Math.max(0, s.committedServices);
  const scale = requested > reserveCap && requested > 0 ? reserveCap / requested : 1;
  return {
    industrialSupport: s.committedIndustrialSupport * scale,
    services: s.committedServices * scale,
    total: requested * scale,
  };
}

function updateCapabilities(region, s, shares, years) {
  for (const sector of SECTORS) {
    const share = shares[sector] || 0;
    const practice = clamp(share / Math.max(0.01, MIN_SCALE[sector] || 0.03));
    const target = clamp(practice * 0.55 + marketReach(region) * (sector === 'trade_transport' || sector === 'manufacture' ? 0.3 : 0.08) +
      (educationSkillMultiplier(region, sector === 'administration' ? 'administration' : sector === 'manufacture' ? 'manufacture' : 'general') - 1) * 0.8);
    const rise = clamp(years * 0.08);
    const decay = clamp(years * 0.025);
    if (share > 0.001) s.capability[sector] += (target - s.capability[sector]) * rise;
    else s.capability[sector] += (0 - s.capability[sector]) * decay;
    s.capability[sector] = clamp(s.capability[sector]);
  }
}

function updateScale(region, s, shares) {
  const reach = marketReach(region);
  for (const sector of SECTORS) {
    if (sector === 'agriculture') {
      s.scaleMultipliers[sector] = 1 + s.capability[sector] * 0.04;
      continue;
    }
    const share = shares[sector] || 0;
    const minimum = MIN_SCALE[sector] || 0.004;
    const scaleSignal = share / minimum;
    const fixedCostPenalty = scaleSignal < 1 ? 0.82 + scaleSignal * 0.18 : 1;
    const agglomeration = 1 + Math.min(0.38, Math.log1p(Math.max(0, scaleSignal - 1)) * 0.075 + s.capability[sector] * 0.18 + reach * 0.08);
    s.scaleMultipliers[sector] = fixedCostPenalty * agglomeration;
  }
}

function updateUrbanisation(region, s, shares, years) {
  region.urbanisation ||= { urbanPopulation: 0, urbanShare: 0 };
  const current = clamp(region.urbanisation.urbanShare ?? ((region.urbanisation.urbanPopulation || 0) / Math.max(1, region.population || 1)));
  const urbanJobs = [...URBAN_SECTORS].reduce((sum, sector) => sum + (shares[sector] || 0), 0);
  const foodSecurity = clamp((region.stockpile?.food || 0) / Math.max(1, region.population || 1) / 8);
  const imports = clamp((region.tradeEconomy?.foodImportEma || 0) / Math.max(1, region.population || 1));
  const disease = clamp(region.disease?.burden ?? region.externalities?.healthBurden ?? 0);
  const conflict = clamp(region.conflictPressure || 0);
  const settlementPull = clamp(urbanJobs * 1.2 + marketReach(region) * 0.12 + Math.max(foodSecurity, imports) * 0.06 - disease * 0.12 - conflict * 0.18);
  const target = clamp(Math.max(current * 0.96, settlementPull), 0, 0.82);
  const mobility = clamp(years * (0.045 + marketReach(region) * 0.04), 0, 0.12);
  const next = clamp(current + (target - current) * mobility);
  region.urbanisation.urbanShare = next;
  region.urbanisation.urbanPopulation = Math.round((region.population || 0) * next);
  s.urbanJobShare = urbanJobs;
}

function updateFirmScale(region, s, years) {
  if (years <= 0) return;
  for (const firm of activeFirms(region)) {
    const sector = firm.sector === 'mining' ? 'extraction' :
      firm.sector === 'manufacture' ? 'manufacture' :
      ['shipping', 'long_distance_trade'].includes(firm.sector) ? 'trade_transport' : 'services';
    const scale = s.scaleMultipliers[sector] || 1;
    // Firms in established clusters compound a little faster; firms below minimum
    // efficient scale carry a persistent fixed-cost drag. Keep this bounded so the
    // corporate-capital model remains the primary balance-sheet simulation.
    const adjustment = clamp((scale - 1) * 0.08 * years, -0.03, 0.04);
    firm.capitalIndex = Math.max(0.01, (firm.capitalIndex || 0.01) * (1 + adjustment));
    firm.clusterScaleMultiplier = scale;
  }
}

export function finalizeStructuralTransformation(region, elapsedDays = 7) {
  const s = ensureStructuralTransformation(region);
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const workers = sectorWorkers(region);
  const total = Math.max(1, Object.values(workers).reduce((sum, value) => sum + value, 0));
  const shares = Object.fromEntries(SECTORS.map((sector) => [sector, clamp((workers[sector] || 0) / total)]));
  s.sectorShares = shares;
  updateCapabilities(region, s, shares, years);
  updateScale(region, s, shares);
  updateUrbanisation(region, s, shares, years);
  updateFirmScale(region, s, years);

  const nonFarm = 1 - (shares.agriculture || 0);
  const firmCapital = activeFirms(region).reduce((sum, firm) => sum + Math.max(0, firm.capitalIndex || 0), 0);
  const proto = protoAssets(region).length;
  const wageTarget = clamp(nonFarm * 0.45 + Math.log1p(firmCapital) / 12 + Math.log1p(proto) / 18);
  s.wageLabourShare += (wageTarget - s.wageLabourShare) * clamp(years * 0.08);

  const hhi = SECTORS.reduce((sum, sector) => sum + Math.pow(shares[sector] || 0, 2), 0);
  s.specialisationIndex = clamp((hhi - 1 / SECTORS.length) / (1 - 1 / SECTORS.length));
  const dominant = SECTORS.slice().sort((a, b) => (shares[b] || 0) - (shares[a] || 0))[0];

  region.productionModifiers ||= {};
  region.productionModifiers.structuralTransformation = {
    agriculture: s.scaleMultipliers.agriculture,
    extraction: s.scaleMultipliers.extraction,
    manufacture: s.scaleMultipliers.manufacture,
    tradeTransport: s.scaleMultipliers.trade_transport,
    services: s.scaleMultipliers.services,
  };
  region.report ||= {};
  region.report.structuralTransformation = {
    workers: 0,
    dominantSector: dominant,
    specialisationIndex: s.specialisationIndex,
    wageLabourShare: s.wageLabourShare,
    urbanJobShare: s.urbanJobShare,
    sectorShares: { ...shares },
    scaleMultipliers: { ...s.scaleMultipliers },
  };
  return s;
}

export function structuralActivityMultiplier(region, activity) {
  const s = ensureStructuralTransformation(region);
  const map = {
    farming: 'agriculture', gathering: 'agriculture', fishing: 'agriculture',
    mining: 'extraction', lumberjack: 'extraction',
    smithing: 'manufacture', pottery: 'manufacture', textiles: 'manufacture', boatbuilding: 'manufacture', manufacture: 'manufacture', engineering: 'manufacture',
    trade: 'trade_transport', shipping: 'trade_transport', administration: 'administration', science: 'services',
  };
  return s.scaleMultipliers[map[activity] || 'services'] || 1;
}

export function structuralTransformationSummary(region) {
  const s = ensureStructuralTransformation(region);
  return {
    sectorShares: { ...s.sectorShares },
    capabilities: { ...s.capability },
    scaleMultipliers: { ...s.scaleMultipliers },
    specialisationIndex: s.specialisationIndex,
    wageLabourShare: s.wageLabourShare,
    urbanJobShare: s.urbanJobShare,
  };
}
