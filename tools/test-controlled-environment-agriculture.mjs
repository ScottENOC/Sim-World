import assert from 'node:assert/strict';
import {
  COMMERCIAL_GREENHOUSE_TECH_ID, HYDROPONIC_CEA_TECH_ID,
  ensureControlledEnvironmentAgriculture, tickControlledEnvironmentAgriculture,
  controlledEnvironmentBreakthroughChances,
} from '../js/economy/controlledEnvironmentAgriculture.js';
import { electricityDemand } from '../js/economy/electricity.js';

function region(){return {
  id:'cea-test',name:'CEA test',population:100000,treasury:600,wallet:500,
  unlockedTechIds:new Set([COMMERCIAL_GREENHOUSE_TECH_ID,'advanced_factories','synthetic_nitrogen_fertiliser']),
  stockpile:{steel:500,machine_components:500,fertiliser:100},
  agriculturalLand:{cultivatedHa:15000,availableArableHa:18000,cultivationShare:.83},
  foodDiversity:{shortage:{fruit_vegetables:.7,pulses:.35,staple_grains:.1,animal_foods:.1}},
  agriculturalPests:{aggregateExtraLoss:.25},weather:{yieldMultiplier:.72},hydrology:{waterAvailability:.6},
  industrialPlants:{factoryCapacity:80},industrialSupply:{capability:{precision_machining:.65}},
  structuralTransformation:{capability:{manufacture:.72}},corporateCapital:{financialDepth:.55,investibleWealth:1000},
  electricity:{industrialService:.92,delivered:100,demand:100},settlements:{urbanShare:.65},
};}

{
  const r=region();const s=ensureControlledEnvironmentAgriculture(r);s.publicSupportPolicy='none';
  tickControlledEnvironmentAgriculture(r,365.2425);
  assert.ok(s.greenhouseHa>0,'viable private capital should build some greenhouse capacity');
  assert.equal(s.lastPublicSpend,0,'no-support policy must not spend treasury');
  assert.ok(s.lastFoodOutput>0&&s.lastProduceOutput>0,'protected agriculture should create real food and produce stocks');
}

{
  const unsupported=region();unsupported.corporateCapital.financialDepth=.03;unsupported.corporateCapital.investibleWealth=1;unsupported.wallet=1;unsupported.foodDiversity.shortage.fruit_vegetables=.95;
  const beforeUnsupported=unsupported.treasury;const us=ensureControlledEnvironmentAgriculture(unsupported);us.publicSupportPolicy='none';tickControlledEnvironmentAgriculture(unsupported,365.2425);
  const supported=region();supported.corporateCapital.financialDepth=.03;supported.corporateCapital.investibleWealth=1;supported.wallet=1;supported.foodDiversity.shortage.fruit_vegetables=.95;
  const beforeSupported=supported.treasury;const ss=ensureControlledEnvironmentAgriculture(supported);ss.publicSupportPolicy='strategic';tickControlledEnvironmentAgriculture(supported,365.2425);
  assert.ok(ss.greenhouseHa>us.greenhouseHa,'public support should bridge an early private-capital viability gap');
  assert.ok(ss.lastPublicSpend>0&&supported.treasury<beforeSupported,'support must consume actual treasury');
  assert.equal(unsupported.treasury,beforeUnsupported,'no-support case should not consume treasury');
}

{
  const r=region();r.unlockedTechIds.add(HYDROPONIC_CEA_TECH_ID);const s=ensureControlledEnvironmentAgriculture(r);s.greenhouseHa=30;s.greenhouseExperience=.7;s.publicSupportPolicy='strategic';
  tickControlledEnvironmentAgriculture(r,365.2425);
  assert.ok(s.hydroponicHa>0,'mature, electrified regions should be able to invest in hydroponics');
  assert.ok(s.electricityLoad>0,'hydroponics must create a real electricity load');
  const d=electricityDemand(r,7);assert.ok(d.controlledAgricultureDemand>0,'electricity system must see the CEA load');
  assert.ok(s.waterSaving>.3&&s.pestProtection>.5,'CEA should materially reduce outdoor ecological exposure');
}

{
  const weak=region();weak.unlockedTechIds.add(HYDROPONIC_CEA_TECH_ID);weak.electricity.industrialService=.12;const s=ensureControlledEnvironmentAgriculture(weak);s.hydroponicHa=25;s.publicSupportPolicy='none';tickControlledEnvironmentAgriculture(weak,365.2425);
  const strong=region();strong.unlockedTechIds.add(HYDROPONIC_CEA_TECH_ID);const t=ensureControlledEnvironmentAgriculture(strong);t.hydroponicHa=25;t.publicSupportPolicy='none';tickControlledEnvironmentAgriculture(strong,365.2425);
  assert.ok(t.lastFoodOutput>s.lastFoodOutput*1.6,'hydroponics should be strongly constrained by unreliable electricity');
}

{
  const r=region();const byId=new Map([[r.id,r]]);let c=controlledEnvironmentBreakthroughChances(r,byId);assert.ok(c.greenhouse>0,'industrial urban regions with food/climate pressure should be able to discover commercial greenhouse horticulture');
  r.unlockedTechIds.add(COMMERCIAL_GREENHOUSE_TECH_ID);ensureControlledEnvironmentAgriculture(r).greenhouseExperience=.5;c=controlledEnvironmentBreakthroughChances(r,byId);assert.ok(c.hydroponic>0,'greenhouse experience, fertiliser, advanced factories and electricity should enable hydroponic breakthrough');
}

console.log('controlled-environment agriculture regression passed');
