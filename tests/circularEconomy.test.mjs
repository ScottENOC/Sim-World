import assert from 'node:assert/strict';
import {
  CIRCULAR_ECONOMY_TECH_IDS,
  circularEconomySummary,
  ensureCircularEconomy,
  materialReserveStatus,
  plasticDemandMultiplier,
  recordMaterialDiscard,
  recordMaterialUse,
  setCircularEconomyPolicy,
  tickCircularEconomy,
} from '../js/economy/circularEconomy.js?v=20260923-closed-loop1';

function region(overrides={}) {
  return {
    id:'test', name:'Test', population:1_000_000,
    stockpile:{ copper:0,tin:0,iron:0,steel:0,aluminium:0,titanium:0,lead:0,battery_grade_lithium:0,battery_grade_cobalt:0,battery_grade_nickel:0,battery_graphite:0 },
    unlockedTechIds:new Set(['advanced_factories','industrial_electrification']),
    structuralTransformation:{capability:{manufacture:.8}},
    massEducation:{literacy:.8}, electricity:{industrialService:.85},
    deposits:{
      copper:{tiers:[{initialStock:100,remainingStock:55}]},
      tin:{tiers:[{initialStock:50,remainingStock:20}]},
      ironOre:{tiers:[{initialStock:500,remainingStock:400}]},
      bauxite:{depth:.7,remainingFraction:.65},
      titanium_minerals:{depth:.4,remainingFraction:.7},
      lead:{depth:.5,remainingFraction:.6}, lithium:{depth:.5,remainingFraction:.45}, cobalt:{depth:.4,remainingFraction:.25}, nickel:{depth:.6,remainingFraction:.5}, graphite:{depth:.6,remainingFraction:.7},
    }, construction:{assets:[]}, report:{}, ...overrides,
  };
}

{
  const r=region();
  assert.equal(materialReserveStatus(r,'copper').fraction,.55,'real region.deposits should report remaining stock fraction');
  assert.equal(materialReserveStatus(r,'lithium').fraction,.45,'modern remainingFraction deposits should share the same reserve API');
}

{
  const r=region();
  recordMaterialUse(r,'copper',100,'grid');
  tickCircularEconomy(r,365.2425);
  assert(r.circularEconomy.inUse.copper>90,'material use should become an embodied in-use stock');
  assert(r.report.circularEconomy,'normal ticks should publish advisor-facing circularity state');
}

{
  const r=region(); const s=ensureCircularEconomy(r);
  r.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.RECYCLING);
  r.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ADVANCED_RECOVERY);
  r.unlockedTechIds.add(CIRCULAR_ECONOMY_TECH_IDS.ECODESIGN);
  setCircularEconomyPolicy(r,{collectionEffort:1,recycledContentStandard:1,landfillDisincentive:1,repairAndReuse:.2,recoveryInvestment:1});
  s.capability={collection:.95,sorting:.95,recovery:.95,ecodesign:.8,urbanMining:0,closedLoop:0,substitution:0};
  s.inUse.copper=1000;
  const before=r.stockpile.copper;
  tickCircularEconomy(r,365.2425*5);
  assert(s.recovered.copper>0,'retired material should be recovered');
  assert(r.stockpile.copper>before,'recovered material should return to the existing consumable stockpile');
  assert(s.scrap.copper>=0,'unprocessed collected scrap should be retained rather than destroyed');
  assert(s.landfill.copper>0,'pre-closed-loop metal losses should remain recoverable as legacy waste');
}

{
  const r=region({
    structuralTransformation:{capability:{manufacture:1}},
    massEducation:{literacy:1}, electricity:{industrialService:1},
  });
  const s=ensureCircularEconomy(r);
  for (const id of Object.values(CIRCULAR_ECONOMY_TECH_IDS)) r.unlockedTechIds.add(id);
  setCircularEconomyPolicy(r,{collectionEffort:1,recycledContentStandard:1,landfillDisincentive:1,repairAndReuse:0,recoveryInvestment:1,urbanMiningEffort:1,materialSubstitution:1});
  s.capability={collection:1,sorting:1,recovery:1,ecodesign:1,urbanMining:1,closedLoop:1,substitution:1};
  s.inUse.iron=10_000;
  const expectedRetired=10_000*(1-Math.exp(-1/38));
  tickCircularEconomy(r,365.2425);
  assert(Math.abs(r.circularEconomy.materials.iron.recoveredFromScrap-expectedRetired)<1e-6,'fully developed closed-loop metallurgy should recover 100% of freshly retired elemental metal');
  assert.equal(r.circularEconomy.landfill.iron,0,'perfect current metal recovery should create no new landfill loss');
  assert(plasticDemandMultiplier(r)<=.051,'advanced substitution should be able to remove nearly all hard dependence on plastics');
}

{
  const r=region({
    structuralTransformation:{capability:{manufacture:1}},
    massEducation:{literacy:1}, electricity:{industrialService:1},
  });
  const s=ensureCircularEconomy(r);
  for (const id of Object.values(CIRCULAR_ECONOMY_TECH_IDS)) r.unlockedTechIds.add(id);
  setCircularEconomyPolicy(r,{collectionEffort:1,recoveryInvestment:1,urbanMiningEffort:1,materialSubstitution:1});
  s.capability={collection:1,sorting:1,recovery:1,ecodesign:1,urbanMining:1,closedLoop:1,substitution:1};
  recordMaterialDiscard(r,'copper',1000);
  const before=s.landfill.copper;
  tickCircularEconomy(r,365.2425);
  assert(s.landfill.copper<before,'urban mining should recover metal previously sent to landfill');
  assert(r.stockpile.copper>0,'urban-mined metal should return to usable stock');
}

{
  const r=region();
  r.construction.assets.push({id:'water-plant-1',typeId:'water_treatment_plant',scale:1,condition:1});
  tickCircularEconomy(r,7);
  const steel=r.circularEconomy.inUse.steel+r.circularEconomy.pendingUse.steel;
  const copper=r.circularEconomy.inUse.copper+r.circularEconomy.pendingUse.copper;
  assert(steel>200&&copper>40,'completed infrastructure should enter the recyclable in-use material stock');
  tickCircularEconomy(r,7);
  const steelAfter=r.circularEconomy.inUse.steel+r.circularEconomy.pendingUse.steel;
  assert(steelAfter<steel+1,'the same infrastructure asset must not be double-counted every tick');
}

{
  const low=region({id:'low'}), high=region({id:'high'});
  ensureCircularEconomy(low).inUse.aluminium=1000; ensureCircularEconomy(high).inUse.aluminium=1000;
  setCircularEconomyPolicy(low,{repairAndReuse:0}); setCircularEconomyPolicy(high,{repairAndReuse:1});
  tickCircularEconomy(low,365.2425); tickCircularEconomy(high,365.2425);
  assert(high.circularEconomy.materials.aluminium.retired < low.circularEconomy.materials.aluminium.retired,'repair and reuse should extend service life and delay scrap generation');
}

{
  const secure=region({id:'secure'}), depleted=region({id:'depleted'});
  depleted.deposits.cobalt.remainingFraction=.01;
  recordMaterialUse(secure,'cobalt',10,'batteries'); recordMaterialUse(depleted,'cobalt',10,'batteries');
  tickCircularEconomy(secure,365.2425); tickCircularEconomy(depleted,365.2425);
  assert(depleted.circularEconomy.materials.cobalt.security < secure.circularEconomy.materials.cobalt.security,'depleted critical resources should reduce material security');
  assert(depleted.circularEconomy.materials.cobalt.depletionPressure > secure.circularEconomy.materials.cobalt.depletionPressure,'depletion pressure should rise as critical reserves run down');
}

{
  const r=region();
  recordMaterialUse(r,'lithium',20,'batteries');
  tickCircularEconomy(r,365.2425);
  const summary=circularEconomySummary(r);
  assert(Number.isFinite(summary.materialSecurity));
  assert(Number.isFinite(summary.durableControlMargin));
  assert(Number.isFinite(summary.electricityLoad));
  assert(summary.materials.lithium.inUse>0,'endgame-facing summary should include embodied stocks by material');
}

console.log('circular economy regressions passed');
