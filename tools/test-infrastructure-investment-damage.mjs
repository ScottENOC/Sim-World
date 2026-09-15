import assert from 'node:assert/strict';
import { FOREIGN_INVESTMENT_POLICIES, setForeignInvestmentPolicy, foreignMarketAccess, evaluateForeignInvestment, chooseNpcInvestmentPolicy, createInfrastructureAsset, nationaliseAsset } from '../js/economy/infrastructureInvestment.js';
import { damageInfrastructure, scorchedEarth, infrastructureCapacity } from '../js/military/infrastructureDamage.js';

const host={id:'host'}, investor={id:'investor'};
setForeignInvestmentPolicy(host,{general:FOREIGN_INVESTMENT_POLICIES.OPEN,strategic:FOREIGN_INVESTMENT_POLICIES.PARTNERS});
assert.equal(foreignMarketAccess({hostPolity:host,investorPolity:investor,strategic:true,partner:false}),false,'strategic infrastructure should reject non-partners');
assert.equal(foreignMarketAccess({hostPolity:host,investorPolity:investor,strategic:true,partner:true}),true);
assert.equal(foreignMarketAccess({hostPolity:host,investorPolity:investor,atWar:true}),false,'enemy investment must be blocked');
const safe=evaluateForeignInvestment({hostPolity:host,investorPolity:investor,expectedAnnualProfit:20,capitalCost:100,warLossRate:0,civilDisorder:0,assetDamageRate:0});
const warTorn=evaluateForeignInvestment({hostPolity:host,investorPolity:investor,expectedAnnualProfit:20,capitalCost:100,warLossRate:1,civilDisorder:1,assetDamageRate:1});
assert.equal(safe.invest,true); assert.ok(warTorn.score<safe.score,'war and destruction should deter capital');
const npc={id:'npc'}; chooseNpcInvestmentPolicy(npc,{securityThreat:1,foreignDependence:1,industrialAmbition:.9,hostility:1}); assert.equal(npc.foreignInvestmentPolicy.strategic,FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY);
const asset=createInfrastructureAsset({id:'rail1',type:'railway',regionId:'r1',hostPolityId:'host',ownerPolityId:'investor',operatorPolityId:'investor',foreignOwner:true,value:100,condition:1});
const beforeRep=host.investmentReputation; const result=nationaliseAsset({asset,hostPolity:host,ownerPolity:investor,compensationShare:0}); assert.equal(asset.ownerPolityId,'host'); assert.ok(host.investmentReputation<beforeRep); assert.equal(result.uncompensatedClaim,100); assert.equal(investor.foreignClaims.host,100);
const bridge=createInfrastructureAsset({id:'b',type:'bridge',regionId:'r1',hostPolityId:'host'}); const damage=damageInfrastructure(bridge,{combatIntensity:1,deliberate:true,artillery:1,bombing:.5,precision:.5,rng:()=>.5}); assert.ok(damage>0&&bridge.condition<1); assert.ok(infrastructureCapacity(bridge)<1);
const rail=createInfrastructureAsset({id:'r',type:'railway',regionId:'r1',hostPolityId:'host'}); const farm=createInfrastructureAsset({id:'f',type:'farm',regionId:'r1',hostPolityId:'host'}); scorchedEarth([rail,farm],{retreatingForceCapability:1,rng:()=>.5}); assert.ok(rail.condition<1,'retreating armies can sabotage railways'); assert.equal(farm.condition,1,'scorched-earth infrastructure pass should not indiscriminately target every asset');
console.log('Foreign investment, nationalisation and infrastructure damage regressions passed.');
