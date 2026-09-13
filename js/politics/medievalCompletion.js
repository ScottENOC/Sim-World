import { ensureMedievalSociety } from './medievalStateSystems.js?v=20260913-medieval-completion1';
import { ensureMedievalCommercialState } from '../economy/medievalCommercialInstitutions.js?v=20260913-medieval-completion1';
import { ensureDiseaseState, activeDiseaseBurden } from '../society/disease.js?v=20260913-medieval-completion1';

const DAYS_PER_YEAR = 365.2425;
const HALF_YEAR_DAYS = DAYS_PER_YEAR / 2;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function urbanPopulation(region) {
  return Math.max(0, Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation) || 0);
}
function urbanShare(region) { return clamp(urbanPopulation(region) / Math.max(1, region.population || 1)); }
function commerce(region) {
  const imports = Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const exports = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0);
  return clamp(Math.log1p(imports + exports) / 9);
}
function polityFor(region, pMap) { return pMap.get(region.governance?.sovereignPolityId || region.polityId) || null; }
function hasTech(region, id) {
  return Boolean(region.unlockedTechIds?.has?.(id) || region.breakthroughs?.has?.(id) || region.technology?.breakthroughs?.has?.(id) || region.technology?.known?.has?.(id));
}
function dominantReligion(region) {
  return Object.entries(region.religion?.shares || {}).sort((a,b) => b[1]-a[1])[0] || [null, 0];
}

export function ensureMedievalCompletionState(region) {
  region.medievalCompletion ||= {};
  const s = region.medievalCompletion;
  s.city ||= { charter: 0, communeAutonomy: 0, guildPower: 0, civicMilitia: 0, taxBargaining: 0, lastCharterTick: null };
  s.land ||= { nobleShare: 0.2, clericalShare: 0.05, urbanShare: 0.03, freeholderShare: 0.62, crownShare: 0.1, rentExtraction: 0.25, labourDues: 0.25 };
  s.church ||= { monasteries: 0, bishopric: 0, wealth: 0, landShare: 0.05, investiturePressure: 0, reliefCapacity: 0 };
  s.university ||= { founded: false, foundedTick: null, students: 0, law: 0, medicine: 0, theology: 0, naturalPhilosophy: 0, institutionalMemory: 0 };
  s.epidemic ||= { labourScarcity: 0, wagePressure: 0, ruralAbandonment: 0, urbanFlight: 0, quarantinePractice: 0, relief: 0, cumulativeSocialShock: 0 };
  s.military ||= { paidForceShare: 0, retinueShare: 0.7, contractingCapacity: 0, artilleryFinance: 0, fiscalStrain: 0 };
  if (!Array.isArray(s.actors)) s.actors = [];
  return s;
}

function ensureActor(state, type, name) {
  let actor = state.actors.find(a => a.type === type);
  if (!actor) {
    actor = { id: `${type}:${state.actors.length + 1}`, type, name, wealth: 10, power: 0.1, loyalty: 0.65, autonomy: 0.1, militia: 0, grievance: 0, agenda: 'preserve_privileges', active: true };
    state.actors.push(actor);
  }
  return actor;
}

function normaliseLand(land) {
  const keys = ['nobleShare','clericalShare','urbanShare','freeholderShare','crownShare'];
  let sum = keys.reduce((n,k) => n + Math.max(0, land[k] || 0), 0);
  if (sum <= 0) { land.freeholderShare = 1; sum = 1; }
  for (const k of keys) land[k] = Math.max(0, land[k] || 0) / sum;
}

function updateLandAndElite(region, polity, state, years) {
  const society = ensureMedievalSociety(region);
  const labour = ensureMedievalCommercialState(region).labour;
  const land = state.land;
  const eliteTarget = clamp((society.estates?.eliteLandShare || 0) * 0.72 + (society.estates?.hereditaryPower || 0) * 0.18 + 0.06, 0.05, 0.72);
  land.nobleShare += (eliteTarget - land.nobleShare) * clamp(years * 0.11);
  land.clericalShare += (state.church.landShare - land.clericalShare) * clamp(years * 0.12);
  land.urbanShare += (clamp(state.city.guildPower * 0.12 + state.city.communeAutonomy * 0.08) - land.urbanShare) * clamp(years * 0.08);
  const scarcity = clamp(labour.labourScarcity || 0);
  const bargaining = clamp(labour.bargainingPower || 0);
  land.labourDues += (clamp(0.62 * land.nobleShare - scarcity * 0.38 - bargaining * 0.32) - land.labourDues) * clamp(years * 0.18);
  land.rentExtraction += (clamp(0.2 + land.nobleShare * 0.42 + land.clericalShare * 0.2 - bargaining * 0.25) - land.rentExtraction) * clamp(years * 0.13);
  land.crownShare += (clamp((polity?.administration?.centralisation || 0) * 0.12 + (polity?.administration?.officialdom || 0) * 0.05) - land.crownShare) * clamp(years * 0.04);
  land.freeholderShare = Math.max(0.05, 1 - land.nobleShare - land.clericalShare - land.urbanShare - land.crownShare);
  normaliseLand(land);

  const noble = ensureActor(state, 'landed_elite', `${region.name} landed elite`);
  const agrarianValue = Math.max(1, (region.population || 0) * (1 - urbanShare(region)) / 1000);
  const rentIncome = agrarianValue * land.nobleShare * land.rentExtraction * years;
  noble.wealth += rentIncome;
  noble.power = clamp(land.nobleShare * 0.42 + (society.estates?.privateRetinues || 0) * 0.32 + Math.log1p(noble.wealth) / 30);
  noble.militia = Math.max(0, noble.militia + noble.power * years * 8 - noble.militia * years * 0.03);
  noble.autonomy = clamp((region.governance?.autonomy || 0) * 0.55 + noble.power * 0.35);
  noble.grievance = clamp((polity?.administration?.centralisation || 0) * noble.power * 0.6 + (society.estates?.taxExemption ? Math.max(0, 0.5 - society.estates.taxExemption) * 0.15 : 0));
  noble.loyalty = clamp(0.74 - noble.grievance * 0.48 + (polity?.administration?.legitimacy || 0.5) * 0.25);
  return noble;
}

function updateCity(region, polity, state, years, currentTick, rng, events) {
  const society = ensureMedievalSociety(region);
  const c = commerce(region); const urban = urbanShare(region);
  const city = state.city;
  city.guildPower += (clamp((society.urban?.guilds || 0) * 0.58 + c * 0.28 + urban * 0.14) - city.guildPower) * clamp(years * 0.2);
  const weakCentre = 1 - clamp(region.governance?.administrativeControl ?? 1);
  const charterTarget = clamp((society.urban?.council || 0) * 0.34 + city.guildPower * 0.27 + c * 0.18 + weakCentre * 0.21);
  city.charter += (charterTarget - city.charter) * clamp(years * 0.12);
  city.communeAutonomy += (clamp(city.charter * 0.5 + (society.urban?.charterAutonomy || 0) * 0.28 + weakCentre * 0.18) - city.communeAutonomy) * clamp(years * 0.12);
  city.civicMilitia += (clamp((society.urban?.militia || 0) * 0.55 + city.communeAutonomy * 0.22 + city.guildPower * 0.16) - city.civicMilitia) * clamp(years * 0.18);
  city.taxBargaining += (clamp(city.guildPower * 0.36 + city.communeAutonomy * 0.4 + c * 0.24) - city.taxBargaining) * clamp(years * 0.1);

  if (city.charter > 0.58 && urbanPopulation(region) > 3500 && (!city.lastCharterTick || currentTick - city.lastCharterTick > 520) && rng() < 0.02 * years) {
    city.lastCharterTick = currentTick;
    region.governance.autonomy = clamp(Math.max(region.governance.autonomy || 0, city.communeAutonomy * 0.62));
    events.push({ type: 'urban_charter_conceded', regionId: region.id, polityId: polity?.id || null, charterStrength: city.charter });
  }

  const council = ensureActor(state, 'city_council', `${region.name} civic council`);
  council.wealth += Math.max(0, (region.tradeEconomy?.weeklyExports || 0) + (region.tradeEconomy?.weeklyImports || 0)) * 2.2 * city.guildPower * years;
  council.power = clamp(city.communeAutonomy * 0.35 + city.guildPower * 0.32 + city.civicMilitia * 0.18 + Math.log1p(council.wealth) / 32);
  council.autonomy = city.communeAutonomy;
  council.militia = Math.round(urbanPopulation(region) * 0.018 * city.civicMilitia);
  council.agenda = city.communeAutonomy > 0.55 ? 'defend_charter' : 'seek_charter';
  council.grievance = clamp((1 - city.taxBargaining) * (polity?.administration?.centralisation || 0) * council.power);
  council.loyalty = clamp(0.7 - council.grievance * 0.4 + (region.stability || 0.6) * 0.2);

  const guild = ensureActor(state, 'guilds', `${region.name} guilds`);
  guild.wealth += Math.max(0, region.wallet || 0) * 0.0004 * city.guildPower * years;
  guild.power = clamp(city.guildPower * 0.55 + city.taxBargaining * 0.25 + Math.log1p(guild.wealth) / 35);
  guild.autonomy = clamp(city.communeAutonomy * 0.65);
  guild.agenda = 'protect_craft_and_market_privileges';
  guild.loyalty = clamp(0.6 + (ensureMedievalCommercialState(region).trade.commercialLaw || 0) * 0.25 - (ensureMedievalCommercialState(region).finance.creditCrisis || 0) * 0.3);
}

function updateChurch(region, polity, world, state, years) {
  const [religionId, religionShare] = dominantReligion(region);
  const church = state.church;
  const religion = (world?.religions || []).find(r => r.id === religionId);
  const authority = clamp(religion?.authority || region.religiousSeatInfluence || 0);
  const population = Math.max(0, region.population || 0);
  const targetMonasteries = Math.max(0, Math.floor((population / 18000) * religionShare * (0.25 + authority)));
  church.monasteries += (targetMonasteries - church.monasteries) * clamp(years * 0.08);
  church.bishopric += (clamp(religionShare * 0.42 + authority * 0.38 + (urbanPopulation(region) > 6000 ? 0.12 : 0)) - church.bishopric) * clamp(years * 0.08);
  church.landShare += (clamp(0.015 + religionShare * 0.07 + authority * 0.08 + church.monasteries / 120) - church.landShare) * clamp(years * 0.045);
  church.reliefCapacity += (clamp(church.monasteries / 10 * 0.45 + church.bishopric * 0.25 + authority * 0.25) - church.reliefCapacity) * clamp(years * 0.1);
  church.wealth += (population / 1000) * religionShare * (0.4 + church.landShare * 4) * years;
  const central = clamp(polity?.administration?.centralisation || 0);
  church.investiturePressure += (clamp(church.bishopric * authority * central * 0.9) - church.investiturePressure) * clamp(years * 0.1);

  const clerical = ensureActor(state, 'clerical_establishment', `${region.name} clerical establishment`);
  clerical.wealth = Math.max(clerical.wealth, church.wealth);
  clerical.power = clamp(church.landShare * 1.8 + church.bishopric * 0.25 + authority * 0.25 + Math.log1p(church.wealth) / 45);
  clerical.autonomy = clamp(authority * 0.5 + church.landShare * 1.5);
  clerical.grievance = church.investiturePressure;
  clerical.loyalty = clamp(0.75 - church.investiturePressure * 0.45 + (region.religion?.stateReligionId === religionId ? 0.12 : 0));
  clerical.agenda = church.investiturePressure > 0.45 ? 'resist_secular_appointments' : 'expand_religious_estates';
}

function updateUniversity(region, polity, state, years, currentTick, rng, events) {
  const society = ensureMedievalSociety(region);
  const u = state.university;
  const knowledge = clamp(society.education?.knowledgeCapacity || 0);
  const academy = clamp(society.education?.urbanAcademies || 0);
  const commercialLaw = clamp(ensureMedievalCommercialState(region).trade.commercialLaw || 0);
  const eligible = urbanPopulation(region) >= 6500 && knowledge >= 0.38 && (academy >= 0.28 || state.church.bishopric >= 0.45 || (polity?.administration?.officialdom || 0) >= 0.55);
  if (!u.founded && eligible && rng() < years * (0.002 + knowledge * 0.004 + academy * 0.003)) {
    u.founded = true; u.foundedTick = currentTick; u.students = Math.max(80, Math.round(urbanPopulation(region) * 0.012));
    events.push({ type: 'university_founded', regionId: region.id, polityId: polity?.id || null, students: u.students });
  }
  if (!u.founded) return;
  const finance = ensureMedievalCommercialState(region).finance;
  u.students = Math.max(40, u.students + (urbanPopulation(region) * 0.014 * (0.4 + knowledge) - u.students) * clamp(years * 0.08));
  u.law += (clamp(commercialLaw * 0.48 + (polity?.administration?.recordKeeping || 0) * 0.32 + finance.stateCredit * 0.2) - u.law) * clamp(years * 0.1);
  u.medicine += (clamp(state.epidemic.cumulativeSocialShock * 0.28 + state.church.reliefCapacity * 0.22 + knowledge * 0.5) - u.medicine) * clamp(years * 0.08);
  u.theology += (clamp(state.church.bishopric * 0.42 + knowledge * 0.36 + (region.religiousSeatInfluence || 0) * 0.22) - u.theology) * clamp(years * 0.09);
  u.naturalPhilosophy += (clamp(knowledge * 0.42 + (society.education?.technicalSchools || 0) * 0.34 + commercialLaw * 0.12 + academy * 0.12) - u.naturalPhilosophy) * clamp(years * 0.07);
  u.institutionalMemory += (clamp((u.law + u.medicine + u.theology + u.naturalPhilosophy) / 4) - u.institutionalMemory) * clamp(years * 0.06);
  if (polity?.administration?.experience) {
    polity.administration.experience.recordKeeping += u.law * years * 4;
    polity.administration.experience.officialdom += (u.law + u.theology) * years * 2;
    polity.administration.experience.accounting += u.law * years * 1.5;
  }
  const scholars = ensureActor(state, 'university', `${region.name} scholars`);
  scholars.wealth += Math.max(1, u.students / 80) * years;
  scholars.power = clamp(u.institutionalMemory * 0.45 + Math.log1p(u.students) / 25);
  scholars.loyalty = clamp(0.7 + commercialLaw * 0.12 - state.church.investiturePressure * 0.08);
  scholars.agenda = 'preserve_and_extend_learning';
}

function updateEpidemicSociety(region, state, years) {
  const commerceState = ensureMedievalCommercialState(region);
  const disease = ensureDiseaseState(region);
  const epidemic = state.epidemic;
  const burden = activeDiseaseBurden(region);
  const recentDeaths = Object.values(disease.pathogens || {}).reduce((n,p) => n + Math.max(0, Number(p.lastDeaths) || 0), 0);
  const deathShare = clamp(recentDeaths / Math.max(1, region.population || 1), 0, 0.25);
  epidemic.labourScarcity += (clamp(commerceState.labour.labourScarcity * 0.7 + deathShare * 2) - epidemic.labourScarcity) * clamp(years * 0.5);
  epidemic.wagePressure += (clamp(commerceState.labour.wagePressure * 0.75 + epidemic.labourScarcity * 0.2) - epidemic.wagePressure) * clamp(years * 0.45);
  epidemic.urbanFlight += (clamp(burden * 1.7 + deathShare * 2.5) - epidemic.urbanFlight) * clamp(years * 1.1);
  epidemic.ruralAbandonment += (clamp(deathShare * 3 + epidemic.labourScarcity * 0.3) - epidemic.ruralAbandonment) * clamp(years * 0.32);
  epidemic.quarantinePractice += (clamp(disease.quarantinePolicy * 0.45 + disease.effectiveQuarantine * 0.35 + (state.university.medicine || 0) * 0.2) - epidemic.quarantinePractice) * clamp(years * 0.22);
  epidemic.relief += (clamp(state.church.reliefCapacity * 0.55 + state.city.guildPower * 0.15 + (state.university.medicine || 0) * 0.3) - epidemic.relief) * clamp(years * 0.25);
  epidemic.cumulativeSocialShock = clamp(epidemic.cumulativeSocialShock * Math.pow(0.985, years) + deathShare * 2.5);
  if (burden > 0.015) disease.quarantinePolicy = clamp(Math.max(disease.quarantinePolicy, epidemic.quarantinePractice * 0.7));
  const netShock = burden * (1 - epidemic.relief * 0.35);
  region.stability = clamp((region.stability ?? 0.7) - netShock * years * 0.015 + epidemic.relief * burden * years * 0.005);
}

function updateMilitaryTransition(region, polity, state, years) {
  const m = state.military;
  const finance = ensureMedievalCommercialState(region).finance;
  const capital = region.corporateCapital || {};
  const admin = polity?.administration || {};
  const fiscal = clamp((admin.accounting || 0) * 0.28 + (admin.recordKeeping || 0) * 0.18 + finance.stateCredit * 0.28 + clamp(Math.log1p(region.treasury || 0) / 10) * 0.26);
  m.contractingCapacity += (clamp(fiscal * 0.65 + finance.merchantCredit * 0.18 + (capital.financialDepth || 0) * 0.17) - m.contractingCapacity) * clamp(years * 0.12);
  const gunpowder = hasTech(region, 'gunpowder') ? 1 : 0;
  m.artilleryFinance += (clamp(m.contractingCapacity * 0.42 + finance.stateCredit * 0.26 + gunpowder * 0.32) - m.artilleryFinance) * clamp(years * 0.1);
  const permanentArmySignal = clamp((region.army?.permanence || region.armyPermanence || 0) * 0.5 + (region.army?.personnel || 0) / Math.max(800, (region.population || 1) * 0.04) * 0.25);
  const targetPaid = clamp(m.contractingCapacity * 0.48 + permanentArmySignal * 0.28 + gunpowder * m.artilleryFinance * 0.24);
  m.paidForceShare += (targetPaid - m.paidForceShare) * clamp(years * 0.08);
  m.retinueShare += (clamp(1 - m.paidForceShare * 0.72 - (polity?.institutionalPaths?.bureaucraticService || 0) * 0.12) - m.retinueShare) * clamp(years * 0.07);
  const wageBill = Math.max(0, region.army?.personnel || 0) * m.paidForceShare * 0.0015;
  const annualRevenue = Math.max(1, (region.militaryFinance?.weeklyTaxRevenue || 0) * 52 + (region.tradeEconomy?.weeklyExports || 0) * 5);
  m.fiscalStrain += (clamp(wageBill * 52 / annualRevenue) - m.fiscalStrain) * clamp(years * 0.3);
  if (region.army) {
    region.army.paidShare = m.paidForceShare;
    region.army.contractingCapacity = m.contractingCapacity;
  }
}

function actorPolitics(region, polity, state, years, rng, events) {
  const adminControl = clamp(region.governance?.administrativeControl ?? 0.7);
  for (const actor of state.actors) {
    if (!actor.active) continue;
    const challenge = actor.power * actor.grievance * actor.autonomy;
    if (challenge > 0.18) region.governance.autonomy = clamp((region.governance.autonomy || 0) + challenge * years * 0.018);
    if (actor.loyalty < 0.35 && actor.power > 0.45) region.stability = clamp((region.stability ?? 0.7) - actor.power * (0.4 - actor.loyalty) * years * 0.018);
    if (actor.type === 'city_council' && actor.wealth > 80 && polity && (polity.administration?.legitimacy || 0.5) < 0.65) {
      const contribution = Math.min(actor.wealth * 0.004 * years, Math.max(0, 15 - (region.treasury || 0)));
      if (contribution > 0) { actor.wealth -= contribution; region.treasury = (region.treasury || 0) + contribution; actor.power = clamp(actor.power + contribution / 500); }
    }
    if (actor.loyalty < 0.3 && challenge > 0.28 && rng() < 0.012 * years) {
      events.push({ type: 'autonomous_actor_confrontation', regionId: region.id, polityId: polity?.id || null, actor: { ...actor }, administrativeControl: adminControl });
    }
  }
}

export function tickMedievalCompletion(regions, polities, religiousWorld, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  if (!religiousWorld || typeof religiousWorld !== 'object') return [];
  religiousWorld.medievalCompletionElapsedDays = Math.max(0, Number(religiousWorld.medievalCompletionElapsedDays) || 0) + Math.max(0, Number(elapsedDays) || 0);
  if (religiousWorld.medievalCompletionElapsedDays < HALF_YEAR_DAYS) return [];
  const days = religiousWorld.medievalCompletionElapsedDays;
  religiousWorld.medievalCompletionElapsedDays = 0;
  const years = days / DAYS_PER_YEAR;
  const pMap = new Map((polities || []).map(p => [p.id,p]));
  const events = [];
  for (const region of regions || []) {
    const state = ensureMedievalCompletionState(region);
    const polity = polityFor(region, pMap);
    updateChurch(region, polity, religiousWorld, state, years);
    updateLandAndElite(region, polity, state, years);
    updateCity(region, polity, state, years, currentTick, rng, events);
    updateEpidemicSociety(region, state, years);
    updateUniversity(region, polity, state, years, currentTick, rng, events);
    updateMilitaryTransition(region, polity, state, years);
    actorPolitics(region, polity, state, years, rng, events);
    region.medievalActorPower = Math.max(0, ...state.actors.map(a => a.power || 0));
    region.medievalInstitutionalDepth = clamp((state.city.guildPower + state.city.charter + state.church.bishopric + state.university.institutionalMemory + state.military.contractingCapacity) / 5);
  }
  return events.filter(e => !options.playerPolityId || e.polityId === options.playerPolityId || e.type === 'university_founded');
}
