import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickSocialProtection, setSocialProtectionPolicy, socialProtectionEligibility } from '../js/society/socialProtection.js?v=test';
import { tickEmploymentAndHardship } from '../js/economy/employmentAndHardship.js?v=test-social';

function region(overrides={}){
  return {
    id:'r',name:'Milltown',population:1000,stability:.62,wallet:220,treasury:180,
    demographics:{workingAge:600,children:280,elderly:120},
    occupations:{farmer:80,industrialSupport:90,services:100,trader:20,general:310},
    urbanisation:{urbanPopulation:720},structuralTransformation:{industrialShare:.32,serviceShare:.27},
    corporateCapital:{financialDepth:.76,failedFirmPressure:.45,retainedEarnings:120},
    tradeEconomy:{weeklyExports:180,weeklyImports:160,tradeDisruption:.3,creditLimit:120},
    medievalCommerce:{finance:{creditCrisis:.4}},bankingSystem:{creditContraction:.5},
    publicEducation:{mandatoryYears:7,attendanceRatio:.82,literacy:.55},educationLevel:.5,
    militaryFinance:{stateCapacity:.72},governance:{sovereignPolityId:'p',administrativeControl:.7},
    stockpile:{food:240},marketDemand:{},religion:{shares:{faith:.75}},
    housing:{version:1,residentCapacity:1020,jobCapacity:{urban:420,farm:200,logging:20,mining:40,fishing:20},pendingJobCapacity:{urban:0,farm:0,logging:0,mining:0,fishing:0},ownerShares:{households:1},builtLastTick:0},
    report:{housing:{blockedWorkers:10}},
    ...overrides,
  };
}

const church={id:'church',religionId:'faith',active:true,treasury:100,prestige:.7};
const world={authorities:[church]};
const r=region();
tickEmploymentAndHardship([r],100,28,{playerPolityId:'p',religiousWorld:world});
assert.ok(r.employment.unemploymentRate>0.05);
const baselineHardship=r.employment.hardship;
const beforeChurch=church.treasury;
setSocialProtectionPolicy(r,{poorRelief:'mixed',unemploymentReplacementRate:.4,pensionReplacementRate:.3,contributionRate:.08},{playerChoice:true});
assert.ok(socialProtectionEligibility(r).unemploymentInsurance);
const beforeTreasury=r.treasury;
const report=tickSocialProtection(r,104,28,{religiousWorld:world,isPlayer:true});
assert.ok(report.churchRelief>0,'organised religion should spend its existing treasury on followers in hardship');
assert.ok(church.treasury<beforeChurch,'church relief must reduce the authority treasury');
assert.ok(report.stateRelief>0,'mixed relief should use government funds after family/church support');
assert.ok(r.treasury<beforeTreasury,'state relief/insurance backing must cost the treasury');
assert.ok(report.contributions>0,'insurance should collect contributions from the employed economy');
assert.ok(report.unemploymentBenefits>0,'unemployed workers should receive insured benefits');
assert.ok(report.pensions>0,'elderly residents should receive pensions when enabled');
assert.ok(report.coverage>0);
assert.ok(r.employment.hardship<baselineHardship,'cash relief should cushion measured hardship without erasing unemployment');

const poorChurch={id:'church2',religionId:'faith',active:true,treasury:.01,prestige:.7};
const low=region({id:'low',wallet:40,treasury:0,employment:{employed:250,unemployed:180,formalLabourShare:.75,unemploymentRate:.42,hardship:.5,povertyPressure:.55,consumptionPressure:.5}});
setSocialProtectionPolicy(low,{poorRelief:'charity'},{playerChoice:true});
const lowReport=tickSocialProtection(low,108,7,{religiousWorld:{authorities:[poorChurch]},isPlayer:true});
assert.ok(lowReport.coverage<1,'a nearly empty church treasury must not create free full relief');
assert.ok(poorChurch.treasury>=0);

const preindustrial=region({id:'old',urbanisation:{urbanPopulation:20},corporateCapital:{financialDepth:.02,failedFirmPressure:0},publicEducation:{mandatoryYears:0,attendanceRatio:0,literacy:.01},militaryFinance:{stateCapacity:.18},structuralTransformation:{industrialShare:0,serviceShare:0}});
const eligibility=socialProtectionEligibility(preindustrial);
assert.equal(eligibility.unemploymentInsurance,false);
assert.equal(eligibility.pensions,false);

const ui=fs.readFileSync(new URL('../js/ui/socialProtectionUi.js',import.meta.url),'utf8');
const overlays=fs.readFileSync(new URL('../js/ui/socialOverlays.js',import.meta.url),'utf8');
assert.ok(ui.includes('Family and religious charity'));
assert.ok(ui.includes('Unemployment insurance'));
assert.ok(overlays.includes("label: 'Social protection coverage'"));
console.log('social protection regression passed');
