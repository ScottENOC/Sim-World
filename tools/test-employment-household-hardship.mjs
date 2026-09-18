import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tickEmploymentAndHardship, employmentSummary } from '../js/economy/employmentAndHardship.js?v=test';

function region(overrides={}){
  return {
    id:'r',name:'Industrial City',population:1000,stability:.72,wallet:650,treasury:100,
    demographics:{workingAge:600,children:300,elderly:100},
    occupations:{farmer:120,miner:40,industrialSupport:80,services:90,trader:20,general:250},
    urbanisation:{urbanPopulation:650},
    structuralTransformation:{industrialShare:.28,serviceShare:.24},
    corporateCapital:{financialDepth:.72,failedFirmPressure:0,nonPerformingShare:0},
    tradeEconomy:{weeklyExports:400,weeklyImports:350,tradeDisruption:0,creditLimit:500},
    medievalCommerce:{finance:{creditCrisis:0}},
    bankingSystem:{creditContraction:0},
    publicEducation:{mandatoryYears:8,attendanceRatio:.8},
    stockpile:{food:900},marketDemand:{},
    housing:{version:1,residentCapacity:1040,jobCapacity:{urban:400,farm:250,logging:20,mining:80,fishing:20},pendingJobCapacity:{urban:0,farm:0,logging:0,mining:0,fishing:0},ownerShares:{households:1},builtLastTick:0},
    report:{housing:{blockedWorkers:0}},governance:{sovereignPolityId:'p'},
    ...overrides,
  };
}

const healthy=region();
tickEmploymentAndHardship([healthy],52,7,{playerPolityId:'p'});
const healthySummary=employmentSummary(healthy);
assert.ok(healthySummary.labourForce>0);
assert.ok(healthySummary.unemploymentRate>=0 && healthySummary.unemploymentRate<=1);
assert.ok(healthy.householdDemandMultiplier<=1.05 && healthy.householdDemandMultiplier>=0.55);

const recession=region({
  wallet:120,
  corporateCapital:{financialDepth:.8,failedFirmPressure:.75,nonPerformingShare:.35},
  tradeEconomy:{weeklyExports:80,weeklyImports:60,tradeDisruption:.65,creditLimit:80},
  medievalCommerce:{finance:{creditCrisis:.72}},
  bankingSystem:{creditContraction:.8},
  occupations:{farmer:90,miner:15,industrialSupport:25,services:35,trader:8,general:420},
  report:{housing:{blockedWorkers:35}},
});
const events=tickEmploymentAndHardship([recession],104,28,{playerPolityId:'p'});
const recessionSummary=employmentSummary(recession);
assert.ok(recessionSummary.unemploymentRate>healthySummary.unemploymentRate);
assert.ok(recessionSummary.hardship>healthySummary.hardship);
assert.ok(recession.householdDemandMultiplier<healthy.householdDemandMultiplier);
assert.ok(events.some(e=>e.type==='unemployment_warning'));
assert.ok(recession.report.employment.causes.credit>0);

const subsistence=region({
  urbanisation:{urbanPopulation:30},corporateCapital:{financialDepth:.02,failedFirmPressure:0},
  structuralTransformation:{industrialShare:0,serviceShare:0},tradeEconomy:{weeklyExports:0,weeklyImports:0,tradeDisruption:0},
  occupations:{farmer:260,gatherer:170,general:170},wallet:180,
});
tickEmploymentAndHardship([subsistence],156,7,{playerPolityId:'p'});
assert.ok(subsistence.employment.formalLabourShare<healthy.employment.formalLabourShare,'subsistence general labour should not be treated like modern unemployment');

const labour=fs.readFileSync(new URL('../js/economy/labor.js',import.meta.url),'utf8');
const overlays=fs.readFileSync(new URL('../js/ui/socialOverlays.js',import.meta.url),'utf8');
assert.ok(labour.includes('tickEmploymentAndHardship'));
assert.ok(overlays.includes("label: 'Unemployment'"));
assert.ok(overlays.includes("label: 'Household hardship'"));
console.log('employment and household hardship regression passed');
