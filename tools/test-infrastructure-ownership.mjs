import assert from 'node:assert/strict';
import { createInfrastructureAsset, ensureInvestmentPolicy, setForeignInvestmentPolicy, FOREIGN_INVESTMENT_POLICIES } from '../js/economy/infrastructureInvestment.js';
import { nationaliseCorporateInfrastructure, tickInfrastructureOwnership } from '../js/economy/infrastructureOwnership.js';
import { maybeInvestInCorporateInfrastructure } from '../js/economy/corporateInfrastructureAi.js';

const DAYS_PER_YEAR = 365.2425;

const expiryHost = { id:'host-r', polityId:'host', treasury:500, industrialSupply:{ capability:{} } };
const expiryAsset = createInfrastructureAsset({ id:'asset-expiry', type:'steelworks', regionId:'host-r', hostPolityId:'host', ownerPolityId:'foreign', operatorPolityId:'foreign', foreignOwner:true, strategic:true, value:200, condition:1, concessionYears:1 });
expiryAsset.status = 'operational';
expiryAsset.effectiveCapacity = 1;
tickInfrastructureOwnership(expiryAsset, expiryHost, DAYS_PER_YEAR);
assert.equal(expiryAsset.foreignOwner, false, 'expired concession should transfer ownership to host');
assert.equal(expiryAsset.ownerPolityId, 'host');
assert.equal(expiryAsset.operatorPolityId, 'host');
assert.equal(expiryAsset.concessionYearsRemaining, 0);
assert.equal(expiryAsset.concessionExpired, true);
assert.ok(expiryAsset.managementCapability >= .79 && expiryAsset.managementCapability <= .81, 'planned concession handover should preserve most capacity without granting full expertise');
assert.ok(expiryAsset.effectiveCapacity <= .81, 'management capability should constrain effective capacity after handover');

const hostPolity = { id:'host' };
const ownerPolity = { id:'foreign' };
ensureInvestmentPolicy(hostPolity);
const ownerFirm = { id:'foreign-firm', status:'active', capitalIndex:20, infrastructureAssets:['asset-nationalise'] };
const ownerRegion = { id:'foreign-r', polityId:'foreign', corporateCapital:{ firms:[ownerFirm] } };
const hostRegion = { id:'host-r2', polityId:'host', treasury:500, industrialSupply:{ capability:{} } };
const nationalisedAsset = createInfrastructureAsset({ id:'asset-nationalise', type:'steelworks', regionId:'host-r2', hostPolityId:'host', ownerPolityId:'foreign', operatorPolityId:'foreign', foreignOwner:true, strategic:true, value:200, condition:1, concessionYears:30 });
nationalisedAsset.status='operational';
nationalisedAsset.ownerFirmId='foreign-firm';
const capitalBefore=ownerFirm.capitalIndex;
const reputationBefore=hostPolity.investmentReputation;
const expropriated=nationaliseCorporateInfrastructure({asset:nationalisedAsset,hostRegion,hostPolity,ownerPolity,payerRegion:hostRegion,regions:[hostRegion,ownerRegion],compensationShare:0,currentTick:52});
assert.equal(expropriated.nationalised,true);
assert.equal(nationalisedAsset.ownerPolityId,'host');
assert.equal(nationalisedAsset.foreignOwner,false);
assert.ok(nationalisedAsset.managementCapability >= .54 && nationalisedAsset.managementCapability <= .56, 'abrupt nationalisation without local expertise should cause management disruption');
assert.ok(hostPolity.investmentReputation < reputationBefore);
assert.ok(hostPolity.expropriationMemory > 0);
assert.equal(ownerPolity.foreignClaims.host,200);
assert.ok(ownerPolity.diplomaticGrievances.host>0);
assert.ok(ownerFirm.capitalIndex < capitalBefore);
assert.ok(!ownerFirm.infrastructureAssets.includes('asset-nationalise'));

const purchaseHostPolity={id:'purchase-host'}; ensureInvestmentPolicy(purchaseHostPolity);
const purchaseOwner={id:'purchase-owner'};
const purchaseRegion={id:'purchase-r',polityId:'purchase-host',treasury:250,breakthroughs:{steelmaking:true},industrialSupply:{capability:{steelmaking:1}}};
const purchaseAsset=createInfrastructureAsset({id:'purchase-asset',type:'steelworks',regionId:'purchase-r',hostPolityId:'purchase-host',ownerPolityId:'purchase-owner',operatorPolityId:'purchase-owner',foreignOwner:true,value:200,concessionYears:20}); purchaseAsset.status='operational';
const purchase=nationaliseCorporateInfrastructure({asset:purchaseAsset,hostRegion:purchaseRegion,hostPolity:purchaseHostPolity,ownerPolity:purchaseOwner,payerRegion:purchaseRegion,regions:[purchaseRegion],compensationShare:1,currentTick:52});
assert.equal(purchase.nationalised,true);assert.equal(purchaseRegion.treasury,50);assert.equal(purchase.uncompensatedClaim,0);assert.equal(purchaseAsset.managementCapability,1,'domestic technical capability should prevent management loss');

const poorHost={id:'poor-host'}; ensureInvestmentPolicy(poorHost);
const poorRegion={id:'poor-r',polityId:'poor-host',treasury:10,industrialSupply:{capability:{}}};
const poorAsset=createInfrastructureAsset({id:'poor-asset',type:'factory',regionId:'poor-r',hostPolityId:'poor-host',ownerPolityId:'foreign',operatorPolityId:'foreign',foreignOwner:true,value:100,concessionYears:20}); poorAsset.status='operational';
const failedPurchase=nationaliseCorporateInfrastructure({asset:poorAsset,hostRegion:poorRegion,hostPolity:poorHost,ownerPolity,compensationShare:1,payerRegion:poorRegion,regions:[poorRegion]});
assert.equal(failedPurchase.nationalised,false);assert.equal(failedPurchase.reason,'insufficient_treasury');assert.equal(poorAsset.ownerPolityId,'foreign');assert.equal(poorRegion.treasury,10);

const recovering={id:'recovering',investmentReputation:.5,expropriationMemory:.4};
maybeInvestInCorporateInfrastructure([], [recovering], 52, ()=>1);
assert.ok(recovering.investmentReputation>.5,'investor reputation should recover slowly in annual review');
assert.ok(recovering.expropriationMemory<.4,'expropriation memory should fade slowly');

const npcHost={id:'npc-host'}; const npcOwner={id:'npc-owner'};
setForeignInvestmentPolicy(npcHost,{general:FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY,strategic:FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY});
const npcRegion={id:'npc-r',polityId:'npc-host',treasury:200,industrialSupply:{capability:{}},corporateInfrastructure:{nextAssetId:1,nextProposalId:1,proposals:[],assets:[]}};
const npcAsset=createInfrastructureAsset({id:'npc-asset',type:'factory',regionId:'npc-r',hostPolityId:'npc-host',ownerPolityId:'npc-owner',operatorPolityId:'npc-owner',foreignOwner:true,value:100,concessionYears:15}); npcAsset.status='operational'; npcRegion.corporateInfrastructure.assets.push(npcAsset);
const npcEvents=maybeInvestInCorporateInfrastructure([npcRegion],[npcHost,npcOwner],52,()=>1,{playerPolityId:'someone-else'});
assert.ok(npcEvents.some((event)=>event.type==='corporate_infrastructure_nationalised'&&event.assetId==='npc-asset'),'NPC domestic-only governments should buy out foreign assets when they can afford compensation');
assert.equal(npcAsset.foreignOwner,false);assert.equal(npcRegion.treasury,100);

const warHost={id:'war-host',atWarWith:['war-owner']}; const warOwner={id:'war-owner'};
const warRegion={id:'war-host-r',polityId:'war-host',treasury:0,industrialSupply:{capability:{}},corporateInfrastructure:{nextAssetId:1,nextProposalId:1,proposals:[],assets:[]}};
const warAsset=createInfrastructureAsset({id:'war-asset',type:'port',regionId:'war-host-r',hostPolityId:'war-host',ownerPolityId:'war-owner',operatorPolityId:'war-owner',foreignOwner:true,strategic:true,value:180,concessionYears:25}); warAsset.status='operational'; warRegion.corporateInfrastructure.assets.push(warAsset);
const warNationalisationEvents=maybeInvestInCorporateInfrastructure([warRegion],[warHost,warOwner],52,()=>1,{playerPolityId:'someone-else'});
assert.ok(warNationalisationEvents.some((event)=>event.type==='corporate_infrastructure_nationalised'&&event.atWar),'NPC governments should seize enemy-owned infrastructure during war without needing cash compensation');
assert.equal(warAsset.foreignOwner,false);assert.equal(warOwner.foreignClaims['war-host'],180);

console.log('Infrastructure ownership, concession expiry, nationalisation, NPC decisions and reputation regressions passed.');
