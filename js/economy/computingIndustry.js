const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));

export const COMPUTING_STAGES=Object.freeze({
  MATERIALS:'materials',
  COMPONENTS:'components',
  CHIP_DESIGN:'chip_design',
  LITHOGRAPHY:'lithography',
  WAFER_FAB:'wafer_fab',
  PACKAGING_TEST:'packaging_test',
  COMPUTER_ASSEMBLY:'computer_assembly',
});

export const COMPUTING_GOODS=Object.freeze({
  ELECTRONIC_GRADE_SILICON:'electronic_grade_silicon',
  INDUSTRIAL_POLYMERS:'industrial_polymers',
  ELECTRONIC_COMPONENTS:'electronic_components',
  LITHOGRAPHY_EQUIPMENT:'lithography_equipment',
  SEMICONDUCTOR_WAFERS:'semiconductor_wafers',
  PACKAGED_CHIPS:'packaged_chips',
  COMPUTERS:'computers',
});

const DEFAULT_NODE_NM=10000;
const NODE_FLOOR_NM=5;
const clampNode=(nm)=>Math.max(NODE_FLOOR_NM,Math.min(DEFAULT_NODE_NM,Number(nm)||DEFAULT_NODE_NM));
const geometricProgress=(from,to)=>Math.log(from/to)/Math.log(1.12);

export function ensureComputingIndustryState(region){
  region.computingIndustry||={
    capacity:{materials:0,components:0,chip_design:0,lithography:0,wafer_fab:0,packaging_test:0,computer_assembly:0},
    experience:{materials:0,components:0,chip_design:0,lithography:0,wafer_fab:0,packaging_test:0,computer_assembly:0},
    process:{bestNodeNm:DEFAULT_NODE_NM,currentNodeNm:DEFAULT_NODE_NM,yield:0.12,nodeExperience:{}},
    design:{bestNodeNm:DEFAULT_NODE_NM,complexity:0.05},
    tooling:{bestNodeNm:DEFAULT_NODE_NM,reliability:0.10},
    lastProduction:{},
  };
  const s=region.computingIndustry;
  s.capacity||={};s.experience||={};s.process||={};s.design||={};s.tooling||={};s.lastProduction||={};
  for(const stage of Object.values(COMPUTING_STAGES)){
    if(!Number.isFinite(s.capacity[stage]))s.capacity[stage]=0;
    if(!Number.isFinite(s.experience[stage]))s.experience[stage]=0;
  }
  s.process.bestNodeNm=clampNode(s.process.bestNodeNm);
  s.process.currentNodeNm=clampNode(s.process.currentNodeNm||s.process.bestNodeNm);
  s.process.yield=clamp(s.process.yield??0.12,0.02,0.98);
  s.process.nodeExperience||={};
  s.design.bestNodeNm=clampNode(s.design.bestNodeNm);
  s.design.complexity=clamp(s.design.complexity??0.05);
  s.tooling.bestNodeNm=clampNode(s.tooling.bestNodeNm);
  s.tooling.reliability=clamp(s.tooling.reliability??0.10);
  region.stockpile||={};
  for(const good of Object.values(COMPUTING_GOODS))if(!Number.isFinite(region.stockpile[good]))region.stockpile[good]=0;
  return s;
}

export function setComputingCapacity(region,stage,capacity){
  if(!Object.values(COMPUTING_STAGES).includes(stage))throw new Error(`Unknown computing stage ${stage}`);
  const s=ensureComputingIndustryState(region);s.capacity[stage]=Math.max(0,Number(capacity)||0);return s.capacity[stage];
}

function gainExperience(s,stage,throughput){
  if(throughput<=0)return;
  const intensity=clamp(Math.log1p(throughput)/4);
  s.experience[stage]=clamp(s.experience[stage]+0.012*intensity*(1-s.experience[stage]));
}

function consume(stock,key,amount){
  const have=Math.max(0,Number(stock[key])||0),take=Math.min(have,Math.max(0,amount));
  stock[key]=have-take;return take;
}

export function produceElectronicMaterials(region,requested=1){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const cap=Math.max(0,s.capacity.materials);
  const amount=Math.min(Math.max(0,requested),cap);
  if(amount<=0)return {silicon:0,polymers:0};
  // Silica is deliberately treated as common feedstock embedded in ordinary stone/sand supply;
  // electronic-grade purification is the scarce capability. Polymers consume refined petroleum feedstock.
  const silicaFeed=Math.min(amount,(stock.stone||0)/0.18);
  const polymerFeed=Math.min(amount,(stock.heavy_fuel_oil||stock.lamp_fuel||0)/0.12);
  const actual=Math.max(0,Math.min(amount,silicaFeed,polymerFeed));
  if(actual<=0)return {silicon:0,polymers:0};
  consume(stock,'stone',actual*0.18);
  if((stock.heavy_fuel_oil||0)>0)consume(stock,'heavy_fuel_oil',actual*0.12);else consume(stock,'lamp_fuel',actual*0.12);
  stock.electronic_grade_silicon+=actual*0.82;
  stock.industrial_polymers+=actual*0.72;
  gainExperience(s,COMPUTING_STAGES.MATERIALS,actual);
  return {silicon:actual*0.82,polymers:actual*0.72};
}

export function produceElectronicComponents(region,requested=1){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const amount=Math.min(Math.max(0,requested),Math.max(0,s.capacity.components));
  const possible=Math.min(amount,(stock.copper||0)/0.08,(stock.industrial_polymers||0)/0.05);
  if(possible<=0)return 0;
  consume(stock,'copper',possible*0.08);consume(stock,'industrial_polymers',possible*0.05);
  stock.electronic_components+=possible;
  gainExperience(s,COMPUTING_STAGES.COMPONENTS,possible);
  return possible;
}

export function developChipDesign(region,{targetNodeNm,effort=1}={}){
  const s=ensureComputingIndustryState(region);const target=clampNode(targetNodeNm||s.design.bestNodeNm);
  if(target>=s.design.bestNodeNm)return {advanced:false,bestNodeNm:s.design.bestNodeNm};
  const steps=geometricProgress(s.design.bestNodeNm,target);
  const readiness=s.experience.chip_design+clamp(s.capacity.chip_design/20)*0.55+clamp(s.experience.components)*0.25;
  if(readiness*Math.max(0,effort)<Math.max(0.18,steps*0.09))return {advanced:false,bestNodeNm:s.design.bestNodeNm,reason:'insufficient_design_experience'};
  s.design.bestNodeNm=target;s.design.complexity=clamp(s.design.complexity+0.025*Math.max(1,steps));
  gainExperience(s,COMPUTING_STAGES.CHIP_DESIGN,effort*3);
  return {advanced:true,bestNodeNm:target};
}

export function improveLithography(region,{targetNodeNm,effort=1}={}){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;const target=clampNode(targetNodeNm||s.tooling.bestNodeNm);
  if(target>=s.tooling.bestNodeNm)return {advanced:false,bestNodeNm:s.tooling.bestNodeNm};
  const steps=geometricProgress(s.tooling.bestNodeNm,target);
  const readiness=s.experience.lithography+clamp(s.capacity.lithography/12)*0.6+clamp(s.experience.components)*0.2;
  const componentNeed=Math.max(0.25,steps*0.35)*Math.max(0.5,effort);
  if(readiness*Math.max(0,effort)<Math.max(0.2,steps*0.10))return {advanced:false,bestNodeNm:s.tooling.bestNodeNm,reason:'insufficient_lithography_experience'};
  if((stock.electronic_components||0)<componentNeed)return {advanced:false,bestNodeNm:s.tooling.bestNodeNm,reason:'insufficient_precision_components'};
  consume(stock,'electronic_components',componentNeed);
  s.tooling.bestNodeNm=target;s.tooling.reliability=clamp(s.tooling.reliability+0.03*Math.max(1,steps));
  stock.lithography_equipment+=Math.max(0.1,effort*0.2);
  gainExperience(s,COMPUTING_STAGES.LITHOGRAPHY,effort*4);
  return {advanced:true,bestNodeNm:target};
}

export function fabricateSemiconductors(region,{targetNodeNm,waferStarts=1}={}){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const node=clampNode(targetNodeNm||s.process.currentNodeNm||s.process.bestNodeNm);
  const capacity=Math.max(0,s.capacity.wafer_fab);
  const starts=Math.min(Math.max(0,waferStarts),capacity);
  if(starts<=0)return {waferStarts:0,goodWafers:0,nodeNm:node,yield:0,reason:'no_fab_capacity'};
  if(node<s.design.bestNodeNm)return {waferStarts:0,goodWafers:0,nodeNm:node,yield:0,reason:'design_frontier'};
  if(node<s.tooling.bestNodeNm)return {waferStarts:0,goodWafers:0,nodeNm:node,yield:0,reason:'lithography_frontier'};
  if((stock.lithography_equipment||0)<=0)return {waferStarts:0,goodWafers:0,nodeNm:node,yield:0,reason:'no_lithography_equipment'};
  const possible=Math.min(starts,(stock.electronic_grade_silicon||0)/0.12,(stock.industrial_polymers||0)/0.025,(stock.electronic_components||0)/0.012);
  if(possible<=0)return {waferStarts:0,goodWafers:0,nodeNm:node,yield:0,reason:'materials_shortage'};
  consume(stock,'electronic_grade_silicon',possible*0.12);consume(stock,'industrial_polymers',possible*0.025);consume(stock,'electronic_components',possible*0.012);
  const prior=clamp(Number(s.process.nodeExperience[node])||0);
  const difficulty=clamp(0.22+0.055*Math.max(0,geometricProgress(DEFAULT_NODE_NM,node)),0.22,0.88);
  const maturity=clamp(prior*0.72+s.experience.wafer_fab*0.28);
  const yieldRate=clamp(0.08+(1-difficulty)*0.42+maturity*0.48,0.03,0.96);
  const good=possible*yieldRate;
  stock.semiconductor_wafers+=good;
  const practice=clamp(Math.log1p(possible)/5);
  s.process.nodeExperience[node]=clamp(prior+0.022*practice*(1-prior));
  gainExperience(s,COMPUTING_STAGES.WAFER_FAB,possible);
  s.process.currentNodeNm=node;s.process.yield=yieldRate;
  if(node<s.process.bestNodeNm&&s.process.nodeExperience[node]>=0.22)s.process.bestNodeNm=node;
  s.lastProduction.waferFab={nodeNm:node,waferStarts:possible,goodWafers:good,yield:yieldRate};
  return {...s.lastProduction.waferFab};
}

export function packageAndTestChips(region,requested=1){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const amount=Math.min(Math.max(0,requested),Math.max(0,s.capacity.packaging_test),stock.semiconductor_wafers||0,(stock.industrial_polymers||0)/0.015,(stock.copper||0)/0.018);
  if(amount<=0)return 0;
  consume(stock,'semiconductor_wafers',amount);consume(stock,'industrial_polymers',amount*0.015);consume(stock,'copper',amount*0.018);
  stock.packaged_chips+=amount;
  gainExperience(s,COMPUTING_STAGES.PACKAGING_TEST,amount);
  return amount;
}

export function assembleComputers(region,requested=1){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const amount=Math.min(Math.max(0,requested),Math.max(0,s.capacity.computer_assembly),(stock.packaged_chips||0)/1,(stock.electronic_components||0)/1.6,(stock.industrial_polymers||0)/0.35,(stock.copper||0)/0.16);
  if(amount<=0)return 0;
  consume(stock,'packaged_chips',amount);consume(stock,'electronic_components',amount*1.6);consume(stock,'industrial_polymers',amount*0.35);consume(stock,'copper',amount*0.16);
  stock.computers+=amount;
  gainExperience(s,COMPUTING_STAGES.COMPUTER_ASSEMBLY,amount);
  return amount;
}

export function semiconductorSupplyChainSummary(region){
  const s=ensureComputingIndustryState(region),stock=region.stockpile;
  const stages={};for(const stage of Object.values(COMPUTING_STAGES))stages[stage]={capacity:s.capacity[stage],experience:s.experience[stage]};
  return {
    stages,
    designNodeNm:s.design.bestNodeNm,
    lithographyNodeNm:s.tooling.bestNodeNm,
    fabNodeNm:s.process.bestNodeNm,
    currentFabYield:s.process.yield,
    inventory:Object.fromEntries(Object.values(COMPUTING_GOODS).map(g=>[g,stock[g]||0])),
  };
}
