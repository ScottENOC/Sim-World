import { ensureMonetaryInstitution, monetaryReadiness, MONETARY_REGIMES } from './monetaryModernisation.js?v=20260918-money1';

const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,Number(v)||0));
const REVIEW_WEEKS=4;
const PANIC_THRESHOLD=0.68;
const WARNING_THRESHOLD=0.46;

function capitalFor(polity,byId){return byId.get(polity?.capitalRegionId)||null;}
function isPlayerPolity(polity){return globalThis.__worldsim?.activePlayerPolityId===polity?.id;}

export function ensureBankingSystem(polity,capital){
  polity.bankingSystem ||= {};
  const b=polity.bankingSystem;
  if(!Number.isFinite(b.confidence))b.confidence=0.78;
  if(!Number.isFinite(b.liquidity))b.liquidity=0.72;
  if(!Number.isFinite(b.solvency))b.solvency=0.8;
  if(!Number.isFinite(b.depositGuarantee))b.depositGuarantee=0;
  if(!Number.isFinite(b.emergencyLiquidity))b.emergencyLiquidity=0;
  if(!Number.isFinite(b.creditContraction))b.creditContraction=0;
  if(!Number.isFinite(b.runPressure))b.runPressure=0;
  if(!Number.isFinite(b.lastReviewTick))b.lastReviewTick=-Infinity;
  if(!Number.isFinite(b.lastWarningTick))b.lastWarningTick=-Infinity;
  if(!Number.isFinite(b.lastPanicTick))b.lastPanicTick=-Infinity;
  if(!b.stage)b.stage='stable';
  if(!b.pendingDecision)b.pendingDecision=null;
  if(capital){
    capital.bankingSystem ||= b;
    capital.bankingSystem=b;
  }
  return b;
}

function maturity(polity,capital){
  const finance=capital?.medievalCommerce?.finance||{};
  return clamp((finance.depositBanking||0)*0.48+(finance.merchantCredit||0)*0.18+(capital?.corporateCapital?.financialDepth||0)*0.2+monetaryReadiness(polity,capital)*0.14);
}

export function bankingStressAssessment(polity,capital){
  const b=ensureBankingSystem(polity,capital);
  const finance=capital?.medievalCommerce?.finance||{};
  const corp=capital?.corporateCapital||{};
  const monetary=ensureMonetaryInstitution(polity);
  const trade=capital?.tradeEconomy||{};
  const bond=polity?.sovereignBondMarket||{};
  const mat=maturity(polity,capital);
  const arrears=clamp((trade.arrearsWeeks||0)/16);
  const npl=clamp(corp.nonPerformingShare||0);
  const failed=clamp(corp.failedFirmPressure||0);
  const creditCrisis=clamp(finance.creditCrisis||0);
  const reserveShortfall=['gold_standard','silver_standard','bimetallic_standard','convertible_notes'].includes(monetary.regime)
    ? clamp((0.48-(monetary.reserveCoverage||0))/0.48) : 0;
  const bondShock=clamp((1-(bond.price??1))*1.5+(bond.yieldSpread||0)*2.2);
  const inflationShock=clamp(Math.max(0,(monetary.inflation||0)-0.08)*2.6);
  const publicDebt=capital?.militaryFinance?.publicDebt||0;
  const annualRevenue=Math.max(1,(capital?.militaryFinance?.revenueEma||0)*52);
  const sovereignStress=clamp(Math.max(0,publicDebt/annualRevenue-1.2)/4);
  const fundamental=clamp(arrears*0.15+npl*0.2+failed*0.12+creditCrisis*0.18+reserveShortfall*0.12+bondShock*0.1+inflationShock*0.06+sovereignStress*0.07);
  const safety=clamp(b.liquidity*0.28+b.solvency*0.3+b.confidence*0.2+b.depositGuarantee*0.1+clamp(b.emergencyLiquidity)*0.12);
  const runPressure=clamp(fundamental*1.22+(1-safety)*0.48);
  const triggers=[];
  if(arrears>.25)triggers.push('merchant and household arrears are rising');
  if(npl>.18)triggers.push('banks are carrying bad commercial loans');
  if(failed>.18)triggers.push('business failures are damaging bank balance sheets');
  if(reserveShortfall>.2)triggers.push('convertibility reserves are thin');
  if(bondShock>.18)triggers.push('falling sovereign bond prices are eroding bank assets');
  if(inflationShock>.1)triggers.push('inflation is weakening confidence in deposits and notes');
  if(sovereignStress>.15)triggers.push('government debt is crowding out private confidence');
  if(!triggers.length&&runPressure>=WARNING_THRESHOLD)triggers.push('depositors are becoming unusually cautious');
  return {maturity:mat,runPressure,fundamental,safety,triggers,arrears,npl,failed,creditCrisis,reserveShortfall,bondShock,inflationShock,sovereignStress};
}

function interventionAvailability(polity,capital){
  const m=ensureMonetaryInstitution(polity);
  const readiness=monetaryReadiness(polity,capital);
  const reserves=Math.max(0,m.goldReserves||0)*40+Math.max(0,m.silverReserves||0)*6;
  const treasury=Math.max(0,capital?.treasury||0);
  return {
    lenderOfLastResort:readiness>=0.52,
    defendConvertibility:['gold_standard','silver_standard','bimetallic_standard','convertible_notes'].includes(m.regime)&&reserves>0,
    depositGuarantee:readiness>=0.58,
    bankHoliday:readiness>=0.42,
    orderlyResolution:readiness>=0.48,
    reserves,treasury,readiness,
  };
}

export function bankingPanicChoices(polity,capital){
  const a=interventionAvailability(polity,capital);
  const out=[];
  if(a.lenderOfLastResort)out.push({id:'liquidity_support',label:'Provide emergency central-bank liquidity',tradeoff:'Stops solvent banks failing for lack of cash, but expands the monetary base and can weaken reserves or raise inflation.'});
  if(a.defendConvertibility)out.push({id:'defend_convertibility',label:'Defend convertibility and raise rates',tradeoff:'Uses specie reserves and expensive credit to reassure depositors; recession and business failures may worsen.'});
  if(a.depositGuarantee)out.push({id:'deposit_guarantee',label:'Guarantee deposits',tradeoff:'Can halt a confidence run, but shifts losses to the state if banks are genuinely insolvent.'});
  if(a.bankHoliday)out.push({id:'bank_holiday',label:'Declare a short bank holiday',tradeoff:'Temporarily blocks withdrawals and buys time, but disrupts trade and can damage confidence if overused.'});
  if(a.orderlyResolution)out.push({id:'orderly_resolution',label:'Resolve insolvent banks and recapitalise survivors',tradeoff:'Cleans up bad balance sheets, but creditors and shareholders take losses and credit contracts sharply.'});
  out.push({id:'no_intervention',label:'Do not intervene',tradeoff:'Avoids public cost and moral hazard, but a liquidity panic may turn into widespread bank failures.'});
  return out;
}

function applyTreasuryCost(capital,amount){
  const need=Math.max(0,amount);
  const paid=Math.min(Math.max(0,capital.treasury||0),need);
  capital.treasury=Math.max(0,(capital.treasury||0)-paid);
  const shortfall=need-paid;
  if(shortfall>0){capital.militaryFinance ||= {};capital.militaryFinance.publicDebt=Math.max(0,capital.militaryFinance.publicDebt||0)+shortfall;}
  return {paid,borrowed:shortfall};
}

export function resolveBankingPanic(polity,capital,choice,currentTick=0){
  const b=ensureBankingSystem(polity,capital);const m=ensureMonetaryInstitution(polity);
  const assessment=bankingStressAssessment(polity,capital);
  const scale=Math.max(10,Math.max(0,capital.wallet||0)*0.025+Math.max(0,m.noteIssue||0)*0.015);
  let summary='';let fiscal={paid:0,borrowed:0};
  if(choice==='liquidity_support'){
    if(!interventionAvailability(polity,capital).lenderOfLastResort)return {resolved:false,reason:'no_central_bank_capacity'};
    const support=scale*(0.55+assessment.runPressure*0.8);m.noteIssue+=support;m.moneyGrowth+=(support/Math.max(1,m.noteIssue-support))*0.45;
    b.emergencyLiquidity=clamp(b.emergencyLiquidity+0.48);b.liquidity=clamp(b.liquidity+0.3);b.confidence=clamp(b.confidence+0.18);b.runPressure*=0.48;b.creditContraction=clamp(b.creditContraction-0.18);
    summary='The central bank lends freely against sound collateral. Cash shortages ease quickly, although the larger monetary base may later put pressure on prices or reserves.';
  }else if(choice==='defend_convertibility'){
    const a=interventionAvailability(polity,capital);if(!a.defendConvertibility)return {resolved:false,reason:'no_convertibility_reserves'};
    m.policyRate=clamp(Math.max(m.policyRate||0,0.07)+(0.025+assessment.runPressure*0.035),0,0.5);
    const reserveUse=Math.min(a.reserves,scale*0.8);const goldShare=a.reserves>0?(Math.max(0,m.goldReserves||0)*40)/a.reserves:0;
    m.goldReserves=Math.max(0,(m.goldReserves||0)-reserveUse*goldShare/40);m.silverReserves=Math.max(0,(m.silverReserves||0)-reserveUse*(1-goldShare)/6);
    b.confidence=clamp(b.confidence+0.2);b.runPressure*=0.58;b.creditContraction=clamp(b.creditContraction+0.2);
    summary='The government and central bank defend convertibility with specie and higher interest rates. The run eases, but credit becomes expensive and the real economy takes the strain.';
  }else if(choice==='deposit_guarantee'){
    if(!interventionAvailability(polity,capital).depositGuarantee)return {resolved:false,reason:'insufficient_state_capacity'};
    b.depositGuarantee=clamp(Math.max(b.depositGuarantee,0.82));b.confidence=clamp(b.confidence+0.32);b.runPressure*=0.38;
    const expectedLoss=scale*assessment.fundamental*0.45;fiscal=applyTreasuryCost(capital,expectedLoss);
    summary='The state guarantees ordinary deposits. Fear of losing savings falls sharply, but the treasury now carries part of the banking system’s losses.';
  }else if(choice==='bank_holiday'){
    b.confidence=clamp(b.confidence+0.08);b.liquidity=clamp(b.liquidity+0.18);b.runPressure*=0.62;b.creditContraction=clamp(b.creditContraction+0.12);b.bankHolidayUntil=currentTick+2;
    if(capital.tradeEconomy)capital.tradeEconomy.tradeDisruption=clamp((capital.tradeEconomy.tradeDisruption||0)+0.1);
    summary='Banks close briefly while cash and accounts are reconciled. Withdrawals stop for the moment, but commerce is disrupted and confidence will depend on what happens when banks reopen.';
  }else if(choice==='orderly_resolution'){
    if(!interventionAvailability(polity,capital).orderlyResolution)return {resolved:false,reason:'insufficient_state_capacity'};
    const corp=capital.corporateCapital||{};corp.nonPerformingShare=clamp((corp.nonPerformingShare||0)*0.55);corp.creditorTrust=clamp((corp.creditorTrust??0.5)-0.08);corp.financialDepth=clamp((corp.financialDepth||0)-0.08);
    b.solvency=clamp(b.solvency+0.24);b.liquidity=clamp(b.liquidity+0.08);b.confidence=clamp(b.confidence+0.06);b.runPressure*=0.66;b.creditContraction=clamp(b.creditContraction+0.27);
    fiscal=applyTreasuryCost(capital,scale*assessment.fundamental*0.18);
    summary='Insolvent institutions are closed or restructured and viable banks are recapitalised. The financial system is healthier, but losses are recognised now and lending contracts.';
  }else{
    b.confidence=clamp(b.confidence-0.18);b.liquidity=clamp(b.liquidity-0.22);b.solvency=clamp(b.solvency-assessment.fundamental*0.16);b.runPressure=clamp(b.runPressure+0.18);b.creditContraction=clamp(b.creditContraction+0.24);
    summary='The government leaves banks and depositors to adjust without emergency support. Public finances are protected, but withdrawals and forced asset sales intensify.';
  }
  b.pendingDecision=null;b.lastPanicTick=currentTick;b.lastIntervention={choice,currentTick,summary,fiscal};
  return {resolved:true,choice,summary,fiscal,bankingSystem:b};
}

function chooseNpcResponse(polity,capital,assessment){
  const a=interventionAvailability(polity,capital);const m=ensureMonetaryInstitution(polity);
  const debt=Math.max(0,capital?.militaryFinance?.publicDebt||0);const revenue=Math.max(1,(capital?.militaryFinance?.revenueEma||0)*52);
  const fiscalRoom=clamp(1-debt/Math.max(1,revenue*4));
  if(a.lenderOfLastResort&&assessment.solvency!==0&&assessment.npl<0.38&&(m.inflation||0)<0.12)return 'liquidity_support';
  if(a.depositGuarantee&&fiscalRoom>0.35&&assessment.runPressure>0.74)return 'deposit_guarantee';
  if(a.defendConvertibility&&m.reserveCoverage>0.35&&(m.inflation||0)<0.1)return 'defend_convertibility';
  if(a.orderlyResolution&&assessment.npl>0.3)return 'orderly_resolution';
  if(a.bankHoliday&&assessment.runPressure>0.82)return 'bank_holiday';
  return a.orderlyResolution?'orderly_resolution':'no_intervention';
}

function applyOngoingEffects(polity,capital,b,assessment){
  b.runPressure+=(assessment.runPressure-b.runPressure)*0.45;
  b.confidence+=(clamp(1-assessment.runPressure*0.72)-b.confidence)*0.12;
  b.liquidity+=(clamp(0.82-assessment.arrears*0.32-assessment.bondShock*0.22+b.emergencyLiquidity*0.25)-b.liquidity)*0.15;
  b.solvency+=(clamp(0.88-assessment.npl*0.42-assessment.failed*0.24-assessment.bondShock*0.18)-b.solvency)*0.1;
  b.emergencyLiquidity*=0.82;b.depositGuarantee*=0.995;b.creditContraction*=0.9;
  const finance=capital?.medievalCommerce?.finance;if(finance)finance.creditCrisis=clamp((finance.creditCrisis||0)+b.runPressure*0.12+b.creditContraction*0.16-b.confidence*0.05);
  if(capital?.corporateCapital){capital.corporateCapital.creditorTrust=clamp((capital.corporateCapital.creditorTrust??0.5)-b.runPressure*0.025+b.confidence*0.012);capital.corporateCapital.financialDepth=clamp((capital.corporateCapital.financialDepth||0)-b.creditContraction*0.008);}
  if(capital?.tradeEconomy)capital.tradeEconomy.creditLimit=Math.max(0,(capital.tradeEconomy.creditLimit||0)*(1-b.creditContraction*0.08));
}

export function tickBankingPanics(polities,regions,currentTick=0){
  const byId=new Map(regions.map(r=>[r.id,r]));const events=[];
  for(const polity of polities){
    const capital=capitalFor(polity,byId);if(!capital)continue;
    const b=ensureBankingSystem(polity,capital);const mat=maturity(polity,capital);
    if(mat<0.34){b.stage='pre_banking';continue;}
    if(currentTick-b.lastReviewTick<REVIEW_WEEKS)continue;b.lastReviewTick=currentTick;
    const assessment=bankingStressAssessment(polity,capital);applyOngoingEffects(polity,capital,b,assessment);
    if(b.pendingDecision&&currentTick>b.pendingDecision.createdTick&&!isPlayerPolity(polity)){
      const choice=chooseNpcResponse(polity,capital,assessment);const result=resolveBankingPanic(polity,capital,choice,currentTick);
      events.push({type:'banking_panic_resolved',polityId:polity.id,regionId:capital.id,choice,result,summary:result.summary});
      continue;
    }
    if(assessment.runPressure>=PANIC_THRESHOLD&&currentTick-b.lastPanicTick>=REVIEW_WEEKS){
      b.stage='panic';b.pendingDecision={createdTick:currentTick,assessment};
      const choices=bankingPanicChoices(polity,capital);
      const event={type:'banking_panic_decision',polityId:polity.id,regionId:capital.id,title:'Bank run: depositors are demanding cash',assessment,choices,summary:`Banking panic risk ${(assessment.runPressure*100).toFixed(0)}%. ${assessment.triggers.join('; ')}.`,playerRelevant:isPlayerPolity(polity)};
      event.resolveDecision=(choice)=>resolveBankingPanic(polity,capital,choice,currentTick);
      if(event.playerRelevant)events.push(event);else{
        const choice=chooseNpcResponse(polity,capital,assessment);const result=resolveBankingPanic(polity,capital,choice,currentTick);
        events.push({type:'banking_panic_resolved',polityId:polity.id,regionId:capital.id,choice,result,summary:result.summary});
      }
    }else if(assessment.runPressure>=WARNING_THRESHOLD&&currentTick-b.lastWarningTick>=REVIEW_WEEKS*2){
      b.stage='fragile';b.lastWarningTick=currentTick;
      if(isPlayerPolity(polity))events.push({type:'banking_panic_warning',polityId:polity.id,regionId:capital.id,title:'Banks under growing pressure',assessment,summary:`Run risk ${(assessment.runPressure*100).toFixed(0)}%. ${assessment.triggers.join('; ')}. No bank run has begun yet.`});
    }else if(assessment.runPressure<0.32)b.stage='stable';
  }
  return events;
}
