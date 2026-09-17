import assert from 'node:assert/strict';
import { economicRegulatoryCapacity, regulationAvailability, ensureEconomicRegulation, setEconomicRegulation, applyRegulationToTerritories, reviewNpcEconomicRegulation } from '../js/economy/economicRegulation.js';
import { evolveEnterpriseOperatingModel } from '../js/economy/enterpriseBehaviour.js';

const bronzePolity={id:'bronze',administration:{officialdom:.14,recordKeeping:.12,accounting:.08,communications:.1,delegation:.1}};
const bronzeRegion={id:'b1',population:10000,corporateCapital:{financialDepth:.02,corporateLaw:.01},medievalSociety:{education:{knowledgeCapacity:.05}}};
const bronzeAvail=regulationAvailability(bronzePolity,[bronzeRegion]);
assert.equal(bronzeAvail.rehabilitation_bonds.available,false,'Bronze-age administration must not support rehabilitation bonds');
assert.equal(bronzeAvail.environmental_permitting.available,false,'weak administration must not support modern permitting');
assert.equal(setEconomicRegulation(bronzePolity,'rehabilitation_bonds',1,{territories:[bronzeRegion]}).changed,false,'hard model gate must reject unavailable policy');

const capablePolity={id:'modernising',administration:{officialdom:.82,recordKeeping:.84,accounting:.8,communications:.72,delegation:.62}};
const capableRegion={id:'c1',population:500000,corporateCapital:{financialDepth:.58,corporateLaw:.61},medievalSociety:{education:{knowledgeCapacity:.7}},enterpriseExternalities:{labourHarm:.8,customerHarm:.5,maintenanceRisk:.7,environmentalHarm:.9,futureLiability:.85}};
const cap=economicRegulatoryCapacity(capablePolity,[capableRegion]);
assert(cap.general>.65);
const avail=regulationAvailability(capablePolity,[capableRegion]);
assert.equal(avail.rehabilitation_bonds.available,true);
assert.equal(setEconomicRegulation(capablePolity,'rehabilitation_bonds',.8,{territories:[capableRegion]}).changed,true);
assert.equal(setEconomicRegulation(capablePolity,'worker_safety',.7,{territories:[capableRegion]}).changed,true);
applyRegulationToTerritories(capablePolity,[capableRegion]);
assert.equal(capableRegion.economicRegulation.rehabilitationProvision,.8);
assert.equal(capableRegion.economicRegulation.workerSafety,.7);

const unregulated={operatingModel:{wageFairness:.5,workerSafety:.5,customerService:.5,maintenanceDiscipline:.5,environmentalCare:.5,rehabilitationProvision:.5}};
const regulated={operatingModel:{...unregulated.operatingModel}};
evolveEnterpriseOperatingModel(unregulated,{years:2,profitPressure:.8,debtPressure:.7,regulation:0});
evolveEnterpriseOperatingModel(regulated,{years:2,profitPressure:.8,debtPressure:.7,regulation:{workerSafety:1,environmentalCare:1,rehabilitationProvision:1}});
assert(regulated.operatingModel.workerSafety>unregulated.operatingModel.workerSafety);
assert(regulated.operatingModel.environmentalCare>unregulated.operatingModel.environmentalCare);
assert(regulated.operatingModel.rehabilitationProvision>unregulated.operatingModel.rehabilitationProvision);

ensureEconomicRegulation(capablePolity);
const npc=reviewNpcEconomicRegulation(capablePolity,[capableRegion],{capitalShortage:0,industrialAmbition:.7,securityThreat:.1});
assert(npc.state.levels.environmental_permitting>0,'NPC should respond to severe environmental harm when capable');
assert(npc.state.levels.rehabilitation_bonds>0,'NPC should use rehabilitation security when capable and liabilities are high');

console.log('economic regulation regressions passed');
