import assert from 'node:assert/strict';
import {
  ensureSoilDegradation,
  setSoilManagement,
  soilDegradationSummary,
  tickSoilDegradation,
} from '../js/economy/soilDegradation.js';

function region(overrides={}){
  return {
    id:'soil-test',
    areaSqKm:100,
    landQuality:1,
    terrain:{plains:.4,hills:.6,mountains:0,forest:0,wetland:0},
    forest:{currentStock:0},
    agriculturalLand:{cultivationShare:.95},
    weather:{index:-1.35,condition:'drought'},
    climate:{rainfallMultiplier:.72,evaporationMultiplier:1.45},
    ...overrides,
  };
}

function years(r,count){
  for(let i=0;i<count;i++)tickSoilDegradation(r,365.2425);
  return r;
}

{
  const r=region();
  ensureSoilDegradation(r);
  years(r,80);
  assert.ok(r.soilDegradation.condition<.75,'intensive dry sloping cultivation should erode soil over decades');
  assert.ok(r.landQuality<.75,'erosion must reduce effective land quality used by the economy');
  assert.equal(r.soilDegradation.baselineLandQuality,1,'geographic baseline land quality must remain recoverable');
}

{
  const r=region();
  years(r,160);
  assert.ok(r.soilDegradation.desertification>.02,'severely degraded dry cultivated land should begin desertifying');
  assert.ok(r.soilDegradation.productivityMultiplier<r.soilDegradation.condition,
    'desertification should impose an additional persistent productivity penalty');
}

{
  const unmanaged=region({id:'unmanaged'});
  const conserved=region({id:'conserved'});
  setSoilManagement(conserved,{conservationEffort:1});
  years(unmanaged,60);
  years(conserved,60);
  assert.ok(conserved.soilDegradation.condition>unmanaged.soilDegradation.condition+.05,
    'strong conservation should materially reduce erosion');
}

{
  const r=region({
    id:'restoration',
    landQuality:.30,
    soilDegradation:{baselineLandQuality:1,condition:.48,desertification:.42,cumulativeErosion:.52,cumulativeRestoration:0},
    agriculturalLand:{cultivationShare:.05},
    forest:{currentStock:60},
    weather:{index:.15,condition:'normal'},
    climate:{rainfallMultiplier:1.02,evaporationMultiplier:.95},
  });
  ensureSoilDegradation(r);
  const before=soilDegradationSummary(r);
  setSoilManagement(r,{conservationEffort:1,restorationEffort:1});
  years(r,50);
  const after=soilDegradationSummary(r);
  assert.ok(after.condition>before.condition+.15,'active restoration and fallow should rebuild degraded soil');
  assert.ok(after.desertification<before.desertification-.10,'restoration should slowly reverse desertification');
  assert.ok(after.effectiveLandQuality>before.effectiveLandQuality+.15,'restored soil should recover real productive land quality');
  assert.ok(after.effectiveLandQuality<=after.baselineLandQuality*1.05+1e-9,'restoration must not create unlimited fertility');
}

console.log('soil degradation regression: ok');
