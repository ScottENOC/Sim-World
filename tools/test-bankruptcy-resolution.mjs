import assert from 'node:assert/strict';
import { createFirmDistressEvent, resolveFirmDistress } from '../js/economy/bankruptcyResolution.js';
import { acquisitionReviewOptions, foreignAcquisitionReviewMode, generateForeignAcquisitionBids, resolveForeignAcquisition } from '../js/economy/foreignAcquisitionReview.js';

const hostPolity={id:'host',capitalRegionId:'host-r',administration:{officialdom:.8,recordKeeping:.82,accounting:.78,delegation:.65},foreignInvestmentPolicy:{general:'open',strategic:'screened'},investmentReputation:.9,expropriationMemory:0};
const buyerPolity={id:'buyer',capitalRegionId:'buyer-r',administration:{officialdom:.7,recordKeeping:.7,accounting:.7,delegation:.6}};
const targetFirm={id:'target',form:'joint_stock_company',sector:'mining',capitalIndex:10,debtIndex:7,equityIndex:3,solvency:.08,status:'active',operatingModel:{wageFairness:.45,workerSafety:.35,customerService:.5,maintenanceDiscipline:.38,environmentalCare:.3,rehabilitationProvision:.2}};
const buyerFirm={id:'buyer-firm',form:'joint_stock_company',sector:'mining',capitalIndex:30,debtIndex:5,equityIndex:25,solvency:.8,status:'active'};
const hostRegion={id:'host-r',polityId:'host',treasury:20,governance:{sovereignPolityId:'host'},corporateCapital:{financialDepth:.7,corporateLaw:.75,limitedLiabilityPractice:.75,firms:[targetFirm]},economicRegulation:{rehabilitationProvision:.8},enterpriseExternalities:{maintenanceRisk:.2}};
const buyerRegion={id:'buyer-r',polityId:'buyer',governance:{sovereignPolityId:'buyer'},corporateCapital:{financialDepth:.7,corporateLaw:.7,firms:[buyerFirm]}};
const regions=[hostRegion,buyerRegion],polities=[hostPolity,buyerPolity];

hostPolity.economicOwnership={policyPredictability:.8,contractReliability:.8,nationalisationMemory:0,sectors:{}};
for(const sector of ['agriculture','mining','manufacture','shipping','rail','power_generation','power_grid','water','telecommunications','finance','long_distance_trade','infrastructure']) hostPolity.economicOwnership.sectors[sector]={access:'open',foreignAllowed:true,maxForeignOwnership:1,minimumStateShare:0,licencePredictability:.75};

assert.equal(foreignAcquisitionReviewMode(hostPolity,[hostRegion]).mode,'standing_review_board');
const bids=generateForeignAcquisitionBids({targetRegion:hostRegion,targetPolity:hostPolity,targetFirm,regions,polities,rng:()=>0,currentTick:100});
assert(bids.length>0,'a well-capitalised foreign peer should sometimes bid for a distressed firm');
assert(acquisitionReviewOptions(bids[0],hostPolity,[hostRegion]).some(o=>o.id==='require_state_stake'&&o.available));

const noBuyerRegion={...buyerRegion,corporateCapital:{...buyerRegion.corporateCapital,firms:[]}};
const noBids=generateForeignAcquisitionBids({targetRegion:hostRegion,targetPolity:hostPolity,targetFirm,regions:[hostRegion,noBuyerRegion],polities,rng:()=>0,currentTick:101});
assert.equal(noBids.length,0,'distress must not conjure a buyer when no eligible foreign firm exists');

const event=createFirmDistressEvent(hostRegion,hostPolity,targetFirm,[hostRegion],102,{regions,polities,rng:()=>0});
assert(event.foreignBids.length>0,'player/NPC distress dilemma should carry plausible acquisition bids');
assert(event.options.some(o=>o.id==='bailout'));

const bid=event.foreignBids[0];
const acquisition=resolveForeignAcquisition({bid,choice:'require_state_stake',targetRegion:hostRegion,targetPolity:hostPolity,targetFirm,buyerPolity,buyerFirm,territories:[hostRegion],currentTick:103});
assert.equal(acquisition.resolved,true);
assert.equal(targetFirm.status,'active');
assert.equal(targetFirm.foreignOwner,true);
assert(targetFirm.stateStake>=.2);
assert.equal(targetFirm.ownerPolityId,'buyer');

const failFirm={id:'fail',form:'joint_stock_company',sector:'mining',capitalIndex:8,debtIndex:9,equityIndex:1,solvency:.05,status:'active',operatingModel:{wageFairness:.4,workerSafety:.3,customerService:.5,maintenanceDiscipline:.3,environmentalCare:.2,rehabilitationProvision:.1}};
hostRegion.corporateCapital.firms.push(failFirm);
const insolvency=resolveFirmDistress({region:hostRegion,polity:hostPolity,firm:failFirm,territories:[hostRegion],choice:'insolvency',currentTick:104});
assert.equal(insolvency.resolved,true);
assert.equal(failFirm.status,'defaulted');
assert((hostRegion.publicLiabilities?.enterpriseFailure||0)>0,'uncovered bankruptcy liabilities should not disappear');

console.log('bankruptcy resolution and acquisition review regressions passed');
