import assert from 'node:assert/strict';
import {
  ensureStructuralTransformation,
  prepareStructuralTransformation,
  finalizeStructuralTransformation,
  structuralActivityMultiplier,
  structuralTransformationSummary,
} from '../js/economy/structuralTransformation.js';

function region(overrides = {}) {
  return {
    id: 'test', name: 'Test', population: 100_000,
    demographics: { workingAge: 62_000, children: 28_000, elderly: 10_000 },
    occupations: { farmer: 35_000, miner: 1_000, smith: 700, potter: 500, trader: 500 },
    urbanisation: { urbanPopulation: 12_000, urbanShare: 0.12 },
    tradeEconomy: { merchantPopulation: 500, routeReliabilityEma: 0.7, exportIncomeEma: 500, importSpendEma: 450, foodImportEma: 2500 },
    tradePartnerIds: new Set(['a','b','c','d']),
    stockpile: { food: 900_000 },
    publicEducation: { teacherWorkersReserved: 800, literacy: 0.65, numeracy: 0.5, technicalHumanCapital: 0.3, adultAverageYears: 5 },
    educationLevel: 0.4,
    education: { juniorScribes: 100, experiencedScribes: 80, masterScribes: 12 },
    corporateCapital: { firms: [] },
    protoIndustry: { assets: [] },
    report: {}, productionModifiers: {},
    ...overrides,
  };
}

{
  const r = region();
  const s = ensureStructuralTransformation(r);
  assert.equal(s.sectorShares.agriculture, 1);
  assert.equal(s.wageLabourShare, 0);
}

{
  const r = region({
    corporateCapital: { firms: [
      { id: 'm1', status: 'active', sector: 'manufacture', capitalIndex: 6 },
      { id: 'm2', status: 'active', sector: 'manufacture', capitalIndex: 4 },
      { id: 't1', status: 'active', sector: 'long_distance_trade', capitalIndex: 3 },
    ] },
    protoIndustry: { assets: [
      { id: 'a1', status: 'active', type: 'spinning_workshop', productivity: 1 },
      { id: 'a2', status: 'active', type: 'trip_hammer', productivity: 1 },
    ] },
  });
  const beforeUrban = r.urbanisation.urbanShare;
  const reservation = prepareStructuralTransformation(r, 365.2425 * 4);
  assert(reservation.industrialSupport > 0, 'profitable industrial capital creates committed industrial work');
  assert(reservation.services > 0, 'urban economies create service work');
  r.occupations.industrialSupport = reservation.industrialSupport;
  r.occupations.services = reservation.services;
  finalizeStructuralTransformation(r, 365.2425 * 4);
  const summary = structuralTransformationSummary(r);
  assert(summary.sectorShares.manufacture > 0, 'manufacturing appears as a real labour sector');
  assert(summary.capabilities.manufacture > 0, 'local industrial capability accumulates from practice');
  assert(r.urbanisation.urbanShare >= beforeUrban, 'urban job concentration can pull population into settlements');
  assert(r.corporateCapital.firms[0].clusterScaleMultiplier > 0, 'firms receive scale/agglomeration conditions');
}

{
  const thin = region({ id: 'thin', occupations: { farmer: 50_000, smith: 20 } });
  thin.structuralTransformation = ensureStructuralTransformation(thin);
  finalizeStructuralTransformation(thin, 365.2425);
  assert(structuralActivityMultiplier(thin, 'smithing') <= 1.05, 'tiny manufacturing sectors do not receive a free scale bonus');
}

{
  const clustered = region({
    id: 'clustered',
    occupations: { farmer: 22_000, smith: 5_000, potter: 2_500, trader: 2_000, industrialSupport: 3_000, services: 2_000 },
    corporateCapital: { firms: [{ id:'f', status:'active', sector:'manufacture', capitalIndex:12 }] },
    protoIndustry: { assets: [{ id:'x', status:'active', type:'trip_hammer', productivity:1 }] },
  });
  for (let i = 0; i < 20; i++) finalizeStructuralTransformation(clustered, 365.2425);
  assert(structuralActivityMultiplier(clustered, 'smithing') > 1, 'sustained manufacturing concentration earns agglomeration benefits');
  const mature = structuralTransformationSummary(clustered).capabilities.manufacture;
  clustered.occupations = { farmer: 45_000 };
  for (let i = 0; i < 20; i++) finalizeStructuralTransformation(clustered, 365.2425);
  assert(structuralTransformationSummary(clustered).capabilities.manufacture < mature, 'industrial capability decays after a cluster disappears');
}

{
  const earlyCity = region({
    id: 'early-city',
    urbanisation: { urbanPopulation: 25_000, urbanShare: 0.25 },
    occupations: { farmer: 30_000, trader: 2_500 },
    corporateCapital: { firms: [] }, protoIndustry: { assets: [] },
  });
  const oldUrban = earlyCity.urbanisation.urbanShare;
  finalizeStructuralTransformation(earlyCity, 365.2425);
  assert(earlyCity.urbanisation.urbanShare > oldUrban * 0.9, 'pre-industrial urbanisation is preserved rather than reset by the industrial model');
}

console.log('Structural transformation and specialisation regressions passed.');
