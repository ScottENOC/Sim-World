import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ensureBankingSystem,
  bankingStressAssessment,
  bankingPanicChoices,
  resolveBankingPanic,
  tickBankingPanics,
} from '../js/economy/bankingPanic.js?v=test';

function fixture(id='p1'){
  const polity={id,name:'Test State',capitalRegionId:'r1',currency:{active:true,id:'c1',trust:.62},administration:{accounting:.85,recordKeeping:.85,officialdom:.8},monetaryInstitution:{regime:'convertible_notes',policyRate:.045,inflation:.035,moneyGrowth:0,reserveCoverage:.7,goldReserves:20,silverReserves:40,noteIssue:600,centralBankIndependence:.7,currencyCredibility:.7,lastPolicyRate:.045}};
  const capital={id:'r1',name:'Capital',governance:{sovereignPolityId:id},wallet:1000,treasury:300,medievalCommerce:{finance:{merchantCredit:.85,depositBanking:.9,billsOfExchange:.82,stateCredit:.8,riskSharing:.7,creditCrisis:.1}},corporateCapital:{financialDepth:.85,creditorTrust:.72,nonPerformingShare:.06,failedFirmPressure:.03},tradeEconomy:{arrearsWeeks:1,debt:100,creditLimit:500,weeklyExports:500,tradeDisruption:0},militaryFinance:{publicDebt:200,revenueEma:30},currencyUse:{active:true,id:'c1'}};
  return {polity,capital};
}

{
  const {polity,capital}=fixture();
  const b=ensureBankingSystem(polity,capital);
  assert.equal(b.stage,'stable');
  const calm=bankingStressAssessment(polity,capital);
  assert.ok(calm.runPressure<0.68,'healthy banks should not start in panic');
  const choices=bankingPanicChoices(polity,capital).map(x=>x.id);
  assert.ok(choices.includes('liquidity_support'));
  assert.ok(choices.includes('deposit_guarantee'));
  assert.ok(choices.includes('defend_convertibility'));
  assert.ok(choices.includes('orderly_resolution'));
  assert.ok(choices.includes('no_intervention'));
}

{
  const {polity,capital}=fixture();
  capital.tradeEconomy.arrearsWeeks=15;
  capital.corporateCapital.nonPerformingShare=.55;
  capital.corporateCapital.failedFirmPressure=.45;
  capital.medievalCommerce.finance.creditCrisis=.72;
  polity.monetaryInstitution.reserveCoverage=.18;
  polity.sovereignBondMarket={price:.62,yieldSpread:.18};
  const stressed=bankingStressAssessment(polity,capital);
  assert.ok(stressed.runPressure>=.68,'observable balance-sheet stress should cross the run threshold');
  assert.ok(stressed.triggers.length>=3,'panic should explain multiple concrete causes');
  const beforeNotes=polity.monetaryInstitution.noteIssue;
  const result=resolveBankingPanic(polity,capital,'liquidity_support',52);
  assert.equal(result.resolved,true);
  assert.ok(polity.monetaryInstitution.noteIssue>beforeNotes,'lender-of-last-resort support should expand liquidity rather than be free');
  assert.ok(polity.bankingSystem.runPressure<stressed.runPressure,'liquidity support should reduce run pressure');
}

{
  const {polity,capital}=fixture();
  capital.tradeEconomy.arrearsWeeks=15;
  capital.corporateCapital.nonPerformingShare=.5;
  capital.medievalCommerce.finance.creditCrisis=.7;
  polity.monetaryInstitution.reserveCoverage=.2;
  globalThis.__worldsim={activePlayerPolityId:polity.id};
  const events=tickBankingPanics([polity],[capital],52);
  const panic=events.find(e=>e.type==='banking_panic_decision');
  assert.ok(panic,'player should receive an unresolved panic decision instead of automatic punishment');
  assert.ok(panic.choices.length>=4);
  assert.equal(typeof panic.resolveDecision,'function');
  const selected=panic.resolveDecision('deposit_guarantee');
  assert.equal(selected.resolved,true);
  assert.equal(polity.bankingSystem.pendingDecision,null);
}

{
  const {polity,capital}=fixture('npc');
  polity.id='npc';capital.governance.sovereignPolityId='npc';
  capital.tradeEconomy.arrearsWeeks=15;
  capital.corporateCapital.nonPerformingShare=.52;
  capital.medievalCommerce.finance.creditCrisis=.74;
  polity.monetaryInstitution.reserveCoverage=.2;
  globalThis.__worldsim={activePlayerPolityId:'someone_else'};
  const events=tickBankingPanics([polity],[capital],52);
  assert.ok(events.some(e=>e.type==='banking_panic_resolved'),'NPCs should actively choose a response in the same system');
  assert.equal(polity.bankingSystem.pendingDecision,null);
  assert.ok(polity.bankingSystem.lastIntervention?.choice);
}

{
  const {polity,capital}=fixture();
  ensureBankingSystem(polity,capital);
  const beforeDebt=capital.militaryFinance.publicDebt;
  const beforeTrust=capital.corporateCapital.creditorTrust;
  const noHelp=resolveBankingPanic(polity,capital,'no_intervention',60);
  assert.equal(noHelp.resolved,true);
  assert.equal(capital.militaryFinance.publicDebt,beforeDebt,'doing nothing should avoid an immediate public bailout bill');
  assert.ok(capital.corporateCapital.creditorTrust<=beforeTrust,'doing nothing should not magically restore financial confidence');
}

const bonds=fs.readFileSync(new URL('../js/economy/sovereignBonds.js',import.meta.url),'utf8');
assert.ok(bonds.includes('tickBankingPanics'));
const ui=fs.readFileSync(new URL('../js/ui/religiousPoliticsEventUi.js',import.meta.url),'utf8');
assert.ok(ui.includes('banking_panic_decision'));
assert.ok(ui.includes('Every option has a cost'));

console.log('banking panic regression passed');
