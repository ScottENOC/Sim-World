import assert from 'node:assert/strict';
import {
  ensureAgriculturalGenetics,
  tickAgriculturalGenetics,
  setSeedBankPolicy,
  geneticPestProtection,
  geneticClimateMultiplier,
} from '../js/economy/agriculturalGenetics.js';

function region(id='r1') {
  return {
    id,
    population: 120000,
    centroid: [0, 36],
    terrain: { plains: 0.72, hills: 0.14, forest: 0.08, wetland: 0.03 },
    agriculturalLand: { cultivationShare: 0.88, cultivatedHa: 85000 },
    foodDiversity: { productionMix: { staple_grains: 0.76, pulses: 0.10, fruit_vegetables: 0.06, animal_foods: 0.08 } },
    agriculturalPests: { monocultureRisk: 0.82, extraYieldLoss: { staple_grains: 0.20, pulses: 0.08, fruit_vegetables: 0.10 } },
    weather: { index: -1.35 },
    climate: { rainfallMultiplier: 0.82, evaporationMultiplier: 1.18, temperatureAnomalyC: 1.2 },
    construction: { assets: [] },
    electricity: { householdService: 0, industrialService: 0 },
    education: { literacyRate: 0.04 },
    neighbors: [],
    tradePartnerIds: [],
  };
}

function advance(r, years) {
  for (let i=0;i<years;i++) tickAgriculturalGenetics([r], 365.2425);
}

// Repeated monoculture plus drought/pest shocks should erode living diversity,
// but on a multi-decade rather than seasonal timescale.
const exposed=region('exposed');
const initial=ensureAgriculturalGenetics(exposed).liveDiversity.staple_grains;
advance(exposed, 35);
assert.ok(exposed.agriculturalGenetics.liveDiversity.staple_grains < initial - 0.08,
  'decades of exposed monoculture should materially erode crop genetic diversity');
assert.ok(exposed.agriculturalGenetics.liveDiversity.staple_grains > 0.15,
  'genetic erosion should not annihilate a crop in only a few decades');

// Organised seed conservation should protect both the living crop population and
// preserved diversity under the same external stress.
const protectedRegion=region('protected');
protectedRegion.construction.assets.push({ typeId:'public_granary', condition:1 }, { typeId:'public_granary', condition:1 });
protectedRegion.electricity.householdService=0.9;
protectedRegion.education.literacyRate=0.82;
setSeedBankPolicy(protectedRegion,{collectionEffort:1,distributionEffort:.85});
advance(protectedRegion,35);
assert.ok(protectedRegion.agriculturalGenetics.liveDiversity.staple_grains > exposed.agriculturalGenetics.liveDiversity.staple_grains + 0.04,
  'seed conservation should materially slow loss of living varietal diversity');
assert.ok(protectedRegion.agriculturalGenetics.preservedDiversity.staple_grains > exposed.agriculturalGenetics.preservedDiversity.staple_grains,
  'seed conservation should retain more preserved germplasm');

// A region that has lost varieties in cultivation should be able to restore them
// gradually from a well-preserved reserve once the shock and monoculture pressure end.
const recovery=region('recovery');
recovery.construction.assets.push({ typeId:'public_granary', condition:1 }, { typeId:'refrigerated_storage', condition:1 });
recovery.electricity.householdService=1;
recovery.education.literacyRate=.9;
recovery.foodDiversity.productionMix={staple_grains:.38,pulses:.28,fruit_vegetables:.24,animal_foods:.10};
recovery.agriculturalPests={monocultureRisk:.08,extraYieldLoss:{staple_grains:0,pulses:0,fruit_vegetables:0}};
recovery.weather.index=0;
recovery.climate={rainfallMultiplier:1,evaporationMultiplier:1,temperatureAnomalyC:0};
const rs=ensureAgriculturalGenetics(recovery);
rs.liveDiversity.staple_grains=.22;
rs.preservedDiversity.staple_grains=.82;
rs.seedReserve.staple_grains=.82;
setSeedBankPolicy(recovery,{collectionEffort:1,distributionEffort:1});
advance(recovery,30);
assert.ok(recovery.agriculturalGenetics.liveDiversity.staple_grains > .32,
  'stored germplasm should permit gradual reintroduction after genetic erosion');
assert.ok(recovery.agriculturalGenetics.liveDiversity.staple_grains < .82,
  'recovery should be gradual rather than instantly restoring all preserved diversity');

// Diverse crops should be less vulnerable to novel pests and extreme climate,
// without receiving a >1 productivity bonus in normal conditions.
const low=region('low');
const high=region('high');
for(const id of ['staple_grains','pulses','fruit_vegetables']) {
  ensureAgriculturalGenetics(low).liveDiversity[id]=.18;
  ensureAgriculturalGenetics(low).seedReserve[id]=.15;
  ensureAgriculturalGenetics(high).liveDiversity[id]=.88;
  ensureAgriculturalGenetics(high).seedReserve[id]=.85;
}
high.construction.assets.push({typeId:'public_granary',condition:1});
high.electricity.householdService=.8;
assert.ok(geneticPestProtection(high,'staple_grains') > geneticPestProtection(low,'staple_grains')+.12,
  'high crop diversity and preserved seed should provide stronger pest buffering');
assert.ok(geneticClimateMultiplier(high,'staple_grains') > geneticClimateMultiplier(low,'staple_grains'),
  'genetic diversity should reduce climate-shock yield losses');
high.weather.index=0;high.climate={rainfallMultiplier:1,evaporationMultiplier:1,temperatureAnomalyC:0};
assert.equal(geneticClimateMultiplier(high,'staple_grains'),1,
  'genetic resilience must not become a free yield bonus in normal conditions');

console.log('Agricultural genetics regressions passed');
