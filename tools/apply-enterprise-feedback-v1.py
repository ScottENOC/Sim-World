from pathlib import Path

# Extend enterprise behaviour with endogenous standards and regional consequences.
p=Path('js/economy/enterpriseBehaviour.js'); s=p.read_text()
insert=r'''

export function evolveEnterpriseOperatingModel(enterprise, {
  publicEnterprise=false,
  years=1,
  profitPressure=0,
  debtPressure=0,
  regulation=0,
  labourPower=0,
  servicePressure=0,
}={}) {
  const m=ensureEnterpriseOperatingModel(enterprise,{publicEnterprise});
  const commercial=clamp((publicEnterprise ? (enterprise.commercialIndependence ?? .5) : .8) * .55 + clamp(profitPressure)*.25 + clamp(debtPressure)*.2);
  const protect=clamp(clamp(regulation)*.55 + clamp(labourPower)*.25 + clamp(servicePressure)*.2);
  const base=publicEnterprise?.62:.5;
  const targets={
    wageFairness:clamp(base + protect*.38 - commercial*.3),
    workerSafety:clamp(base+.05 + protect*.42 - commercial*.28),
    customerService:clamp(base + clamp(servicePressure)*.42 + clamp(regulation)*.18 - commercial*.3),
    maintenanceDiscipline:clamp(base+.08 + clamp(regulation)*.28 + clamp(servicePressure)*.18 - commercial*.26),
    environmentalCare:clamp(base-.04 + clamp(regulation)*.5 - commercial*.27),
    rehabilitationProvision:clamp(base-.09 + clamp(regulation)*.52 - commercial*.3),
  };
  const speed=clamp(Math.max(0,Number(years)||0)*.45);
  for(const [key,target] of Object.entries(targets)) m[key]=clamp(m[key]+(target-m[key])*speed);
  return m;
}

export function enterpriseRegionalConsequences(region) {
  const x=region?.enterpriseExternalities || {};
  return {
    prosperityPenalty:clamp((x.labourHarm||0)*.13+(x.customerHarm||0)*.06+(x.futureLiability||0)*.025),
    safetyPenalty:clamp((x.labourHarm||0)*.07+(x.environmentalHarm||0)*.08+(x.maintenanceRisk||0)*.05),
    infrastructurePenalty:clamp((x.maintenanceRisk||0)*.16),
    publicLiability:Math.max(0,(x.futureLiability||0))*Math.max(0,Number(region?.population)||0)*.00002,
  };
}
'''
if 'export function evolveEnterpriseOperatingModel' not in s:
    s += insert
p.write_text(s)

# Private firms evolve standards according to leverage/commercial stress and weak/strong local constraints.
p=Path('js/economy/corporateCapital.js'); s=p.read_text()
s=s.replace("import { applyEnterpriseExternalities, ensureEnterpriseOperatingModel, enterpriseCostExternalityProfile } from './enterpriseBehaviour.js';", "import { applyEnterpriseExternalities, ensureEnterpriseOperatingModel, enterpriseCostExternalityProfile, evolveEnterpriseOperatingModel } from './enterpriseBehaviour.js';")
old="const externalityProfile=enterpriseCostExternalityProfile(firm,{publicEnterprise:false});const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28 + externalityProfile.apparentCostSaving*.22;applyEnterpriseExternalities(region,firm,{scale:Math.min(1,(firm.capitalIndex||0)/8),publicEnterprise:false});"
new="const leverage = firm.debtIndex / Math.max(0.01, firm.capitalIndex);const regulation=clamp(region.economicRegulation?.enterpriseStandards ?? region.economicRegulation?.labourStandards ?? s.corporateLaw*.35);const labourPower=clamp(region.medievalSociety?.urban?.guilds || 0);evolveEnterpriseOperatingModel(firm,{publicEnterprise:false,years,profitPressure:clamp(Math.max(0,.06-(firm.profitability||0))+crisis*.35),debtPressure:clamp(leverage),regulation,labourPower,servicePressure:0});const externalityProfile=enterpriseCostExternalityProfile(firm,{publicEnterprise:false});const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28 + externalityProfile.apparentCostSaving*.22;applyEnterpriseExternalities(region,firm,{scale:Math.min(1,(firm.capitalIndex||0)/8),publicEnterprise:false});"
if old not in s: raise RuntimeError('private firm externality anchor missing')
s=s.replace(old,new,1)
# remove duplicate leverage declaration later
s=s.replace("    const leverage = firm.debtIndex / Math.max(0.01, firm.capitalIndex);\n    const solvencyTarget", "    const solvencyTarget",1)
p.write_text(s)

# Wellbeing directly feels labour/customer/environment/maintenance cost shifting.
p=Path('js/politics/popularWellbeing.js'); s=p.read_text()
if not s.startswith("import { enterpriseRegionalConsequences"):
    s="import { enterpriseRegionalConsequences } from '../economy/enterpriseBehaviour.js';\n"+s
s=s.replace("  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2);", "  const enterprise = enterpriseRegionalConsequences(region);\n  return clamp(wealth * 0.28 + food * 0.32 + housing * 0.2 + employment * 0.2 - enterprise.prosperityPenalty);")
s=s.replace("  const safety = clamp(1 - violencePressure(region));", "  const enterprise = enterpriseRegionalConsequences(region);\n  const safety = clamp(1 - violencePressure(region) - enterprise.safetyPenalty);")
p.write_text(s)

# State enterprise assets also respond to mandate/commercial pressure rather than static standards.
p=Path('js/economy/corporateInfrastructure.js'); s=p.read_text()
s=s.replace("import { applyEnterpriseExternalities, ensureEnterpriseOperatingModel } from './enterpriseBehaviour.js';", "import { applyEnterpriseExternalities, ensureEnterpriseOperatingModel, evolveEnterpriseOperatingModel } from './enterpriseBehaviour.js';")
old="const standards=asset.operatingModel||null;if(standards){const discipline=clamp(standards.maintenanceDiscipline??.5);maintained*=.65+.35*discipline;"
new="const standards=asset.operatingModel||null;if(standards){evolveEnterpriseOperatingModel(asset,{publicEnterprise:!!asset.ownerStateEnterpriseId,years,profitPressure:clamp((asset.profitTarget||0)*4),debtPressure:clamp(asset.enterpriseDebtPressure||0),regulation:clamp(region.economicRegulation?.enterpriseStandards ?? .25),labourPower:clamp(region.medievalSociety?.urban?.guilds||0),servicePressure:clamp(asset.publicServiceObligation||0)});const discipline=clamp(standards.maintenanceDiscipline??.5);maintained*=.65+.35*discipline;"
if old not in s: raise RuntimeError('state asset standards anchor missing')
s=s.replace(old,new,1)
# Record debt pressure on newly built SOE asset.
s=s.replace("commercialIndependence:enterprise.commercialIndependence,createdTick:currentTick", "commercialIndependence:enterprise.commercialIndependence,enterpriseDebtPressure:clamp((enterprise.debt||0)/Math.max(1,(enterprise.investedCapital||0)+(enterprise.governmentCapital||0))),createdTick:currentTick",1)
p.write_text(s)

# Extend regression to prove dynamic cost shifting changes wellbeing and standards.
p=Path('tools/test-enterprise-finance-externalities.mjs'); s=p.read_text()
s=s.replace("import { enterpriseCostExternalityProfile, enterpriseDebtCapacity } from '../js/economy/enterpriseBehaviour.js';", "import { enterpriseCostExternalityProfile, enterpriseDebtCapacity, evolveEnterpriseOperatingModel } from '../js/economy/enterpriseBehaviour.js';\nimport { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';")
extra=r'''

const pressured={operatingModel:{wageFairness:.7,workerSafety:.7,customerService:.7,maintenanceDiscipline:.7,environmentalCare:.7,rehabilitationProvision:.7},commercialIndependence:1};
const beforeStandards={...pressured.operatingModel};
evolveEnterpriseOperatingModel(pressured,{years:2,profitPressure:1,debtPressure:1,regulation:0,labourPower:0,servicePressure:0});
assert(pressured.operatingModel.wageFairness<beforeStandards.wageFairness);
assert(pressured.operatingModel.maintenanceDiscipline<beforeStandards.maintenanceDiscipline);
const protectedFirm={operatingModel:{wageFairness:.3,workerSafety:.3,customerService:.3,maintenanceDiscipline:.3,environmentalCare:.3,rehabilitationProvision:.3}};
evolveEnterpriseOperatingModel(protectedFirm,{years:2,profitPressure:.2,debtPressure:.1,regulation:1,labourPower:1,servicePressure:.8});
assert(protectedFirm.operatingModel.workerSafety>.3);
assert(protectedFirm.operatingModel.environmentalCare>.3);

const cleanRegion={population:1000,wallet:20,foodSecurity:.8,housing:{capacity:1000},labor:{unemploymentRate:.05},stability:.7};
const harmedRegion={...cleanRegion,enterpriseExternalities:{labourHarm:.9,customerHarm:.8,maintenanceRisk:.7,environmentalHarm:.8,futureLiability:.9}};
const polity2={continuity:{legitimacy:.7}};
const cleanWellbeing=assessPopularWellbeing(cleanRegion,polity2),harmedWellbeing=assessPopularWellbeing(harmedRegion,polity2);
assert(harmedWellbeing.prosperity<cleanWellbeing.prosperity);
assert(harmedWellbeing.safety<cleanWellbeing.safety);
assert(harmedWellbeing.grievance>cleanWellbeing.grievance);
'''
s=s.replace("console.log('enterprise finance and externality regressions passed');",extra+"\nconsole.log('enterprise finance and externality regressions passed');")
p.write_text(s)
print('enterprise feedback integration applied')
