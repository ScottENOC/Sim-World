import { ensureCounterIntelligence } from '../diplomacy/counterIntelligence.js?v=20260913-renaissance1';
import { ensureMedievalSociety } from '../politics/medievalStateSystems.js?v=20260913-renaissance1';
import { ensureMedievalCommercialState } from '../economy/medievalCommercialInstitutions.js?v=20260913-renaissance1';
import { ensureMedievalCompletionState } from '../politics/medievalCompletion.js?v=20260913-renaissance1';

const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const polityIdFor = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id;
const urbanPopulation = (region) => Math.max(0, Number(region.urbanisation?.urbanPopulation ?? region.urbanization?.urbanPopulation) || 0);
const hasTech = (region, id) => Boolean(region?.unlockedTechIds?.has?.(id) || region?.breakthroughs?.has?.(id) || region?.technology?.breakthroughs?.has?.(id) || region?.technology?.known?.has?.(id));

function tradeIntensity(region) {
  const imports = Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const exports = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0);
  return clamp(Math.log1p(imports + exports) / 9);
}

function education(region) {
  const medieval = ensureMedievalSociety(region).education || {};
  return clamp(Math.max(region.educationLevel || 0, medieval.knowledgeCapacity || 0));
}

function elitePower(region) {
  const society = ensureMedievalSociety(region);
  return clamp((society.estates?.hereditaryPower || 0) * 0.55 + (society.estates?.eliteLandShare || 0) * 0.45);
}

function linkedRegionIds(region) {
  const out = new Set(region.neighbors || []);
  for (const id of region.tradePartnerIds || []) out.add(id);
  if (region.recentTradePartners?.keys) for (const id of region.recentTradePartners.keys()) out.add(id);
  out.delete(region.id);
  return out;
}

export function ensureRenaissanceState(region) {
  region.renaissance ||= {};
  const r = region.renaissance;
  r.printing ||= {
    mechanicalPress: false, discoveredTick: null, presses: 0, printCapacity: 0,
    publicationFlow: 0, vernacularShare: 0.2, censorship: 0, informationVelocity: 0,
    importedPrint: 0, religiousChallengePressure: 0,
  };
  r.patronage ||= {
    court: 0, merchant: 0, religious: 0, civic: 0, scholarly: 0,
    artsPrestige: 0, knowledgeProduction: 0, talentAttraction: 0,
  };
  r.university ||= {
    prestige: 0, selectivity: 0, internationalShare: 0, foreignStudents: 0,
    brainGain: 0, brainDrainPressure: 0, eliteClosure: 0, socialMobilityPenalty: 0,
    espionageExposure: 0, alumniInfluence: 0, notableAlumni: [], foreignAffinity: {},
    annualStudentFlows: {}, lastNotableTick: null,
  };
  r.talent ||= { pool: 0, retainedForeignTalent: 0, returningScholars: 0 };
  return r;
}

function updatePatronage(region, polity, state, years) {
  const p = state.patronage;
  const commerce = tradeIntensity(region);
  const wealth = clamp(Math.log1p(Math.max(0, region.wallet || 0) + Math.max(0, region.treasury || 0)) / 10);
  const church = ensureMedievalCompletionState(region).church;
  const city = ensureMedievalCompletionState(region).city;
  const central = clamp(polity?.stateAdministration?.court?.centralisationDrive || 0);
  p.court += (clamp(central * 0.45 + wealth * 0.35 + education(region) * 0.2) - p.court) * clamp(years * 0.12);
  p.merchant += (clamp(commerce * 0.55 + wealth * 0.25 + (city.guildPower || 0) * 0.2) - p.merchant) * clamp(years * 0.14);
  p.religious += (clamp((church.wealth ? Math.log1p(church.wealth) / 10 : 0) * 0.35 + (church.bishopric || 0) * 0.4 + education(region) * 0.15) - p.religious) * clamp(years * 0.1);
  p.civic += (clamp((city.guildPower || 0) * 0.35 + (city.communeAutonomy || 0) * 0.35 + commerce * 0.3) - p.civic) * clamp(years * 0.12);
  p.scholarly += (clamp((p.court + p.merchant + p.religious + p.civic) / 4 * 0.65 + education(region) * 0.35) - p.scholarly) * clamp(years * 0.1);
  p.artsPrestige += (clamp(p.court * 0.3 + p.merchant * 0.24 + p.religious * 0.18 + p.civic * 0.18 + p.scholarly * 0.1) - p.artsPrestige) * clamp(years * 0.08);
  p.knowledgeProduction += (clamp(p.scholarly * 0.48 + education(region) * 0.32 + commerce * 0.12 + p.artsPrestige * 0.08) - p.knowledgeProduction) * clamp(years * 0.1);
  p.talentAttraction = clamp(p.knowledgeProduction * 0.55 + p.artsPrestige * 0.3 + wealth * 0.15);
}

function updatePrinting(region, polity, state, byId, years, currentTick, rng, events) {
  const printing = state.printing;
  const society = ensureMedievalSociety(region);
  const craft = clamp((society.urban?.industrialSpecialisation || 0) * 0.4 + (society.education?.technicalSchools || 0) * 0.2 + tradeIntensity(region) * 0.2 + state.patronage.scholarly * 0.2);
  const writing = hasTech(region, 'writing') || education(region) > 0.42;
  const eligible = writing && urbanPopulation(region) >= 4000 && craft >= 0.28;
  if (!printing.mechanicalPress && eligible) {
    let exposure = 0;
    for (const id of linkedRegionIds(region)) {
      const other = byId.get(id);
      if (other?.renaissance?.printing?.mechanicalPress) exposure = Math.max(exposure, other.renaissance.printing.informationVelocity || 0.25);
    }
    const chance = years * (0.002 + craft * 0.004 + state.patronage.knowledgeProduction * 0.003 + exposure * 0.025);
    if (rng() < chance) {
      printing.mechanicalPress = true;
      printing.discoveredTick = currentTick;
      printing.presses = 1;
      events.push({ type: 'printing_established', regionId: region.id, polityId: polityIdFor(region) });
    }
  }
  if (!printing.mechanicalPress) {
    printing.importedPrint *= Math.pow(0.94, years);
    for (const id of linkedRegionIds(region)) {
      const other = byId.get(id);
      if (other?.renaissance?.printing?.publicationFlow > 0.05) printing.importedPrint += other.renaissance.printing.publicationFlow * 0.01 * years;
    }
    printing.informationVelocity = clamp(printing.importedPrint * 0.3 + education(region) * 0.15);
    return;
  }

  const commerce = tradeIntensity(region);
  const literacy = education(region);
  const central = clamp(polity?.stateAdministration?.court?.centralisationDrive || 0);
  const religiousControl = region.religion?.stateReligionId ? 0.12 : 0;
  printing.censorship += (clamp(central * 0.28 + religiousControl + (1 - ensureMedievalCompletionState(region).city.communeAutonomy) * 0.18) - printing.censorship) * clamp(years * 0.08);
  const targetPresses = Math.max(1, (urbanPopulation(region) / 12000) * (0.35 + commerce + literacy + state.patronage.merchant * 0.5));
  printing.presses += (targetPresses - printing.presses) * clamp(years * 0.16);
  printing.printCapacity += (clamp(Math.log1p(printing.presses) / 3 + literacy * 0.28 + commerce * 0.18) - printing.printCapacity) * clamp(years * 0.18);
  printing.vernacularShare += (clamp(0.28 + literacy * 0.38 + commerce * 0.18 - printing.censorship * 0.18) - printing.vernacularShare) * clamp(years * 0.1);
  printing.publicationFlow += (clamp(printing.printCapacity * (0.5 + state.patronage.knowledgeProduction * 0.45) * (1 - printing.censorship * 0.45)) - printing.publicationFlow) * clamp(years * 0.2);
  printing.informationVelocity += (clamp(printing.publicationFlow * 0.55 + commerce * 0.2 + literacy * 0.15 + printing.importedPrint * 0.1) - printing.informationVelocity) * clamp(years * 0.18);
  printing.religiousChallengePressure += (clamp(printing.publicationFlow * printing.vernacularShare * 0.45 + printing.informationVelocity * 0.25 - printing.censorship * 0.24) - printing.religiousChallengePressure) * clamp(years * 0.08);
}

function universityQuality(region) {
  const u = ensureMedievalCompletionState(region).university;
  if (!u.founded) return 0;
  return clamp((u.institutionalMemory || 0) * 0.38 + (u.law || 0) * 0.12 + (u.medicine || 0) * 0.12 + (u.theology || 0) * 0.1 + (u.naturalPhilosophy || 0) * 0.28);
}

function updateUniversityBase(region, polity, state, years) {
  const medieval = ensureMedievalCompletionState(region).university;
  const u = state.university;
  if (!medieval.founded) {
    u.prestige *= Math.pow(0.98, years);
    u.internationalShare *= Math.pow(0.96, years);
    u.foreignStudents *= Math.pow(0.96, years);
    return false;
  }
  const ageYears = medieval.foundedTick == null ? 0 : Math.max(0, ((state._currentTick || medieval.foundedTick) - medieval.foundedTick) / 52);
  const quality = universityQuality(region);
  const scale = clamp(Math.log1p(Math.max(0, medieval.students || 0)) / 8);
  const age = clamp(Math.log1p(ageYears) / 5);
  const reputationTarget = clamp(quality * 0.38 + state.patronage.scholarly * 0.22 + state.patronage.artsPrestige * 0.12 + scale * 0.16 + age * 0.12);
  u.prestige += (reputationTarget - u.prestige) * clamp(years * 0.08);
  u.selectivity += (clamp(u.prestige * 0.58 + elitePower(region) * 0.28 + scale * 0.14) - u.selectivity) * clamp(years * 0.08);
  const openness = clamp(tradeIntensity(region) * 0.45 + state.printing.informationVelocity * 0.3 + (1 - state.printing.censorship) * 0.25);
  u.internationalShare += (clamp(u.prestige * openness * 0.72) - u.internationalShare) * clamp(years * 0.08);
  u.eliteClosure += (clamp(u.selectivity * elitePower(region) * (0.45 + u.prestige * 0.55)) - u.eliteClosure) * clamp(years * 0.08);
  u.socialMobilityPenalty = clamp(u.eliteClosure * 0.65 - state.patronage.civic * 0.12);
  u.alumniInfluence = clamp(u.prestige * 0.5 + u.eliteClosure * 0.2 + quality * 0.3);
  return true;
}

function candidateSources(universityRegion, byId, prestigeLeaders) {
  const ids = linkedRegionIds(universityRegion);
  for (const region of prestigeLeaders) if (region.id !== universityRegion.id) ids.add(region.id);
  const result = [];
  for (const id of ids) {
    const source = byId.get(id);
    if (source && source.id !== universityRegion.id) result.push(source);
  }
  return result;
}

function maybeNotableAlumnus(host, source, state, flow, currentTick, rng, events) {
  if (flow < 0.4 || rng() >= Math.min(0.12, flow / 40)) return;
  const u = state.university;
  if (u.lastNotableTick != null && currentTick - u.lastNotableTick < 52) return;
  const fields = ['law', 'medicine', 'theology', 'natural_philosophy', 'administration', 'diplomacy'];
  const alumnus = {
    id: `alumnus:${host.id}:${currentTick}:${u.notableAlumni.length + 1}`,
    sourceRegionId: source.id,
    sourcePolityId: polityIdFor(source),
    hostRegionId: host.id,
    hostPolityId: polityIdFor(host),
    field: fields[Math.floor(rng() * fields.length) % fields.length],
    affinity: clamp(0.45 + u.prestige * 0.4),
    influencePotential: clamp(0.25 + u.selectivity * 0.3 + elitePower(source) * 0.35),
    recruitedTick: currentTick,
  };
  u.notableAlumni.push(alumnus);
  if (u.notableAlumni.length > 12) u.notableAlumni.shift();
  u.lastNotableTick = currentTick;
  events.push({ type: 'notable_foreign_alumnus', regionId: host.id, polityId: polityIdFor(host), alumnus });
}

function updateUniversityFlows(region, state, byId, prestigeLeaders, years, currentTick, rng, events) {
  const medieval = ensureMedievalCompletionState(region).university;
  const u = state.university;
  if (!medieval.founded) return;
  u.annualStudentFlows = {};
  let foreignStudents = 0;
  let brainGain = 0;
  const candidates = candidateSources(region, byId, prestigeLeaders);
  for (const source of candidates) {
    const sourceState = ensureRenaissanceState(source);
    const sourceEducation = education(source);
    const sourceWealth = clamp(Math.log1p(Math.max(0, source.wallet || 0)) / 9);
    const samePolity = polityIdFor(source) === polityIdFor(region);
    if (samePolity || sourceEducation < 0.18) continue;
    const connection = linkedRegionIds(source).has(region.id) ? 1 : 0.45;
    const attraction = clamp(u.prestige * 0.48 + state.patronage.talentAttraction * 0.2 + state.printing.informationVelocity * 0.12 + tradeIntensity(region) * 0.2);
    const sourcePool = Math.max(0, (source.population || 0) / 1000) * sourceEducation * (0.25 + sourceWealth) * 0.03;
    const flow = sourcePool * attraction * connection * (0.35 + u.selectivity * 0.35) * years;
    if (flow < 0.02) continue;
    u.annualStudentFlows[source.id] = flow;
    foreignStudents += flow;
    const retention = clamp(0.08 + state.patronage.talentAttraction * 0.18 + u.prestige * 0.1 - sourceWealth * 0.06, 0.04, 0.38);
    const retained = flow * retention;
    const returned = flow - retained;
    brainGain += retained;
    sourceState.university.brainDrainPressure = clamp(sourceState.university.brainDrainPressure * 0.92 + retained / Math.max(20, sourcePool * 15));
    const hostPolity = polityIdFor(region);
    sourceState.university.foreignAffinity[hostPolity] = clamp((sourceState.university.foreignAffinity[hostPolity] || 0) + returned * u.prestige * 0.0015);
    sourceState.talent.returningScholars += returned;
    sourceState.patronage.knowledgeProduction = clamp(sourceState.patronage.knowledgeProduction + returned * universityQuality(region) * 0.0008);
    maybeNotableAlumnus(region, source, state, flow, currentTick, rng, events);
  }
  u.foreignStudents += (foreignStudents - u.foreignStudents) * clamp(years * 0.2);
  u.brainGain += (brainGain - u.brainGain) * clamp(years * 0.2);
  state.talent.retainedForeignTalent += brainGain;
  state.talent.pool = Math.max(0, state.talent.pool * Math.pow(0.985, years) + brainGain + state.patronage.knowledgeProduction * 0.5 * years);
  const ci = ensureCounterIntelligence(region);
  const defence = clamp((ci.credentialSecurity + ci.codePractice + ci.verificationCaution) / 3);
  u.espionageExposure += (clamp(u.prestige * u.internationalShare * (0.65 + u.eliteClosure * 0.35) * (1 - defence * 0.55)) - u.espionageExposure) * clamp(years * 0.1);
  if (u.espionageExposure > 0.28 && rng() < years * u.espionageExposure * 0.015) {
    events.push({ type: 'university_foreign_influence_concern', regionId: region.id, polityId: polityIdFor(region), exposure: u.espionageExposure });
  }
}

export function tickRenaissanceNetworks(regions, polities, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const world = options.worldState || (regions[0] && (regions[0].renaissanceWorld ||= { elapsedDays: 0 }));
  if (!world) return [];
  world.elapsedDays = Math.max(0, Number(world.elapsedDays) || 0) + Math.max(0, Number(elapsedDays) || 0);
  if (world.elapsedDays < DAYS_PER_YEAR) return [];
  const years = world.elapsedDays / DAYS_PER_YEAR;
  world.elapsedDays = 0;
  const byId = new Map((regions || []).map((r) => [r.id, r]));
  const polityMap = new Map((polities || []).map((p) => [p.id, p]));
  const events = [];

  for (const region of regions || []) {
    const state = ensureRenaissanceState(region);
    state._currentTick = currentTick;
    const polity = polityMap.get(polityIdFor(region)) || null;
    updatePatronage(region, polity, state, years);
  }
  for (const region of regions || []) {
    const state = ensureRenaissanceState(region);
    const polity = polityMap.get(polityIdFor(region)) || null;
    updatePrinting(region, polity, state, byId, years, currentTick, rng, events);
    updateUniversityBase(region, polity, state, years);
  }
  const prestigeLeaders = (regions || [])
    .filter((r) => ensureMedievalCompletionState(r).university.founded)
    .sort((a, b) => (ensureRenaissanceState(b).university.prestige || 0) - (ensureRenaissanceState(a).university.prestige || 0))
    .slice(0, 12);
  for (const region of regions || []) updateUniversityFlows(region, ensureRenaissanceState(region), byId, prestigeLeaders, years, currentTick, rng, events);

  for (const region of regions || []) {
    const state = ensureRenaissanceState(region);
    delete state._currentTick;
    region.informationVelocity = state.printing.informationVelocity;
    region.knowledgeProduction = clamp((region.knowledgeProduction || 0) * 0.7 + state.patronage.knowledgeProduction * 0.3);
  }
  return events.filter((event) => !options.playerPolityId || event.polityId === options.playerPolityId || event.type === 'printing_established');
}
