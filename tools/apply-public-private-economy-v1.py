from pathlib import Path


def replace_once(path, before, after):
    p = Path(path)
    src = p.read_text()
    if before not in src:
        raise RuntimeError(f"{path}: anchor not found: {before[:120]!r}")
    p.write_text(src.replace(before, after, 1))

# Economic ownership: infrastructure-sector mapping and enterprise lookup.
p = Path('js/economy/economicOwnership.js')
s = p.read_text()
anchor = "export const SECTOR_ACCESS = Object.freeze({\n"
insert = "export const INFRASTRUCTURE_OWNERSHIP_SECTORS = Object.freeze({\n  port: 'shipping',\n  canal: 'infrastructure',\n  mine: 'mining',\n  steelworks: 'manufacture',\n  factory: 'manufacture',\n  telegraph: 'telecommunications',\n  power_generation: 'power_generation',\n  power_grid: 'power_grid',\n  water_supply: 'water',\n});\n\nexport function ownershipSectorForInfrastructureType(type) {\n  return INFRASTRUCTURE_OWNERSHIP_SECTORS[type] || 'infrastructure';\n}\n\n"
if 'INFRASTRUCTURE_OWNERSHIP_SECTORS' not in s:
    s = s.replace(anchor, insert + anchor, 1)
anchor2 = "export function fundStateEnterprise(polity, enterpriseId, amount) {"
insert2 = "export function stateEnterpriseById(polity, enterpriseId) {\n  return ensureEconomicOwnershipPolicy(polity).stateEnterprises.find((candidate) => candidate.id === enterpriseId) || null;\n}\n\n"
if 'export function stateEnterpriseById' not in s:
    s = s.replace(anchor2, insert2 + anchor2, 1)
p.write_text(s)

# Foreign investment: policy predictability and contract reliability are real risk factors.
p = Path('js/economy/infrastructureInvestment.js')
s = p.read_text()
if not s.startswith("import { economicOwnershipIndicators"):
    s = "import { economicOwnershipIndicators, ensureEconomicOwnershipPolicy } from './economicOwnership.js';\n" + s
s = s.replace(
"export function investmentRisk({hostPolity,warLossRate=0,civilDisorder=0,assetDamageRate=0}){ensureInvestmentPolicy(hostPolity);return clamp(warLossRate*.38+civilDisorder*.28+assetDamageRate*.18+(1-hostPolity.investmentReputation)*.46+hostPolity.expropriationMemory*.32);}",
"export function investmentRisk({hostPolity,warLossRate=0,civilDisorder=0,assetDamageRate=0}){ensureInvestmentPolicy(hostPolity);const ownership=economicOwnershipIndicators(hostPolity);return clamp(warLossRate*.32+civilDisorder*.24+assetDamageRate*.16+(1-hostPolity.investmentReputation)*.3+hostPolity.expropriationMemory*.2+(1-ownership.policyPredictability)*.2+(1-ownership.contractReliability)*.24+ownership.nationalisationMemory*.28);}")
s = s.replace(
"export function nationaliseAsset({asset,hostPolity,ownerPolity,compensationShare=0}){const previousOwner=asset.ownerPolityId,compensation=clamp(compensationShare);asset.ownerPolityId=hostPolity.id;asset.operatorPolityId=hostPolity.id;asset.foreignOwner=false;asset.concessionYearsRemaining=0;ensureInvestmentPolicy(hostPolity);hostPolity.expropriationMemory=clamp(hostPolity.expropriationMemory+(1-compensation)*.45+.08);hostPolity.investmentReputation=clamp(hostPolity.investmentReputation-(1-compensation)*.38-.05);",
"export function nationaliseAsset({asset,hostPolity,ownerPolity,compensationShare=0}){const previousOwner=asset.ownerPolityId,compensation=clamp(compensationShare);asset.ownerPolityId=hostPolity.id;asset.operatorPolityId=hostPolity.id;asset.foreignOwner=false;asset.concessionYearsRemaining=0;ensureInvestmentPolicy(hostPolity);const ownership=ensureEconomicOwnershipPolicy(hostPolity);hostPolity.expropriationMemory=clamp(hostPolity.expropriationMemory+(1-compensation)*.45+.08);hostPolity.investmentReputation=clamp(hostPolity.investmentReputation-(1-compensation)*.38-.05);ownership.nationalisationMemory=clamp(ownership.nationalisationMemory+(1-compensation)*.38+.06);ownership.policyPredictability=clamp(ownership.policyPredictability-(1-compensation)*.16-.025);ownership.contractReliability=clamp(ownership.contractReliability-(1-compensation)*.2-.03);")
s = s.replace(
"export function tickInvestmentReputation(polity,elapsedYears){ensureInvestmentPolicy(polity);const y=Math.max(0,elapsedYears);polity.expropriationMemory=Math.max(0,polity.expropriationMemory-y*.012);polity.investmentReputation=clamp(polity.investmentReputation+(1-polity.investmentReputation)*Math.min(.04*y,.2));}",
"export function tickInvestmentReputation(polity,elapsedYears){ensureInvestmentPolicy(polity);const ownership=ensureEconomicOwnershipPolicy(polity),y=Math.max(0,elapsedYears);polity.expropriationMemory=Math.max(0,polity.expropriationMemory-y*.012);polity.investmentReputation=clamp(polity.investmentReputation+(1-polity.investmentReputation)*Math.min(.04*y,.2));ownership.nationalisationMemory=Math.max(0,ownership.nationalisationMemory-y*.01);ownership.policyPredictability=clamp(ownership.policyPredictability+(1-ownership.policyPredictability)*Math.min(.012*y,.08));ownership.contractReliability=clamp(ownership.contractReliability+(1-ownership.contractReliability)*Math.min(.01*y,.06));}")
p.write_text(s)

# Corporate infrastructure: hard ownership legality and state-enterprise construction.
p = Path('js/economy/corporateInfrastructure.js')
s = p.read_text()
if "from './economicOwnership.js'" not in s:
    s = s.replace("import { createInfrastructureAsset, evaluateForeignInvestment, foreignMarketAccess } from './infrastructureInvestment.js';", "import { createInfrastructureAsset, evaluateForeignInvestment, foreignMarketAccess } from './infrastructureInvestment.js';\nimport { ensureEconomicOwnershipPolicy, investmentAccess, ownershipSectorForInfrastructureType, stateEnterpriseById } from './economicOwnership.js';")
old = "export function assessCorporateInfrastructureProposal({type,hostRegion,hostPolity,investorRegion,investorPolity,firm,relation=0,atWar=false,partner=false,warLossRate=0,civilDisorder=0,assetDamageRate=0}){const def=CORPORATE_INFRASTRUCTURE_TYPES[type];if(!def||!infrastructureTypeAvailable(type,hostRegion,investorRegion))return{viable:false,reason:'missing_expertise_or_site'};const foreign=investorPolity?.id!==hostPolity?.id;if(foreign&&!foreignMarketAccess({hostPolity,investorPolity,strategic:def.strategic,relation,atWar,partner}))return{viable:false,reason:'market_closed'};"
new = "export function assessCorporateInfrastructureProposal({type,hostRegion,hostPolity,investorRegion,investorPolity,firm,relation=0,atWar=false,partner=false,warLossRate=0,civilDisorder=0,assetDamageRate=0}){const def=CORPORATE_INFRASTRUCTURE_TYPES[type];if(!def||!infrastructureTypeAvailable(type,hostRegion,investorRegion))return{viable:false,reason:'missing_expertise_or_site'};const foreign=investorPolity?.id!==hostPolity?.id,ownershipSector=ownershipSectorForInfrastructureType(type),access=investmentAccess(hostPolity,ownershipSector,{foreign,proposedStateShare:0,proposedForeignShare:foreign?1:0});if(!access.allowed)return{viable:false,reason:access.reason,access,ownershipSector};if(foreign&&!foreignMarketAccess({hostPolity,investorPolity,strategic:def.strategic,relation,atWar,partner}))return{viable:false,reason:'market_closed'};"
if old not in s: raise RuntimeError('corporateInfrastructure assess anchor not found')
s = s.replace(old,new,1)
append = r'''

export function buildStateEnterpriseInfrastructure({type,hostRegion,hostPolity,enterpriseId,currentTick=0}){
  const def=CORPORATE_INFRASTRUCTURE_TYPES[type];
  if(!def)return{accepted:false,reason:'unknown_infrastructure_type'};
  const enterprise=stateEnterpriseById(hostPolity,enterpriseId);
  if(!enterprise||enterprise.status!=='active')return{accepted:false,reason:'enterprise_not_found'};
  const sector=ownershipSectorForInfrastructureType(type);
  if(!enterprise.sectors.includes(sector)&&!enterprise.sectors.includes('infrastructure'))return{accepted:false,reason:'outside_enterprise_mandate',sector};
  if(!infrastructureTypeAvailable(type,hostRegion,hostRegion))return{accepted:false,reason:'missing_expertise_or_site'};
  const access=investmentAccess(hostPolity,sector,{foreign:false,proposedStateShare:enterprise.stateOwnership,proposedForeignShare:0});
  if(!access.allowed)return{accepted:false,reason:access.reason,access,sector};
  const capitalCost=Math.max(0,def.capitalCost||0);
  if((enterprise.governmentCapital||0)<capitalCost)return{accepted:false,reason:'insufficient_enterprise_capital',required:capitalCost,available:enterprise.governmentCapital||0};
  const state=ensureCorporateInfrastructure(hostRegion),id=`${hostRegion.id}:stateinfra:${state.nextAssetId++}`;
  enterprise.governmentCapital-=capitalCost;
  const asset={...createInfrastructureAsset({id,type,regionId:hostRegion.id,hostPolityId:hostPolity.id,ownerPolityId:hostPolity.id,operatorPolityId:hostPolity.id,foreignOwner:false,strategic:def.strategic,value:capitalCost,condition:1,concessionYears:0}),ownerStateEnterpriseId:enterprise.id,builderStateEnterpriseId:enterprise.id,stateOwnership:enterprise.stateOwnership,status:'construction',progress:0,materialsRequired:{...def.materials},materialsDelivered:{},baseCapacity:1,annualRevenue:def.annualRevenue,constructionYears:def.constructionYears,technologySourcePolityId:hostPolity.id,financedByPolityId:hostPolity.id,builtByPolityId:hostPolity.id,publicServiceObligation:enterprise.serviceObligation,profitTarget:enterprise.profitTarget,commercialIndependence:enterprise.commercialIndependence,createdTick:currentTick};
  state.assets.push(asset);
  enterprise.assets||=[];
  enterprise.assets.push(asset.id);
  enterprise.investedCapital=(enterprise.investedCapital||0)+capitalCost;
  return{accepted:true,asset,enterprise,sector,capitalCost};
}
'''
if 'export function buildStateEnterpriseInfrastructure' not in s:
    s += append
p.write_text(s)

# Add focused regression.
Path('tools/test-public-private-economy-integration.mjs').write_text(r'''import assert from 'node:assert/strict';
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
assert.equal(soe.enterprise.governmentCapital,210);
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
''')
print('public-private economy integration applied')
