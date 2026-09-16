from pathlib import Path

# economicOwnership: distinguish equity/cash/debt and expose borrowing.
p=Path('js/economy/economicOwnership.js'); s=p.read_text()
if not s.startswith("import { borrowEnterprise"):
    s="import { borrowEnterprise, ensureEnterpriseOperatingModel, serviceEnterpriseDebt } from './enterpriseBehaviour.js';\n"+s
s=s.replace("    governmentCapital: Math.max(0, Number(governmentCapital) || 0),\n    retainedEarnings: 0,\n    debt: 0,", "    governmentCapital: Math.max(0, Number(governmentCapital) || 0),\n    cash: Math.max(0, Number(governmentCapital) || 0),\n    retainedEarnings: 0,\n    investedCapital: 0,\n    debt: 0,\n    debtServiceArrears: 0,\n    interestRate: 0.06,\n    creditQuality: 0.5,\n    targetDebtShare: 0.35,")
s=s.replace("  state.stateEnterprises.push(enterprise);\n  return { created: true, enterprise };", "  ensureEnterpriseOperatingModel(enterprise,{publicEnterprise:true});\n  state.stateEnterprises.push(enterprise);\n  return { created: true, enterprise };")
s=s.replace("  enterprise.governmentCapital += value;\n  return { funded: true, amount: value, enterprise };", "  enterprise.governmentCapital += value;\n  enterprise.cash = Math.max(0, Number(enterprise.cash) || 0) + value;\n  return { funded: true, amount: value, enterprise };")
anchor="export function economicOwnershipIndicators(polity) {"
insert="""export function borrowStateEnterprise(polity, enterpriseId, amount, context = {}) {
  const enterprise = stateEnterpriseById(polity, enterpriseId);
  if (!enterprise || enterprise.status !== 'active') return { borrowed: false, reason: 'enterprise_not_found' };
  return borrowEnterprise(enterprise, amount, context);
}

export function serviceStateEnterpriseDebt(polity, enterpriseId, years = 1) {
  const enterprise = stateEnterpriseById(polity, enterpriseId);
  if (!enterprise || enterprise.status !== 'active') return { serviced: false, reason: 'enterprise_not_found' };
  return { serviced: true, ...serviceEnterpriseDebt(enterprise, years), enterprise };
}

"""
if 'export function borrowStateEnterprise' not in s: s=s.replace(anchor,insert+anchor,1)
p.write_text(s)

# corporate infrastructure: SOE construction spends cash; operating assets carry standards and externalities.
p=Path('js/economy/corporateInfrastructure.js'); s=p.read_text()
if "from './enterpriseBehaviour.js'" not in s:
    s=s.replace("import { infrastructureCapacity } from '../military/infrastructureDamage.js';", "import { infrastructureCapacity } from '../military/infrastructureDamage.js';\nimport { applyEnterpriseExternalities, ensureEnterpriseOperatingModel } from './enterpriseBehaviour.js';")
s=s.replace("if((enterprise.governmentCapital||0)<capitalCost)return{accepted:false,reason:'insufficient_enterprise_capital',required:capitalCost,available:enterprise.governmentCapital||0};", "enterprise.cash=Number.isFinite(enterprise.cash)?Math.max(0,enterprise.cash):Math.max(0,(enterprise.governmentCapital||0)+(enterprise.debt||0)+(enterprise.retainedEarnings||0)-(enterprise.investedCapital||0));if(enterprise.cash<capitalCost)return{accepted:false,reason:'insufficient_enterprise_cash',required:capitalCost,available:enterprise.cash};")
s=s.replace("enterprise.governmentCapital-=capitalCost;", "enterprise.cash-=capitalCost;")
s=s.replace("enterprise.investedCapital=(enterprise.investedCapital||0)+capitalCost;", "enterprise.investedCapital=(enterprise.investedCapital||0)+capitalCost;const operatingModel=ensureEnterpriseOperatingModel(enterprise,{publicEnterprise:true});asset.operatingModel={...operatingModel};")
old="asset.condition=clamp((asset.condition??1)+years*(maintained*.02-(1-maintained)*.12));asset.effectiveCapacity=asset.baseCapacity*operating*infrastructureCapacity(asset);asset.lastOperatingRatio=operating;asset.lastMaintenanceRatio=maintained;return asset;}"
new="const standards=asset.operatingModel||null;if(standards){const discipline=clamp(standards.maintenanceDiscipline??.5);maintained*=.65+.35*discipline;const proxy={operatingModel:standards};const externality=applyEnterpriseExternalities(region,proxy,{scale:Math.max(.1,asset.effectiveCapacity||asset.baseCapacity||1),publicEnterprise:!!asset.ownerStateEnterpriseId});asset.externalityProfile=externality;}asset.condition=clamp((asset.condition??1)+years*(maintained*.02-(1-maintained)*.12));asset.effectiveCapacity=asset.baseCapacity*operating*infrastructureCapacity(asset);asset.lastOperatingRatio=operating;asset.lastMaintenanceRatio=maintained;return asset;}"
if old not in s: raise RuntimeError('corporate infra tick anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

# corporateCapital: private firms gain apparent profitability from cost shifting and impose regional harms.
p=Path('js/economy/corporateCapital.js'); s=p.read_text()
if not s.startswith("import { applyEnterpriseExternalities"):
    s="import { applyEnterpriseExternalities, ensureEnterpriseOperatingModel, enterpriseCostExternalityProfile } from './enterpriseBehaviour.js';\n"+s
s=s.replace("    statePrivilege: form === 'chartered_venture' ? 0.55 : form === 'joint_stock_company' ? 0.22 : 0,", "    statePrivilege: form === 'chartered_venture' ? 0.55 : form === 'joint_stock_company' ? 0.22 : 0,\n    operatingModel: ensureEnterpriseOperatingModel({}, { publicEnterprise: false }),")
old="const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28;"
new="const externalityProfile=enterpriseCostExternalityProfile(firm,{publicEnterprise:false});const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28 + externalityProfile.apparentCostSaving*.22;applyEnterpriseExternalities(region,firm,{scale:Math.min(1,(firm.capitalIndex||0)/8),publicEnterprise:false});"
if old not in s: raise RuntimeError('corporate capital profit anchor missing')
s=s.replace(old,new,1)
p.write_text(s)

Path('tools/test-enterprise-finance-externalities.mjs').write_text(r'''import assert from 'node:assert/strict';
import { borrowStateEnterprise, createStateEnterprise, fundStateEnterprise, serviceStateEnterpriseDebt } from '../js/economy/economicOwnership.js';
import { enterpriseCostExternalityProfile, enterpriseDebtCapacity } from '../js/economy/enterpriseBehaviour.js';
import { buildStateEnterpriseInfrastructure, tickCorporateInfrastructureAsset } from '../js/economy/corporateInfrastructure.js';

const polity={id:'p'};
const made=createStateEnterprise(polity,{name:'Safe Grid',sectors:['power_grid'],governmentCapital:120,stateOwnership:1,profitTarget:.05,serviceObligation:.35,commercialIndependence:.8});
const e=made.enterprise;
assert.equal(e.cash,120); assert.equal(e.debt,0);
const cap=enterpriseDebtCapacity(e,{sovereignCredit:.9,revenueReliability:.95});
assert(cap.available>0);
const borrowed=borrowStateEnterprise(polity,e.id,100,{sovereignCredit:.9,revenueReliability:.95});
assert.equal(borrowed.borrowed,true); assert(e.debt>0); assert(e.cash>120);

const region={id:'r',breakthroughs:new Set(['electrical_grid']),stockpile:{steel:1000,copper:1000,wood:1000},industrialSupply:{inventory:{}},corporateInfrastructure:{assets:[],proposals:[],nextAssetId:1,nextProposalId:1}};
const build=buildStateEnterpriseInfrastructure({type:'power_grid',hostRegion:region,hostPolity:polity,enterpriseId:e.id,currentTick:1});
assert.equal(build.accepted,true); assert(e.cash>=0); assert.equal(e.investedCapital,190); assert(build.asset.operatingModel);

const conscientious={operatingModel:{wageFairness:.9,workerSafety:.9,customerService:.9,maintenanceDiscipline:.9,environmentalCare:.9,rehabilitationProvision:.9}};
const extractive={operatingModel:{wageFairness:.2,workerSafety:.2,customerService:.2,maintenanceDiscipline:.2,environmentalCare:.2,rehabilitationProvision:.2}};
const good=enterpriseCostExternalityProfile(conscientious),bad=enterpriseCostExternalityProfile(extractive);
assert(bad.apparentCostSaving>good.apparentCostSaving); assert(bad.labourHarm>good.labourHarm); assert(bad.environmentalHarm>good.environmentalHarm); assert(bad.futureLiability>good.futureLiability);

build.asset.status='operational'; build.asset.operatingModel={...extractive.operatingModel};
tickCorporateInfrastructureAsset(build.asset,region,365);
assert(region.enterpriseExternalities.environmentalHarm>0); assert(build.asset.lastMaintenanceRatio<1);

const before=e.cash; const service=serviceStateEnterpriseDebt(polity,e.id,1); assert.equal(service.serviced,true); assert(e.cash<=before);
fundStateEnterprise(polity,e.id,10); assert(e.cash>=before-service.paid+10-1e-9);
console.log('enterprise finance and externality regressions passed');
''')
print('enterprise finance/externality integration applied')
