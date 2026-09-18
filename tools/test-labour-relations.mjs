import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ensureLabourRelations, setLabourPolicy, tickLabourRelations } from '../js/society/labourRelations.js?v=test';

function region(overrides={}){
  return {
    id:'r',name:'Factory City',population:2000,stability:.7,wallet:900,treasury:250,
    governance:{sovereignPolityId:'p'},
    employment:{formalLabourShare:.82,unemploymentRate:.09,hardship:.30,causes:{foodPrices:.4,firmFailures:.3,tradeDisruption:.2}},
    publicEducation:{literacy:.72,technicalHumanCapital:.45},
    urbanisation:{urbanPopulation:1500},
    structuralTransformation:{industrialShare:.55,serviceShare:.16},
    corporateCapital:{financialDepth:.62},
    tradeEconomy:{weeklyImports:600,weeklyExports:420},
    economicRegulation:{labourStandards:.22,workerSafety:.2},
    enterpriseExternalities:{labourHarm:.52},
    socialProtection:{coverage:.1},socialProtectionReport:{coverage:.1},
    warEconomy:{activeCampaigns:0,defendingCampaigns:0,warExhaustion:0,munitionsOutputValue:0},
    conflictPressure:0,
    report:{},
    ...overrides,
  };
}

// There is no country-specific dice roll: same conditions + same policies => same labour state.
const a=region({id:'a'}),b=region({id:'b'});
for(let week=1;week<=20;week++){tickLabourRelations(a,week,7,{isPlayer:true});tickLabourRelations(b,week,7,{isPlayer:true});}
assert.equal(a.labourRelations.grievance,b.labourRelations.grievance);
assert.equal(a.labourRelations.strikePressure,b.labourRelations.strikePressure);
assert.equal(a.labourRelations.unionDensity,b.labourRelations.unionDensity);

// Negotiation/minimum standards should reduce the structural pressure compared with repression.
const negotiated=region({id:'neg'}),repressed=region({id:'rep'});
setLabourPolicy(negotiated,{minimumWageRatio:.45,collectiveBargaining:'recognised',strikeLaw:'legal',policeResponse:'negotiate'},{playerChoice:true});
setLabourPolicy(repressed,{minimumWageRatio:0,collectiveBargaining:'banned',strikeLaw:'banned',policeResponse:'force'},{playerChoice:true});
for(let week=1;week<=40;week++){tickLabourRelations(negotiated,week,7,{isPlayer:true});tickLabourRelations(repressed,week,7,{isPlayer:true});}
assert.ok(negotiated.labourRelations.bargainingTrust>repressed.labourRelations.bargainingTrust);
assert.ok(negotiated.labourRelations.grievance<repressed.labourRelations.grievance);

// Force is tempting in a live strike: it cuts immediate participation but leaves repression memory.
const peaceful=region({id:'peace'}),forced=region({id:'force'});
for(const r of [peaceful,forced]){const s=ensureLabourRelations(r);s.unionDensity=.62;s.grievance=.62;s.strikePressure=.62;s.activeStrike=true;}
setLabourPolicy(peaceful,{policeResponse:'negotiate',strikeLaw:'legal'},{playerChoice:true});
setLabourPolicy(forced,{policeResponse:'force',strikeLaw:'banned'},{playerChoice:true});
tickLabourRelations(peaceful,50,7,{isPlayer:true});tickLabourRelations(forced,50,7,{isPlayer:true});
assert.ok(forced.labourRelations.strikeIntensity<peaceful.labourRelations.strikeIntensity,'police force should restore more output immediately');
assert.ok(forced.labourRelations.repressionMemory>peaceful.labourRelations.repressionMemory,'coercion must create a long-term cost');

// Workers in essential war production strongly restrain strike action while their territory is invaded.
const peacetime=region({id:'peace-war'}),invaded=region({id:'invaded',warEconomy:{activeCampaigns:1,defendingCampaigns:1,warExhaustion:.08,munitionsOutputValue:500},conflictPressure:.65});
for(const r of [peacetime,invaded]){const s=ensureLabourRelations(r);s.unionDensity=.55;s.grievance=.48;s.strikePressure=.5;s.activeStrike=true;}
tickLabourRelations(peacetime,70,7,{isPlayer:true});tickLabourRelations(invaded,70,7,{isPlayer:true});
assert.ok(invaded.labourRelations.patrioticRestraint>peacetime.labourRelations.patrioticRestraint);
assert.ok(invaded.labourRelations.strikeIntensity<peacetime.labourRelations.strikeIntensity);

// But prolonged desperate conditions can overwhelm wartime restraint rather than hard-disabling strikes.
const desperate=region({id:'desperate',employment:{formalLabourShare:.85,unemploymentRate:.18,hardship:.82,causes:{foodPrices:.85,firmFailures:.45,tradeDisruption:.65}},warEconomy:{activeCampaigns:1,defendingCampaigns:1,warExhaustion:.82,munitionsOutputValue:800},conflictPressure:.8,economicRegulation:{labourStandards:.05,workerSafety:.05},enterpriseExternalities:{labourHarm:.8},socialProtection:{coverage:0}});
const ds=ensureLabourRelations(desperate);ds.unionDensity=.7;ds.grievance=.8;ds.strikePressure=.72;ds.activeStrike=true;
tickLabourRelations(desperate,90,7,{isPlayer:true});
assert.ok(desperate.labourRelations.strikeIntensity>0,'desperate wartime workers must still be able to strike');

// Wage floors and protectionism are trade-offs, not magic grievance-removal buttons.
const policy=region({id:'policy'});
setLabourPolicy(policy,{minimumWageRatio:1.2,importProtection:.5},{playerChoice:true});
tickLabourRelations(policy,1,7,{isPlayer:true});
assert.ok(policy.labourRelations.hiringPenalty>0,'an unaffordable wage floor should create hiring drag');
assert.ok(policy.labourRelations.protectionJobs>0,'protection can shelter import-competing employment');
assert.ok(policy.labourRelations.protectionCost>0,'protection should also raise cost pressure');

const ui=fs.readFileSync(new URL('../js/ui/labourRelationsUi.js',import.meta.url),'utf8');
const employment=fs.readFileSync(new URL('../js/economy/employmentAndHardship.js',import.meta.url),'utf8');
const industry=fs.readFileSync(new URL('../js/economy/industrialSupply.js',import.meta.url),'utf8');
const war=fs.readFileSync(new URL('../js/economy/industrialWarEconomy.js',import.meta.url),'utf8');
assert.ok(ui.includes('Minimum wage floor')&&ui.includes('Police response')&&ui.includes('Import protection'));
assert.ok(employment.includes('tickLabourRelations'));
assert.ok(industry.includes('labourRelations?.outputMultiplier'));
assert.ok(war.includes('labourRelations?.munitionsMultiplier'));
console.log('labour relations regression passed');
