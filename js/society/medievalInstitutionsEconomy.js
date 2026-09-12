const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function ensureSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }

export function ensureMedievalSociety(region) {
  region.medievalSociety ||= {};
  const s = region.medievalSociety;
  s.institutions = ensureSet(s.institutions);
  s.urban ||= {};
  s.finance ||= {};
  s.education ||= {};
  s.trade ||= {};
  s.labour ||= {};
  for (const [obj, defaults] of [
    [s.urban, { guildPower: 0, municipalPower: 0, merchantElitePower: 0, urbanMilitia: 0 }],
    [s.finance, { creditDepth: 0, depositBanking: 0, billsOfExchange: 0, stateCreditAccess: 0, crisisRisk: 0 }],
    [s.education, { institutionalLearning: 0, clericalSchools: 0, civicSchools: 0, examinationSystem: 0, universities: 0 }],
    [s.trade, { caravanInstitutions: 0, convoying: 0, merchantDiaspora: 0, insurance: 0 }],
    [s.labour, { bargainingPower: 0.2, wagePressure: 0, postEpidemicScarcity: 0 }],
  ]) for (const [key, initial] of Object.entries(defaults)) if (!Number.isFinite(obj[key])) obj[key] = initial;
  return s;
}

function urbanisation(region) {
  const urban = Math.max(0, Number(region.urbanisation?.urbanPopulation) || 0);
  const pop = Math.max(1, Number(region.population) || 1);
  return clamp(urban / pop * 5 + Math.log1p(urban) / 35);
}

function commerce(region) {
  const imports = Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const exports = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0);
  const partners = region.recentTradePartners instanceof Map ? region.recentTradePartners.size : 0;
  return clamp(Math.log1p(imports + exports) / 9 + Math.log1p(partners) / 10);
}

function literacyProxy(region, polity) {
  return clamp(Number(region.education?.literacy) || Number(region.knowledge?.literacy) || polity?.administration?.recordKeeping || 0);
}

function epidemicShock(region) {
  const disease = region.disease || region.diseases || {};
  const recentDeaths = Math.max(0, Number(disease.recentDeaths || disease.lastYearDeaths || region.demographics?.recentDiseaseDeaths) || 0);
  const pop = Math.max(1, Number(region.population) || 1);
  const prevalence = Object.values(disease.pathogens || disease.families || {}).reduce((sum, item) => sum + Math.max(0, Number(item?.prevalence) || 0), 0);
  return clamp(recentDeaths / pop * 18 + prevalence * 0.15);
}

function updateUrbanInstitutions(region, s, years) {
  const urban = urbanisation(region);
  const trade = commerce(region);
  const adminControl = clamp(region.governance?.administrativeControl ?? 0.5);
  const autonomy = clamp(region.governance?.autonomy || 0);
  const guildTarget = clamp(urban * 0.45 + trade * 0.35 + autonomy * 0.2);
  const merchantTarget = clamp(trade * 0.56 + urban * 0.3 + (region.currencyUse?.active ? 0.14 : 0));
  const municipalTarget = clamp(urban * 0.34 + trade * 0.26 + autonomy * 0.25 + (1 - adminControl) * 0.15);
  s.urban.guildPower += (guildTarget - s.urban.guildPower) * clamp(years * 0.22);
  s.urban.merchantElitePower += (merchantTarget - s.urban.merchantElitePower) * clamp(years * 0.2);
  s.urban.municipalPower += (municipalTarget - s.urban.municipalPower) * clamp(years * 0.18);
  s.urban.urbanMilitia += (clamp(s.urban.municipalPower * 0.5 + urban * 0.28 + (region.militaryThreat?.recentRaids || 0) * 0.06) - s.urban.urbanMilitia) * clamp(years * 0.2);
  if (s.urban.guildPower > 0.42) s.institutions.add('craft_guilds');
  if (s.urban.municipalPower > 0.5) s.institutions.add('municipal_council');
  if (s.urban.merchantElitePower > 0.55) s.institutions.add('merchant_oligarchy');
}

function updateEducation(region, polity, s, years) {
  const literacy = literacyProxy(region, polity);
  const urban = urbanisation(region);
  const admin = polity?.administration || {};
  const religiousOrganisation = clamp(Number(region.religion?.institutionalisation) || Number(region.religion?.organisation) || 0);
  s.education.clericalSchools += (clamp(religiousOrganisation * 0.55 + literacy * 0.35) - s.education.clericalSchools) * clamp(years * 0.12);
  s.education.civicSchools += (clamp(urban * 0.35 + (admin.recordKeeping || 0) * 0.35 + s.urban.merchantElitePower * 0.2) - s.education.civicSchools) * clamp(years * 0.12);
  const meritPreference = clamp(Number(polity?.governancePreferences?.meritAppointment) || Number(admin.meritSelection) || 0);
  s.education.examinationSystem += (clamp((admin.officialdom || 0) * 0.42 + literacy * 0.28 + meritPreference * 0.3) - s.education.examinationSystem) * clamp(years * 0.08);
  s.education.universities += (clamp(literacy * 0.25 + urban * 0.25 + Math.max(s.education.clericalSchools, s.education.civicSchools) * 0.35 + s.urban.merchantElitePower * 0.15) - s.education.universities) * clamp(years * 0.055);
  s.education.institutionalLearning = clamp(Math.max(s.education.clericalSchools, s.education.civicSchools, s.education.examinationSystem, s.education.universities));
  if (s.education.clericalSchools > 0.4) s.institutions.add('religious_schools');
  if (s.education.examinationSystem > 0.5) s.institutions.add('competitive_examinations');
  if (s.education.universities > 0.52) s.institutions.add('higher_learning_corporation');
  if (polity?.administration) {
    polity.administration.recordKeeping = clamp((polity.administration.recordKeeping || 0) + s.education.institutionalLearning * years * 0.0015);
    polity.administration.officialdom = clamp((polity.administration.officialdom || 0) + s.education.examinationSystem * years * 0.0018);
  }
}

function updateFinance(region, polity, s, years, rng) {
  const trade = commerce(region);
  const accounting = clamp(polity?.administration?.accounting || 0);
  const trust = clamp(region.currencyUse?.trust ?? polity?.currency?.trust ?? 0.35);
  const merchant = s.urban.merchantElitePower;
  const creditTarget = clamp(trade * 0.34 + accounting * 0.3 + trust * 0.18 + merchant * 0.18);
  s.finance.creditDepth += (creditTarget - s.finance.creditDepth) * clamp(years * 0.11);
  s.finance.depositBanking += (clamp(s.finance.creditDepth * 0.45 + accounting * 0.3 + urbanisation(region) * 0.2) - s.finance.depositBanking) * clamp(years * 0.07);
  s.finance.billsOfExchange += (clamp(s.finance.creditDepth * 0.4 + trade * 0.32 + accounting * 0.28) - s.finance.billsOfExchange) * clamp(years * 0.065);
  s.finance.stateCreditAccess += (clamp(s.finance.depositBanking * 0.28 + s.finance.billsOfExchange * 0.32 + trust * 0.2 + (polity?.administration?.legitimacy || 0) * 0.2) - s.finance.stateCreditAccess) * clamp(years * 0.08);
  s.finance.crisisRisk = clamp(s.finance.creditDepth * 0.12 + s.finance.depositBanking * 0.15 - trust * 0.1);
  if (s.finance.creditDepth > 0.4) s.institutions.add('merchant_credit');
  if (s.finance.billsOfExchange > 0.48) s.institutions.add('bills_of_exchange');
  if (s.finance.depositBanking > 0.52) s.institutions.add('deposit_banking');
  if (rng() < s.finance.crisisRisk * years * 0.01 && s.finance.creditDepth > 0.4) {
    s.finance.creditDepth *= 0.78;
    s.finance.depositBanking *= 0.85;
    region.wallet = Math.max(0, (region.wallet || 0) * 0.96);
    return { type: 'credit_crisis', regionId: region.id, regionName: region.name, polityId: polity?.id };
  }
  return null;
}

function updateTradeInstitutions(region, s, years) {
  const trade = commerce(region);
  const inland = region.isCoastal ? 0.35 : 1;
  const piracyRisk = clamp(Number(region.tradeEconomy?.piracyRisk) || Number(region.militaryThreat?.piracy) || 0);
  s.trade.caravanInstitutions += (clamp(trade * 0.55 * inland + (region.infrastructure?.road || 0) * 0.2) - s.trade.caravanInstitutions) * clamp(years * 0.1);
  s.trade.convoying += (clamp(trade * 0.38 + piracyRisk * 0.42 + (region.navy?.boats || 0) / 100 * 0.2) - s.trade.convoying) * clamp(years * 0.12);
  s.trade.merchantDiaspora += (clamp(trade * 0.5 + s.urban.merchantElitePower * 0.28 + s.finance.creditDepth * 0.22) - s.trade.merchantDiaspora) * clamp(years * 0.07);
  s.trade.insurance += (clamp(s.finance.creditDepth * 0.36 + s.trade.convoying * 0.2 + trade * 0.28 + s.trade.merchantDiaspora * 0.16) - s.trade.insurance) * clamp(years * 0.06);
  if (s.trade.caravanInstitutions > 0.45) s.institutions.add('caravanserai_networks');
  if (s.trade.convoying > 0.48) s.institutions.add('merchant_convoys');
  if (s.trade.merchantDiaspora > 0.52) s.institutions.add('merchant_diaspora');
  if (s.trade.insurance > 0.52) s.institutions.add('risk_sharing_contracts');
}

function updateLabourAfterDisease(region, s, years) {
  const shock = epidemicShock(region);
  s.labour.postEpidemicScarcity += (shock - s.labour.postEpidemicScarcity) * clamp(years * 0.8);
  const urban = urbanisation(region);
  const target = clamp(0.15 + s.labour.postEpidemicScarcity * 0.5 + urban * 0.12 + s.urban.guildPower * 0.14 - (region.medievalPolitics?.eliteOrganisation || 0) * 0.08);
  s.labour.bargainingPower += (target - s.labour.bargainingPower) * clamp(years * 0.3);
  s.labour.wagePressure = clamp(s.labour.bargainingPower * 0.45 + s.labour.postEpidemicScarcity * 0.55);
  if (s.labour.postEpidemicScarcity > 0.3) {
    region.stability = clamp((region.stability ?? 0.7) + s.labour.bargainingPower * years * 0.002 - (region.medievalPolitics?.eliteOrganisation || 0) * years * 0.001);
  }
}

export function medievalInstitutionEffects(region) {
  const s = ensureMedievalSociety(region);
  return {
    tradeRiskMultiplier: clamp(1 - s.trade.convoying * 0.18 - s.trade.insurance * 0.12, 0.65, 1),
    longDistanceTradeMultiplier: 1 + s.trade.caravanInstitutions * 0.14 + s.trade.merchantDiaspora * 0.18,
    creditMultiplier: 1 + s.finance.creditDepth * 0.22,
    administrativeLearningMultiplier: 1 + s.education.institutionalLearning * 0.18,
    labourCostMultiplier: 1 + s.labour.wagePressure * 0.16,
    urbanPoliticalPower: clamp(Math.max(s.urban.guildPower, s.urban.municipalPower, s.urban.merchantElitePower)),
  };
}

export function tickMedievalSocietyEconomy(regions, polities, currentTick, elapsedDays = 30, rng = Math.random) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const pMap = new Map((polities || []).map((p) => [p.id, p]));
  const events = [];
  for (const region of regions) {
    const polity = pMap.get(region.governance?.sovereignPolityId || region.polityId);
    const s = ensureMedievalSociety(region);
    updateUrbanInstitutions(region, s, years);
    updateEducation(region, polity, s, years);
    const financeEvent = updateFinance(region, polity, s, years, rng);
    if (financeEvent) events.push(financeEvent);
    updateTradeInstitutions(region, s, years);
    updateLabourAfterDisease(region, s, years);
  }
  return events;
}
