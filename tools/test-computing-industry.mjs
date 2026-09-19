import assert from 'node:assert/strict';
import {
  COMPUTING_STAGES, ensureComputingIndustryState, setComputingCapacity,
  produceElectronicMaterials, produceElectronicComponents, developChipDesign,
  improveLithography, fabricateSemiconductors, packageAndTestChips,
  assembleComputers, semiconductorSupplyChainSummary,
} from '../js/economy/computingIndustry.js';
import { TRADE_GOODS } from '../js/economy/tradeGoods.js';

function region(id='r'){
  return {id,stockpile:{stone:1000,heavy_fuel_oil:1000,copper:1000},unlockedTechIds:new Set()};
}
function capacities(r,values){for(const [stage,value] of Object.entries(values))setComputingCapacity(r,stage,value);return r;}

for(const good of ['electronic_grade_silicon','industrial_polymers','electronic_components','lithography_equipment','semiconductor_wafers','packaged_chips','computers']){
  assert(TRADE_GOODS[good],`${good} must be an ordinary trade-system good so stages can specialise geographically`);
}
assert(TRADE_GOODS.lithography_equipment.strategic,'leading production equipment should be eligible for export controls');
assert(TRADE_GOODS.packaged_chips.strategic,'advanced chips should be eligible for export controls');

const materials=capacities(region('materials'),{[COMPUTING_STAGES.MATERIALS]:20});
const materialOut=produceElectronicMaterials(materials,10);
assert(materialOut.silicon>0&&materialOut.polymers>0,'materials specialists should purify silicon and make polymers');
assert(materials.stockpile.stone<1000&&materials.stockpile.heavy_fuel_oil<1000,'electronic materials must consume physical feedstocks');

const components=capacities(region('components'),{[COMPUTING_STAGES.COMPONENTS]:20});
components.stockpile.industrial_polymers=materialOut.polymers;
const componentOut=produceElectronicComponents(components,10);
assert(componentOut>0,'component plants should turn copper and polymers into electronic components');

// Geographic specialisation is intentional: move only the traded intermediate goods,
// not experience/capability, into a separate tooling/design/fab region.
const frontier=capacities(region('frontier'),{
  [COMPUTING_STAGES.CHIP_DESIGN]:20,[COMPUTING_STAGES.LITHOGRAPHY]:20,[COMPUTING_STAGES.WAFER_FAB]:100,
});
frontier.stockpile.electronic_components=componentOut;
frontier.stockpile.electronic_grade_silicon=materialOut.silicon;
frontier.stockpile.industrial_polymers=materialOut.polymers;
const fs=ensureComputingIndustryState(frontier);
fs.experience.chip_design=.75;fs.experience.lithography=.75;fs.experience.wafer_fab=.55;
fs.design.bestNodeNm=45;fs.tooling.bestNodeNm=45;fs.process.bestNodeNm=45;fs.process.currentNodeNm=45;fs.process.nodeExperience[45]=.65;

const beforeComponents=frontier.stockpile.electronic_components;
const litho=improveLithography(frontier,{targetNodeNm:37,effort:2});
assert(litho.advanced&&litho.bestNodeNm===37,'experienced precision-tool makers should be able to advance from 45 nm toward 37 nm');
assert(frontier.stockpile.lithography_equipment>0,'lithography progress should create physical capital equipment');
assert(frontier.stockpile.electronic_components<beforeComponents,'new lithography tools should consume precision electronic components');
const design=developChipDesign(frontier,{targetNodeNm:37,effort:2});
assert(design.advanced&&design.bestNodeNm===37,'chip design capability should be a separate frontier from lithography');

const first37=fabricateSemiconductors(frontier,{targetNodeNm:37,waferStarts:40});
assert(first37.goodWafers>0&&first37.yield<.9,'a newly introduced smaller node should initially have imperfect yield');
const firstYield=first37.yield;
for(let i=0;i<180;i++){
  frontier.stockpile.electronic_grade_silicon+=10;
  frontier.stockpile.industrial_polymers+=10;
  frontier.stockpile.electronic_components+=10;
  fabricateSemiconductors(frontier,{targetNodeNm:37,waferStarts:40});
}
const mature37=fabricateSemiconductors(frontier,{targetNodeNm:37,waferStarts:40});
assert(mature37.yield>firstYield,'repeated production at 37 nm should improve yield through learning by doing');
assert(ensureComputingIndustryState(frontier).process.nodeExperience[37]>0,'fab learning must be tracked at the specific process node');

const packager=capacities(region('packager'),{[COMPUTING_STAGES.PACKAGING_TEST]:50});
packager.stockpile.semiconductor_wafers=20;packager.stockpile.industrial_polymers=20;
const packaged=packageAndTestChips(packager,15);
assert(packaged>0,'a distinct region should be able to specialise in packaging/test using imported wafers');

const assembler=capacities(region('assembler'),{[COMPUTING_STAGES.COMPUTER_ASSEMBLY]:50});
assembler.stockpile.packaged_chips=packaged;assembler.stockpile.electronic_components=50;assembler.stockpile.industrial_polymers=50;
const computers=assembleComputers(assembler,10);
assert(computers>0,'final computer assembly should consume imported chips and other components');

const broken=capacities(region('broken'),{[COMPUTING_STAGES.COMPUTER_ASSEMBLY]:100});
broken.stockpile.electronic_components=100;broken.stockpile.industrial_polymers=100;
assert.equal(assembleComputers(broken,20),0,'huge final-assembly capacity must be useless without packaged chips');

const noToolFab=capacities(region('no-tool-fab'),{[COMPUTING_STAGES.WAFER_FAB]:100});
const ns=ensureComputingIndustryState(noToolFab);ns.design.bestNodeNm=1000;ns.tooling.bestNodeNm=1000;
noToolFab.stockpile.electronic_grade_silicon=100;noToolFab.stockpile.industrial_polymers=100;noToolFab.stockpile.electronic_components=100;
const failedFab=fabricateSemiconductors(noToolFab,{targetNodeNm:1000,waferStarts:10});
assert.equal(failedFab.goodWafers,0,'a fab should not produce chips merely because it has generic factory capacity');
assert.equal(failedFab.reason,'no_lithography_equipment');

const summary=semiconductorSupplyChainSummary(frontier);
assert.equal(summary.designNodeNm,37);assert.equal(summary.lithographyNodeNm,37);
assert(summary.stages.wafer_fab.experience>0,'specialised production experience should remain local to the region doing the work');

console.log('computing supply chain, geographic specialisation, bottleneck and process-node learning regressions passed');
