import assert from 'node:assert/strict';
import { borrowStateEnterprise, createStateEnterprise, fundStateEnterprise, serviceStateEnterpriseDebt } from '../js/economy/economicOwnership.js';
import { enterpriseCostExternalityProfile, enterpriseDebtCapacity, evolveEnterpriseOperatingModel } from '../js/economy/enterpriseBehaviour.js';
import { assessPopularWellbeing } from '../js/politics/popularWellbeing.js';
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

console.log('enterprise finance and externality regressions passed');
