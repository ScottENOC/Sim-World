import assert from 'node:assert/strict';
import { createStateEnterprise, ensureEconomicOwnershipPolicy, SECTOR_ACCESS, setSectorOwnershipPolicy } from '../js/economy/economicOwnership.js';
import { assessCorporateInfrastructureProposal, buildStateEnterpriseInfrastructure, proposeCorporateInfrastructure } from '../js/economy/corporateInfrastructure.js';
import { createInfrastructureAsset, investmentRisk, nationaliseAsset } from '../js/economy/infrastructureInvestment.js';

const host={id:'host'};
const investor={id:'investor'};
const hostRegion={id:'h1',name:'Host',population:100000,isCoastal:true,breakthroughs:new Set(['industrial_mining','electrical_grid']),resourceDeposits:{iron:{amount:100}},stockpile:{},industrialSupply:{inventory:{}},corporateInfrastructure:{assets:[],proposals:[],nextAssetId:1,nextProposalId:1}};
const investorRegion={id:'i1',name:'Investor',breakthroughs:new Set(['industrial_mining','electrical_grid'])};
const firm={id:'f1',status:'active',sector:'mining',capitalIndex:500};

setSectorOwnershipPolicy(host,'mining',{access:SECTOR_ACCESS.DOMESTIC_ONLY});
let assessment=assessCorporateInfrastructureProposal({type:'mine',hostRegion,hostPolity:host,investorRegion,investorPolity:investor,firm});
assert.equal(assessment.viable,false);
assert.equal(assessment.reason,'foreign_ownership_banned');

setSectorOwnershipPolicy(host,'mining',{access:SECTOR_ACCESS.OPEN,foreignAllowed:true,maxForeignOwnership:.4});
assessment=assessCorporateInfrastructureProposal({type:'mine',hostRegion,hostPolity:host,investorRegion,investorPolity:investor,firm});
assert.equal(assessment.viable,false);
assert.equal(assessment.reason,'foreign_ownership_cap');

setSectorOwnershipPolicy(host,'power_grid',{access:SECTOR_ACCESS.STATE_MONOPOLY});
const soe=createStateEnterprise(host,{name:'National Grid',sectors:['power_grid'],governmentCapital:400,stateOwnership:1,profitTarget:0,serviceObligation:.9,commercialIndependence:.3});
assert.equal(soe.created,true);
const built=buildStateEnterpriseInfrastructure({type:'power_grid',hostRegion,hostPolity:host,enterpriseId:soe.enterprise.id,currentTick:100});
assert.equal(built.accepted,true);
assert.equal(built.asset.ownerStateEnterpriseId,soe.enterprise.id);
assert.equal(built.asset.status,'construction');
assert.equal(soe.enterprise.governmentCapital,400);
assert.equal(soe.enterprise.cash,210);
assert.equal(soe.enterprise.investedCapital,190);
assert.equal(built.asset.publicServiceObligation,.9);

const domesticPrivate={id:'f2',status:'active',sector:'infrastructure',capitalIndex:500};
const blocked=proposeCorporateInfrastructure({type:'power_grid',hostRegion,hostPolity:host,investorRegion:hostRegion,investorPolity:host,firm:domesticPrivate});
assert.equal(blocked.accepted,false);
assert.equal(blocked.reason,'state_monopoly');

const stable={id:'stable'};
const unstable={id:'unstable'};
ensureEconomicOwnershipPolicy(stable).policyPredictability=.95;
ensureEconomicOwnershipPolicy(stable).contractReliability=.95;
ensureEconomicOwnershipPolicy(unstable).policyPredictability=.2;
ensureEconomicOwnershipPolicy(unstable).contractReliability=.25;
ensureEconomicOwnershipPolicy(unstable).nationalisationMemory=.7;
assert(investmentRisk({hostPolity:unstable})>investmentRisk({hostPolity:stable}));

const asset=createInfrastructureAsset({id:'asset',type:'mine',regionId:'h1',hostPolityId:host.id,ownerPolityId:investor.id,foreignOwner:true,value:100});
const before=ensureEconomicOwnershipPolicy(host).nationalisationMemory;
nationaliseAsset({asset,hostPolity:host,ownerPolity:investor,compensationShare:0});
assert(ensureEconomicOwnershipPolicy(host).nationalisationMemory>before);
assert.equal(asset.foreignOwner,false);

console.log('public-private economy integration regressions passed');
