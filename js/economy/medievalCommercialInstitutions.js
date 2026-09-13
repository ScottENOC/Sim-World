import { corporateCreditMultiplier } from './corporateCapital.js?v=20260913-capital2';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function commerce(region) {
  return clamp(Math.log1p((region.tradeEconomy?.weeklyExports || 0) + (region.tradeEconomy?.weeklyImports || 0)) / 10);
}

function urbanShare(region) {
  const urban = Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation ?? 0);
  return clamp(urban / Math.max(1, region.population || 1));
}

function hasCurrency(region, polity) {
  return Boolean(region.currencyUse?.active || polity?.currency?.active || polity?.currency?.currentCurrencyId);
}

export function ensureMedievalCommercialState(region) {
  region.medievalCommerce ||= {};
  const s = region.medievalCommerce;
  s.finance ||= { merchantCredit: 0, depositBanking: 0, billsOfExchange: 0, stateCredit: 0, riskSharing: 0, creditCrisis: 0 };
  s.trade ||= { caravanNetwork: 0, merchantDiaspora: 0, convoying: 0, commercialLaw: 0, protectedMarkets: 0 };
  s.labour ||= { mortalityShock: 0, labourScarcity: 0, wagePressure: 0, bargainingPower: 0, estateWeakening: 0 };
  if (!Number.isFinite(s.previousPopulation)) s.previousPopulation = Math.max(1, region.population || 1);
  return s;
}

export function medievalTradeFrictionMultiplier(region) {
  const s = ensureMedievalCommercialState(region);
  const reduction = s.trade.caravanNetwork * 0.08 + s.trade.merchantDiaspora * 0.06 + s.trade.commercialLaw * 0.08 + s.finance.billsOfExchange * 0.09 + s.finance.riskSharing * 0.05;
  return Math.max(0.68, 1 - reduction);
}

export function medievalCreditMultiplier(region) {
  const s = ensureMedievalCommercialState(region);
  return (1 + s.finance.merchantCredit * 0.45 + s.finance.depositBanking * 0.3 + s.finance.stateCredit * 0.25 - s.finance.creditCrisis * 0.35) * corporateCreditMultiplier(region);
}

function updateLabourAfterDisease(region, years) {
  const s = ensureMedievalCommercialState(region);
  const previous = Math.max(1, s.previousPopulation || region.population || 1);
  const current = Math.max(1, region.population || 1);
  const decline = clamp((previous - current) / previous, 0, 0.5);
  const diseaseDeaths = Object.values(region.disease?.pathogens || {}).reduce((sum, p) => sum + Math.max(0, Number(p.lastDeaths) || 0), 0);
  const deathShare = clamp(diseaseDeaths / previous, 0, 0.2);
  const shock = clamp(Math.max(decline, deathShare * 1.5));
  s.labour.mortalityShock += (shock - s.labour.mortalityShock) * clamp(years * 1.8);
  const scarcityTarget = clamp(s.labour.mortalityShock * 1.4 + (1 - clamp((region.demographics?.workingAge || current * 0.55) / Math.max(1, current * 0.58))) * 0.25);
  s.labour.labourScarcity += (scarcityTarget - s.labour.labourScarcity) * clamp(years * 0.8);
  s.labour.wagePressure += (clamp(s.labour.labourScarcity * 0.85) - s.labour.wagePressure) * clamp(years * 0.65);
  s.labour.bargainingPower += (clamp(s.labour.labourScarcity * 0.65 + (region.medievalSociety?.urban?.guilds || 0) * 0.22) - s.labour.bargainingPower) * clamp(years * 0.45);
  s.labour.estateWeakening += (clamp(s.labour.labourScarcity * 0.5 + s.labour.bargainingPower * 0.25) - s.labour.estateWeakening) * clamp(years * 0.35);
  if (region.medievalSociety?.estates) {
    region.medievalSociety.estates.hereditaryPower *= 1 - s.labour.estateWeakening * years * 0.03;
    region.medievalSociety.estates.taxExemption *= 1 - s.labour.estateWeakening * years * 0.02;
  }
  if (region.occupations?.general != null) region.occupations.general = Math.max(0, region.occupations.general * (1 - s.labour.wagePressure * years * 0.005));
  s.previousPopulation = current;
}

function updateFinance(region, polity, years) {
  const s = ensureMedievalCommercialState(region); const admin = polity?.administration || {};
  const c = commerce(region); const urban = urbanShare(region); const money = hasCurrency(region, polity) ? 1 : 0;
  const accounting = clamp(admin.accounting || 0); const records = clamp(admin.recordKeeping || 0);
  // Merchant finance and bureaucratic/state credit are alternative routes; neither requires the other.
  const merchantCreditTarget = clamp(c * 0.42 + urban * 0.2 + accounting * 0.22 + money * 0.16);
  const depositTarget = clamp(merchantCreditTarget * 0.6 + c * 0.2 + accounting * 0.2);
  const billsTarget = clamp(depositTarget * 0.45 + (region.medievalCommerce?.trade?.merchantDiaspora || 0) * 0.28 + records * 0.17 + money * 0.1);
  const stateCreditTarget = clamp(accounting * 0.38 + records * 0.24 + (admin.officialdom || 0) * 0.25 + (polity?.currency?.active ? 0.13 : 0));
  const riskTarget = clamp(c * 0.3 + depositTarget * 0.25 + (region.isCoastal ? 0.15 : 0.05) + (region.medievalCommerce?.trade?.commercialLaw || 0) * 0.3);
  for (const [key,target] of Object.entries({ merchantCredit: merchantCreditTarget, depositBanking: depositTarget, billsOfExchange: billsTarget, stateCredit: stateCreditTarget, riskSharing: riskTarget })) {
    s.finance[key] += (target - s.finance[key]) * clamp(years * 0.12);
  }
  const leverage = s.finance.merchantCredit * 0.35 + s.finance.depositBanking * 0.35 + s.finance.stateCredit * 0.3;
  const arrears = clamp((region.tradeEconomy?.arrearsWeeks || 0) / 12);
  const crisisTarget = clamp(arrears * leverage * 0.8 + Math.max(0, (region.tradeEconomy?.debt || 0) - (region.tradeEconomy?.creditLimit || 0)) / Math.max(1, region.tradeEconomy?.creditLimit || 1) * 0.2);
  s.finance.creditCrisis += (crisisTarget - s.finance.creditCrisis) * clamp(years * 0.8);
  if (region.tradeEconomy) region.tradeEconomy.creditLimit = Math.max(region.tradeEconomy.creditLimit || 0, (region.tradeEconomy.exportIncomeEma || 0) * 2 * medievalCreditMultiplier(region));
}

function updateTradeInstitutions(region, polity, years) {
  const s = ensureMedievalCommercialState(region); const c = commerce(region); const admin = polity?.administration || {};
  const habits = Object.keys(region.tradeEconomy?.routeHabits || {}).length;
  const partnerSignal = clamp(habits / 10);
  const caravanTarget = region.isCoastal ? clamp(c * 0.25 + partnerSignal * 0.25 + (region.medievalSociety?.urban?.guilds || 0) * 0.15) : clamp(c * 0.34 + partnerSignal * 0.35 + (admin.communications || 0) * 0.2 + 0.08);
  const diasporaTarget = clamp(c * 0.38 + partnerSignal * 0.36 + (region.medievalSociety?.urban?.guilds || 0) * 0.18 + urbanShare(region) * 0.08);
  const convoyTarget = region.isCoastal ? clamp(c * 0.35 + (region.navy?.boats || 0) / 30 * 0.2 + (region.fleetPatrolCoverage || 0) * 0.25 + (region.medievalSociety?.urban?.council || 0) * 0.15) : 0;
  const lawTarget = clamp((admin.recordKeeping || 0) * 0.28 + (admin.accounting || 0) * 0.28 + (region.medievalSociety?.urban?.council || 0) * 0.22 + c * 0.22);
  const marketTarget = clamp(lawTarget * 0.35 + (region.stability || 0.6) * 0.25 + c * 0.25 + (admin.officialdom || 0) * 0.15);
  for (const [key,target] of Object.entries({ caravanNetwork: caravanTarget, merchantDiaspora: diasporaTarget, convoying: convoyTarget, commercialLaw: lawTarget, protectedMarkets: marketTarget })) {
    s.trade[key] += (target - s.trade[key]) * clamp(years * 0.13);
  }
  region.tradeInstitutionReliability = clamp(0.72 + s.trade.protectedMarkets * 0.12 + s.trade.convoying * 0.08 + s.finance.riskSharing * 0.08);
}

export function tickMedievalCommercialInstitutions(regions, polities, elapsedDays = 30) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const pMap = new Map(polities.map(p => [p.id,p]));
  for (const region of regions) {
    const polity = pMap.get(region.governance?.sovereignPolityId || region.polityId);
    updateTradeInstitutions(region, polity, years);
    updateFinance(region, polity, years);
    updateLabourAfterDisease(region, years);
  }
  return [];
}
