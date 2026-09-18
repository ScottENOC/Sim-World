const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export const MONETARY_REGIMES = Object.freeze({
  SILVER: 'silver_standard',
  GOLD: 'gold_standard',
  BIMETALLIC: 'bimetallic_standard',
  CONVERTIBLE: 'convertible_notes',
  FIAT: 'fiat_currency',
});

function territories(polity, regions) {
  return regions.filter((r) => r.governance?.sovereignPolityId === polity.id);
}

export function ensureMonetaryInstitution(polity) {
  polity.monetaryInstitution ||= {};
  const m = polity.monetaryInstitution;
  if (!m.regime) m.regime = MONETARY_REGIMES.SILVER;
  if (!Number.isFinite(m.policyRate)) m.policyRate = 0.045;
  if (!Number.isFinite(m.inflation)) m.inflation = 0.01;
  if (!Number.isFinite(m.moneyGrowth)) m.moneyGrowth = 0;
  if (!Number.isFinite(m.reserveCoverage)) m.reserveCoverage = 1;
  if (!Number.isFinite(m.goldReserves)) m.goldReserves = 0;
  if (!Number.isFinite(m.silverReserves)) m.silverReserves = 0;
  if (!Number.isFinite(m.noteIssue)) m.noteIssue = 0;
  if (!Number.isFinite(m.centralBankIndependence)) m.centralBankIndependence = 0;
  if (!Number.isFinite(m.currencyCredibility)) m.currencyCredibility = 0.5;
  if (!Number.isFinite(m.lastPolicyRate)) m.lastPolicyRate = m.policyRate;
  return m;
}

function specieValue(gold, silver) {
  return Math.max(0, gold) * 40 + Math.max(0, silver) * 6;
}

export function specieForRegime(m) {
  if (m.regime === MONETARY_REGIMES.GOLD) return specieValue(m.goldReserves, 0);
  if (m.regime === MONETARY_REGIMES.BIMETALLIC) return specieValue(m.goldReserves, m.silverReserves);
  if (m.regime === MONETARY_REGIMES.SILVER) return specieValue(0, m.silverReserves);
  return specieValue(m.goldReserves, m.silverReserves);
}

export function monetaryReadiness(polity, capital) {
  const admin = polity?.administration || {};
  const finance = capital?.medievalCommerce?.finance || {};
  const corp = capital?.corporateCapital || {};
  return clamp((admin.accounting || 0) * 0.24 + (admin.recordKeeping || 0) * 0.18 +
    (finance.depositBanking || 0) * 0.18 + (finance.billsOfExchange || 0) * 0.14 +
    (finance.stateCredit || 0) * 0.12 + (corp.financialDepth || 0) * 0.14);
}

export function setMonetaryRegime(polity, capital, regime) {
  const m = ensureMonetaryInstitution(polity);
  const readiness = monetaryReadiness(polity, capital);
  if (![MONETARY_REGIMES.SILVER, MONETARY_REGIMES.GOLD, MONETARY_REGIMES.BIMETALLIC, MONETARY_REGIMES.CONVERTIBLE, MONETARY_REGIMES.FIAT].includes(regime)) return { changed: false, reason: 'unknown_regime' };
  if (regime === MONETARY_REGIMES.CONVERTIBLE && readiness < 0.48) return { changed: false, reason: 'insufficient_financial_capacity' };
  if (regime === MONETARY_REGIMES.FIAT && readiness < 0.72) return { changed: false, reason: 'insufficient_financial_capacity' };
  m.regime = regime;
  return { changed: true, regime };
}

export function setCentralBankPolicy(polity, capital, { independence = null, policyRate = null } = {}) {
  const m = ensureMonetaryInstitution(polity);
  const readiness = monetaryReadiness(polity, capital);
  if (readiness < 0.5) return { changed: false, reason: 'no_central_bank_capacity' };
  if (independence != null) m.centralBankIndependence = clamp(independence);
  if (policyRate != null) {
    m.lastPolicyRate = m.policyRate;
    m.policyRate = clamp(policyRate, 0, 0.5);
  }
  return { changed: true, policyRate: m.policyRate, independence: m.centralBankIndependence };
}

export function mintSpecieCurrency(polity, capital, regions, nominalAmount, { metal = null } = {}) {
  const m = ensureMonetaryInstitution(polity);
  capital.stockpile ||= {};
  const amount = Math.max(0, Number(nominalAmount) || 0);
  if (amount <= 0) return { minted: 0, reason: 'zero_amount' };
  const regimeMetal = metal || (m.regime === MONETARY_REGIMES.GOLD ? 'gold' : 'silver');
  const metalValue = regimeMetal === 'gold' ? 40 : 6;
  const needed = amount / metalValue;
  const available = Math.max(0, capital.stockpile[regimeMetal] || 0);
  const consumed = Math.min(available, needed);
  if (consumed <= 0) return { minted: 0, reason: 'insufficient_specie' };
  capital.stockpile[regimeMetal] = available - consumed;
  const minted = consumed * metalValue;
  if (regimeMetal === 'gold') m.goldReserves += consumed;
  else m.silverReserves += consumed;
  m.noteIssue += minted;
  const currency = polity.currency;
  if (currency?.active) {
    currency.monetaryBase = Math.max(0, currency.monetaryBase || 0) + minted;
    currency.backingMetal = regimeMetal;
    currency.reserveValue = specieForRegime(m);
  }
  return { minted, consumed, metal: regimeMetal };
}

export function printMoney(polity, capital, amount) {
  const m = ensureMonetaryInstitution(polity);
  if (m.regime !== MONETARY_REGIMES.FIAT) return { created: 0, reason: 'not_fiat' };
  const created = Math.max(0, Number(amount) || 0);
  if (created <= 0) return { created: 0, reason: 'zero_amount' };
  capital.treasury = Math.max(0, capital.treasury || 0) + created;
  m.noteIssue += created;
  m.moneyGrowth += created / Math.max(1, m.noteIssue - created);
  return { created };
}

export function sovereignRiskPremium(polity, capital) {
  const m = ensureMonetaryInstitution(polity);
  const credit = clamp(capital?.medievalCommerce?.finance?.stateCredit || 0);
  const finance = capital?.militaryFinance || {};
  const annualRevenue = Math.max(1, (finance.revenueEma || 0) * 52);
  const debtBurden = Math.max(0, finance.publicDebt || 0) / annualRevenue;
  const arrears = clamp((finance.arrearsWeeks || 0) / 26);
  const credibility = clamp((polity?.currency?.trust || 0.5) * 0.55 + m.currencyCredibility * 0.45);
  return clamp(0.008 + (1 - credit) * 0.07 + Math.min(0.12, debtBurden * 0.018) + arrears * 0.08 + (1 - credibility) * 0.035 + Math.max(0, capital?.militaryFinance?.bondYieldSpread || 0), 0.005, 0.5);
}

export function commercialRiskPremium(region, firm = null) {
  const corp = region?.corporateCapital || {};
  const leverage = firm ? Math.max(0, firm.debtIndex || 0) / Math.max(0.1, firm.capitalIndex || 0) : 0.3;
  const solvency = clamp(firm?.solvency ?? 0.75);
  return clamp(0.012 + (1 - clamp(corp.creditorTrust || 0.5)) * 0.055 + leverage * 0.035 + (1 - solvency) * 0.075 + clamp(corp.nonPerformingShare || 0) * 0.08, 0.008, 0.3);
}

export function tickMonetaryModernisation(polity, capital, regions, elapsedDays = 30) {
  const m = ensureMonetaryInstitution(polity);
  const years = Math.max(0, elapsedDays) / DAYS_PER_YEAR;
  const readiness = monetaryReadiness(polity, capital);
  const specie = specieForRegime(m);
  const liabilities = Math.max(1, m.noteIssue || polity.currency?.monetaryBase || 1);
  m.reserveCoverage = clamp(specie / liabilities, 0, 2);

  const debtStress = clamp((capital.militaryFinance?.publicDebt || 0) / Math.max(1, (capital.militaryFinance?.revenueEma || 0) * 52 * 4));
  const monetaryExcess = Math.max(0, m.moneyGrowth - 0.03);
  const inflationTarget = m.regime === MONETARY_REGIMES.FIAT
    ? clamp(0.015 + monetaryExcess * 0.55 + debtStress * 0.025)
    : clamp(0.006 + Math.max(0, 0.5 - m.reserveCoverage) * 0.05 + debtStress * 0.01);
  m.inflation += (inflationTarget - m.inflation) * clamp(years * 0.7);
  m.moneyGrowth *= Math.pow(0.4, years);

  const independence = clamp(m.centralBankIndependence);
  const policyTarget = clamp(0.025 + m.inflation * 0.7 + debtStress * (0.03 - independence * 0.012), 0.005, 0.25);
  m.policyRate += (policyTarget - m.policyRate) * clamp(years * (0.35 + independence * 0.35));
  m.currencyCredibility += (clamp(0.35 + readiness * 0.35 + m.reserveCoverage * 0.18 + independence * 0.12 - m.inflation * 1.2) - m.currencyCredibility) * clamp(years * 0.4);

  const sovereignRate = clamp(m.policyRate + sovereignRiskPremium(polity, capital), 0.005, 0.6);
  const commercialBaseRate = clamp(m.policyRate + 0.012 + (1 - clamp(capital.corporateCapital?.financialDepth || 0)) * 0.025, 0.005, 0.5);

  if (polity.currency?.active) {
    polity.currency.regime = m.regime;
    polity.currency.reserveCoverage = m.reserveCoverage;
    polity.currency.inflation = m.inflation;
    polity.currency.policyRate = m.policyRate;
    polity.currency.reserveValue = specie;
  }
  for (const region of territories(polity, regions)) {
    region.monetaryConditions = {
      regime: m.regime,
      policyRate: m.policyRate,
      inflation: m.inflation,
      reserveCoverage: m.reserveCoverage,
      sovereignRate,
      commercialBaseRate,
      currencyCredibility: m.currencyCredibility,
      centralBankIndependence: m.centralBankIndependence,
    };
  }
  return { regime: m.regime, policyRate: m.policyRate, sovereignRate, commercialBaseRate, inflation: m.inflation, reserveCoverage: m.reserveCoverage };
}
