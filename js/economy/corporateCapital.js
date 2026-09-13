const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const average = (values) => values.length ? values.reduce((s, v) => s + (Number(v) || 0), 0) / values.length : 0;

function stableFraction(text) {
  let hash = 2166136261;
  for (const c of String(text)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

export function ensureCorporateCapitalState(region) {
  region.corporateCapital ||= {};
  const s = region.corporateCapital;
  for (const [key, value] of Object.entries({
    financialDepth: 0,
    creditorTrust: 0.5,
    investibleWealth: 0,
    nonPerformingShare: 0,
    corporateLaw: 0,
    partnershipPractice: 0,
    charterPractice: 0,
    jointStockPractice: 0,
    limitedLiabilityPractice: 0,
    creditorConcentration: 0,
    failedFirmPressure: 0,
    nextFirmId: 1,
  })) if (!Number.isFinite(s[key])) s[key] = value;
  if (!Array.isArray(s.firms)) s.firms = [];
  return s;
}

export function ensurePolityCapitalFinance(polity) {
  polity.capitalFinance ||= {};
  const s = polity.capitalFinance;
  for (const [key, value] of Object.entries({
    publicDebt: 0,
    annualInterestRate: 0.05,
    debtServiceArrears: 0,
    creditorConfidence: 0.55,
    charterRevenue: 0,
    merchantInfluence: 0,
    defaultMemory: 0,
    lastBorrowTick: -Infinity,
  })) if (!Number.isFinite(s[key])) s[key] = value;
  if (!s.claimsByRegion || typeof s.claimsByRegion !== 'object' || Array.isArray(s.claimsByRegion)) s.claimsByRegion = {};
  return s;
}

export function corporateCreditMultiplier(region) {
  const s = ensureCorporateCapitalState(region);
  const solvent = 1 - clamp(s.nonPerformingShare * 0.7 + s.failedFirmPressure * 0.3);
  return Math.max(0.7, 1 + s.financialDepth * 0.42 + s.creditorTrust * 0.18 + s.jointStockPractice * 0.12 - (1 - solvent) * 0.42);
}

export function corporateVentureCapacityMultiplier(region) {
  const s = ensureCorporateCapitalState(region);
  const active = s.firms.filter((f) => f.status === 'active');
  const tradeFirms = active.filter((f) => f.sector === 'long_distance_trade' || f.sector === 'shipping');
  const scale = tradeFirms.reduce((sum, f) => sum + Math.sqrt(Math.max(0, f.capitalIndex || 0)), 0);
  return Math.max(0.75, Math.min(2.5, 1 + s.financialDepth * 0.35 + s.partnershipPractice * 0.2 + s.jointStockPractice * 0.35 + scale * 0.025 - s.failedFirmPressure * 0.35));
}

function financeSignals(region, polity) {
  const medieval = region.medievalCommerce || {};
  const finance = medieval.finance || {};
  const trade = medieval.trade || {};
  const urban = region.medievalSociety?.urban || {};
  const admin = polity?.administration || {};
  const throughput = Math.max(0, region.tradeEconomy?.exportIncomeEma || 0) + Math.max(0, region.tradeEconomy?.importSpendEma || 0);
  const wealthPerCapita = Math.max(0, region.wallet || 0) / Math.max(1, region.population || 1);
  return {
    merchantCredit: clamp(finance.merchantCredit),
    deposits: clamp(finance.depositBanking),
    bills: clamp(finance.billsOfExchange),
    risk: clamp(finance.riskSharing),
    crisis: clamp(finance.creditCrisis),
    commercialLaw: clamp(trade.commercialLaw),
    protectedMarkets: clamp(trade.protectedMarkets),
    guilds: clamp(urban.guilds),
    council: clamp(urban.council),
    accounting: clamp(admin.accounting),
    records: clamp(admin.recordKeeping),
    officialdom: clamp(admin.officialdom),
    stateCredit: clamp(finance.stateCredit),
    tradeIntensity: clamp(Math.log1p(throughput) / 10),
    wealthSignal: clamp(Math.log1p(wealthPerCapita * 1000) / 8),
  };
}

function updateFinancialDepth(region, polity, years) {
  const s = ensureCorporateCapitalState(region);
  const x = financeSignals(region, polity);
  const targetDepth = clamp(x.merchantCredit * 0.22 + x.deposits * 0.18 + x.bills * 0.15 + x.risk * 0.12 + x.commercialLaw * 0.13 + x.tradeIntensity * 0.12 + x.wealthSignal * 0.08);
  s.financialDepth += (targetDepth - s.financialDepth) * clamp(years * 0.18);
  const badDebt = Math.max(0, region.tradeEconomy?.debt || 0);
  const creditLimit = Math.max(0.01, region.tradeEconomy?.creditLimit || 0.01);
  const nplTarget = clamp(Math.max(0, badDebt - creditLimit * 0.75) / creditLimit * 0.45 + x.crisis * 0.65);
  s.nonPerformingShare += (nplTarget - s.nonPerformingShare) * clamp(years * 0.65);
  const trustTarget = clamp(0.35 + x.commercialLaw * 0.22 + x.protectedMarkets * 0.14 + x.records * 0.1 + x.accounting * 0.1 + (region.tradeEconomy?.routeReliabilityEma || 0) * 0.12 - s.nonPerformingShare * 0.35 - s.failedFirmPressure * 0.15);
  s.creditorTrust += (trustTarget - s.creditorTrust) * clamp(years * 0.35);
  s.investibleWealth = Math.max(0, (region.wallet || 0) * s.financialDepth * s.creditorTrust);

  s.partnershipPractice += (clamp(x.merchantCredit * 0.35 + x.risk * 0.25 + x.commercialLaw * 0.2 + x.guilds * 0.2) - s.partnershipPractice) * clamp(years * 0.16);
  s.charterPractice += (clamp(s.partnershipPractice * 0.28 + x.stateCredit * 0.2 + x.officialdom * 0.18 + x.tradeIntensity * 0.2 + x.records * 0.14) - s.charterPractice) * clamp(years * 0.11);
  s.jointStockPractice += (clamp(s.charterPractice * 0.24 + x.bills * 0.23 + x.risk * 0.18 + x.deposits * 0.15 + x.commercialLaw * 0.2) - s.jointStockPractice) * clamp(years * 0.075);
  s.limitedLiabilityPractice += (clamp(s.jointStockPractice * 0.45 + x.commercialLaw * 0.28 + x.records * 0.15 + x.council * 0.12) - s.limitedLiabilityPractice) * clamp(years * 0.055);
  s.corporateLaw = clamp(s.partnershipPractice * 0.25 + s.charterPractice * 0.25 + s.jointStockPractice * 0.3 + s.limitedLiabilityPractice * 0.2);
}

function firmForm(region, polity, state) {
  const x = financeSignals(region, polity);
  const seed = stableFraction(`${region.id}:${state.nextFirmId}:firm`);
  if (state.jointStockPractice > 0.58 && x.bills > 0.42 && x.risk > 0.4) return 'joint_stock_company';
  if (state.charterPractice > 0.4 && x.stateCredit > 0.25) return 'chartered_venture';
  return 'partnership';
}

function chooseSector(region, state) {
  const weights = [
    ['long_distance_trade', 0.28 + (region.tradeEconomy?.routeReliabilityEma || 0) * 0.3],
    ['shipping', region.isCoastal ? 0.36 : 0.03],
    ['mining', Math.min(0.3, Object.values(region.resourceDeposits || {}).length * 0.04)],
    ['manufacture', 0.16 + (region.medievalSociety?.urban?.guilds || 0) * 0.2],
    ['infrastructure', 0.08 + state.charterPractice * 0.15],
  ];
  weights.sort((a, b) => b[1] - a[1]);
  return weights[0][0];
}

function maybeFormFirm(region, polity, currentTick, years, rng) {
  const s = ensureCorporateCapitalState(region);
  if (s.firms.filter((f) => f.status === 'active').length >= 8) return null;
  const readiness = clamp(s.financialDepth * 0.34 + s.creditorTrust * 0.18 + s.partnershipPractice * 0.2 + s.charterPractice * 0.13 + s.jointStockPractice * 0.15);
  if (readiness < 0.24 || s.investibleWealth < 0.2) return null;
  const chance = clamp(years * Math.max(0, readiness - 0.18) * 0.32);
  if ((rng?.() ?? Math.random()) >= chance) return null;
  const form = firmForm(region, polity, s);
  const id = `${region.id}:firm:${s.nextFirmId++}`;
  const size = Math.max(0.25, Math.log1p(s.investibleWealth) * (0.35 + stableFraction(id) * 0.5));
  const debtShare = form === 'partnership' ? 0.18 : form === 'chartered_venture' ? 0.3 : 0.38;
  const firm = {
    id,
    form,
    sector: chooseSector(region, s),
    foundedTick: currentTick,
    ageYears: 0,
    status: 'active',
    capitalIndex: size,
    debtIndex: size * debtShare,
    equityIndex: size * (1 - debtShare),
    profitability: 0,
    solvency: 0.75,
    statePrivilege: form === 'chartered_venture' ? 0.55 : form === 'joint_stock_company' ? 0.22 : 0,
    charterPolityId: form === 'chartered_venture' ? polity?.id || null : null,
  };
  s.firms.push(firm);
  return firm;
}

function updateFirms(region, polity, currentTick, years, rng, events) {
  const s = ensureCorporateCapitalState(region);
  const economy = region.tradeEconomy || {};
  const reliability = clamp(economy.routeReliabilityEma || 0);
  const confidence = clamp(((economy.merchantConfidence || 0) + 1) / 2);
  const crisis = clamp(region.medievalCommerce?.finance?.creditCrisis || 0);
  let activeCapital = 0;
  let failed = 0;
  for (const firm of s.firms) {
    if (firm.status !== 'active') { failed += firm.status === 'defaulted' ? 1 : 0; continue; }
    firm.ageYears = Math.max(0, firm.ageYears || 0) + years;
    if (firm.form === 'partnership' && firm.ageYears >= 3 && s.charterPractice > 0.4 && (rng?.() ?? Math.random()) < clamp(years * 0.12)) {
      firm.form = 'chartered_venture';
      firm.statePrivilege = 0.55;
      firm.charterPolityId = polity?.id || null;
      firm.debtIndex = Math.max(firm.debtIndex, firm.capitalIndex * 0.28);
      events.push({ type: 'commercial_firm_reorganised', regionId: region.id, polityId: polity?.id || null, firmId: firm.id, form: firm.form, sector: firm.sector });
    } else if (firm.form === 'chartered_venture' && firm.ageYears >= 6 && s.jointStockPractice > 0.55 && (rng?.() ?? Math.random()) < clamp(years * 0.1)) {
      firm.form = 'joint_stock_company';
      firm.statePrivilege = Math.min(firm.statePrivilege || 0, 0.3);
      firm.debtIndex = Math.max(firm.debtIndex, firm.capitalIndex * 0.34);
      firm.equityIndex = Math.max(firm.equityIndex || 0, firm.capitalIndex * 0.66);
      events.push({ type: 'commercial_firm_reorganised', regionId: region.id, polityId: polity?.id || null, firmId: firm.id, form: firm.form, sector: firm.sector });
    }
    const sectorFit = firm.sector === 'shipping' ? (region.isCoastal ? 0.08 : -0.12) : firm.sector === 'long_distance_trade' ? 0.05 : 0;
    const targetProfit = -0.08 + reliability * 0.18 + confidence * 0.12 + s.corporateLaw * 0.08 + sectorFit - crisis * 0.28;
    firm.profitability += (targetProfit - (firm.profitability || 0)) * clamp(years * 0.8);
    firm.capitalIndex = Math.max(0, firm.capitalIndex * (1 + firm.profitability * years * 0.12));
    const leverage = firm.debtIndex / Math.max(0.01, firm.capitalIndex);
    const solvencyTarget = clamp(0.72 + firm.profitability * 0.8 + s.creditorTrust * 0.18 - leverage * 0.22 - crisis * 0.3);
    firm.solvency += (solvencyTarget - firm.solvency) * clamp(years * 0.7);
    if (firm.solvency < 0.14 && (rng?.() ?? Math.random()) < clamp(years * (0.5 - firm.solvency))) {
      firm.status = 'defaulted';
      firm.defaultTick = currentTick;
      s.creditorTrust = clamp(s.creditorTrust - 0.08 - Math.min(0.12, firm.debtIndex * 0.01));
      failed += 1;
      events.push({ type: 'commercial_firm_default', regionId: region.id, polityId: polity?.id || null, firmId: firm.id, form: firm.form, sector: firm.sector });
      continue;
    }
    activeCapital += firm.capitalIndex;
  }
  s.failedFirmPressure += (clamp(failed / Math.max(1, s.firms.length)) - s.failedFirmPressure) * clamp(years * 0.6);
  s.creditorConcentration = clamp(activeCapital / Math.max(1, activeCapital + s.investibleWealth) * 0.65 + s.jointStockPractice * 0.2 + s.charterPractice * 0.15);
  const formed = maybeFormFirm(region, polity, currentTick, years, rng);
  if (formed) events.push({ type: 'commercial_firm_formed', regionId: region.id, polityId: polity?.id || null, firmId: formed.id, form: formed.form, sector: formed.sector });
}

function servicePublicDebt(polity, territories, years, events) {
  const finance = ensurePolityCapitalFinance(polity);
  if (finance.publicDebt <= 0) {
    finance.debtServiceArrears = Math.max(0, finance.debtServiceArrears - years * 0.2);
    return;
  }
  const due = finance.publicDebt * finance.annualInterestRate * years;
  const capital = territories.find((r) => r.id === polity.capitalRegionId) || territories[0];
  if (!capital || due <= 0) return;
  const paid = Math.min(Math.max(0, capital.treasury || 0), due);
  capital.treasury -= paid;
  const claims = finance.claimsByRegion;
  const totalClaims = Object.values(claims).reduce((sum, v) => sum + Math.max(0, Number(v) || 0), 0);
  if (paid > 0 && totalClaims > 0) {
    for (const region of territories) {
      const claim = Math.max(0, Number(claims[region.id]) || 0);
      if (!claim) continue;
      region.wallet = (region.wallet || 0) + paid * claim / totalClaims;
    }
  }
  const shortfall = Math.max(0, due - paid);
  finance.debtServiceArrears += shortfall;
  const serviceRatio = due > 0 ? paid / due : 1;
  finance.creditorConfidence = clamp(finance.creditorConfidence + ((serviceRatio * 0.75 + 0.2) - finance.creditorConfidence) * clamp(years * 0.45));
  finance.defaultMemory = clamp(finance.defaultMemory + ((1 - serviceRatio) - finance.defaultMemory) * clamp(years * 0.35));
  if (due > 0.01 && serviceRatio < 0.35 && finance.debtServiceArrears > due * 2) {
    const writeDown = Math.min(0.35, 0.08 + (1 - serviceRatio) * 0.22);
    for (const id of Object.keys(claims)) claims[id] *= 1 - writeDown;
    finance.publicDebt *= 1 - writeDown;
    finance.debtServiceArrears *= 1 - writeDown;
    finance.creditorConfidence = clamp(finance.creditorConfidence - 0.22);
    for (const region of territories) {
      const s = ensureCorporateCapitalState(region);
      s.creditorTrust = clamp(s.creditorTrust - 0.12 * writeDown / 0.35);
    }
    events.push({ type: 'sovereign_default', polityId: polity.id, writeDown, serviceRatio });
  }
}

function maybeBorrow(polity, territories, currentTick, years, events) {
  const finance = ensurePolityCapitalFinance(polity);
  if (currentTick - finance.lastBorrowTick < 13) return;
  const capital = territories.find((r) => r.id === polity.capitalRegionId) || territories[0];
  if (!capital) return;
  const stress = average(territories.map((r) => clamp((r.militaryFinance?.arrearsWeeks || 0) / 12 + (1 - (r.militaryFinance?.stateCapacity ?? 1)) * 0.35)));
  const stateCredit = average(territories.map((r) => clamp(r.medievalCommerce?.finance?.stateCredit || 0)));
  if (stress < 0.18 || stateCredit < 0.22 || finance.creditorConfidence < 0.2) return;
  const candidates = territories.map((region) => {
    const c = ensureCorporateCapitalState(region);
    const lendable = Math.max(0, region.wallet || 0) * c.financialDepth * c.creditorTrust * 0.035;
    return { region, c, lendable };
  }).filter((x) => x.lendable > 0.01);
  const available = candidates.reduce((sum, x) => sum + x.lendable, 0);
  if (available <= 0.01) return;
  const revenue = territories.reduce((sum, r) => sum + Math.max(0, r.militaryFinance?.revenueEma || 0), 0);
  const debtCapacity = Math.max(0, revenue * 52 * (0.6 + stateCredit * 2.2) - finance.publicDebt);
  const capitalRevenue = Math.max(0, capital.militaryFinance?.revenueEma || 0);
  const currentPayroll = Math.max(0, capital.militaryFinance?.payrollDue || 0);
  const currentAdmin = Math.max(0, capital.militaryFinance?.administrationDue || 0);
  const reserveTarget = Math.max(0.05, capitalRevenue * 4 + (currentPayroll + currentAdmin) * 2 + stress * 0.25);
  const fundingGap = Math.max(0, reserveTarget - Math.max(0, capital.treasury || 0));
  const requested = Math.min(available, debtCapacity, fundingGap);
  if (requested <= 0.01) return;
  for (const item of candidates) {
    const share = item.lendable / available;
    const contribution = requested * share;
    item.region.wallet = Math.max(0, (item.region.wallet || 0) - contribution);
    finance.claimsByRegion[item.region.id] = (finance.claimsByRegion[item.region.id] || 0) + contribution;
  }
  capital.treasury = (capital.treasury || 0) + requested;
  finance.publicDebt += requested;
  finance.annualInterestRate = clamp(0.025 + (1 - finance.creditorConfidence) * 0.09 + stress * 0.05, 0.02, 0.18);
  finance.lastBorrowTick = currentTick;
  events.push({ type: 'state_borrowing', polityId: polity.id, amount: requested, interestRate: finance.annualInterestRate, capitalRegionId: capital.id });
}

function updatePolityFinance(polity, territories, currentTick, years, events) {
  const finance = ensurePolityCapitalFinance(polity);
  servicePublicDebt(polity, territories, years, events);
  maybeBorrow(polity, territories, currentTick, years, events);
  const depth = average(territories.map((r) => ensureCorporateCapitalState(r).financialDepth));
  const concentration = average(territories.map((r) => ensureCorporateCapitalState(r).creditorConcentration));
  finance.merchantInfluence = clamp(depth * 0.45 + concentration * 0.35 + Math.min(1, finance.publicDebt / Math.max(1, territories.reduce((s, r) => s + (r.militaryFinance?.revenueEma || 0) * 52, 0))) * 0.2);
  if (polity.stateAdministration?.factions?.urban) {
    const urban = polity.stateAdministration.factions.urban;
    const target = clamp((urban.satisfaction ?? 0.5) * 0.8 + finance.creditorConfidence * 0.2 - finance.defaultMemory * 0.18);
    urban.satisfaction += (target - urban.satisfaction) * clamp(years * 0.12);
  }
}

export function tickCorporateCapital(regions, polities, currentTick = 0, elapsedDays = 30, rng = Math.random, options = {}) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const polityMap = new Map(polities.map((p) => [p.id, p]));
  const territoriesByPolity = new Map();
  const events = [];
  for (const region of regions) {
    const polityId = region.governance?.sovereignPolityId || region.polityId;
    const polity = polityMap.get(polityId);
    updateFinancialDepth(region, polity, years);
    updateFirms(region, polity, currentTick, years, rng, events);
    if (polity) {
      if (!territoriesByPolity.has(polity.id)) territoriesByPolity.set(polity.id, []);
      territoriesByPolity.get(polity.id).push(region);
    }
  }
  for (const polity of polities) updatePolityFinance(polity, territoriesByPolity.get(polity.id) || [], currentTick, years, events);
  return events.filter((event) => !options.playerPolityId || event.polityId === options.playerPolityId || event.type !== 'state_borrowing');
}
