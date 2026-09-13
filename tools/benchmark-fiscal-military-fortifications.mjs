import { performance } from 'node:perf_hooks';
import { tickFiscalMilitaryState } from '../js/politics/fiscalMilitaryState.js';

const REGION_COUNT = 2300;
const POLITY_COUNT = 575;
const regions = [];
const polities = [];

for (let p = 0; p < POLITY_COUNT; p++) {
  polities.push({
    id: `p${p}`, capitalRegionId: `r${p * 4}`,
    administration: { accounting: 0.45, recordKeeping: 0.5, officialdom: 0.48 },
    capitalFinance: { publicDebt: p % 5 === 0 ? 15 : 0, annualInterestRate: 0.05, creditorConfidence: 0.55, claimsByRegion: {} },
  });
}
for (let i = 0; i < REGION_COUNT; i++) {
  const polityId = `p${Math.floor(i / 4)}`;
  regions.push({
    id: `r${i}`, polityId, governance: { sovereignPolityId: polityId, autonomy: 0.15 },
    population: 18000, wallet: 300, treasury: 15, stability: 0.75,
    tradeEconomy: { weeklyExports: 15, weeklyImports: 12 },
    militaryFinance: { stateCapacity: 0.55, revenueEma: 0.8 },
    medievalSociety: { estates: { taxExemption: 0.1 } },
    unlockedTechIds: new Set(i % 3 ? ['gunpowder'] : []),
    firearms: { readiness: i % 3 ? 0.35 : 0 },
    earlyModernMilitary: { artillery: { readiness: i % 3 ? 0.4 : 0, inventory: i % 4 === 0 ? [{ kind: 'bombard' }, { kind: 'field_cannon' }] : [], away: [] } },
    construction: { assets: [
      ...(i % 2 === 0 ? [{ typeId: 'market_customs', condition: 1, scale: 1 }] : []),
      ...(i % 4 === 0 ? [{ typeId: 'administrative_centre', condition: 1, scale: 1 }, { typeId: 'royal_arsenal', condition: 1, scale: 1 }, { typeId: 'settlement_walls', condition: 1, scale: 1 }] : []),
    ] },
  });
}
const wars = Array.from({ length: 40 }, (_, i) => ({ attackerPolityId: `p${i}`, defenderPolityId: `p${i + 100}` }));
const samples = [];
for (let run = 0; run < 12; run++) {
  const start = performance.now();
  tickFiscalMilitaryState(regions, polities, wars, run * 52, 365.2425);
  samples.push(performance.now() - start);
}
const averageMs = samples.reduce((a, b) => a + b, 0) / samples.length;
const maxMs = Math.max(...samples);
console.log(JSON.stringify({ regions: REGION_COUNT, polities: POLITY_COUNT, averageMs, maxMs }, null, 2));
if (averageMs > 40 || maxMs > 100) {
  throw new Error(`Fiscal-military annual pass exceeds guardrail: avg ${averageMs.toFixed(2)} ms, max ${maxMs.toFixed(2)} ms`);
}
