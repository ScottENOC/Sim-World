const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

const FACTION_IDS = ['bureaucratic', 'landed', 'provincial', 'clerical', 'urban'];
const OFFICE_SPECS = Object.freeze({
  steward: { minimum: () => true, affinities: { bureaucratic: 0.34, landed: 0.18, provincial: 0.24, clerical: 0.12, urban: 0.12 } },
  treasurer: { minimum: (a) => (a.accounting || 0) >= 0.12, affinities: { bureaucratic: 0.42, urban: 0.32, landed: 0.08, provincial: 0.1, clerical: 0.08 } },
  chancellor: { minimum: (a) => (a.recordKeeping || 0) >= 0.15 || a.breakthroughs?.has?.('writing'), affinities: { bureaucratic: 0.45, clerical: 0.28, urban: 0.12, landed: 0.05, provincial: 0.1 } },
  marshal: { minimum: (_a, n) => n > 1, affinities: { landed: 0.42, provincial: 0.28, bureaucratic: 0.08, clerical: 0.08, urban: 0.14 } },
  justiciar: { minimum: (a) => (a.officialdom || 0) >= 0.25, affinities: { bureaucratic: 0.45, landed: 0.16, provincial: 0.16, clerical: 0.14, urban: 0.09 } },
  chamberlain: { minimum: (a) => (a.legitimacy || 0) >= 0.35, affinities: { landed: 0.28, clerical: 0.24, bureaucratic: 0.2, provincial: 0.16, urban: 0.12 } },
});

function stableFraction(text) {
  let hash = 2166136261;
  for (const c of String(text)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967295;
}

function average(values) {
  return values.length ? values.reduce((sum, v) => sum + (Number(v) || 0), 0) / values.length : 0;
}

function ensureFaction(state, id) {
  state.factions[id] ||= { id, power: 0.1, satisfaction: 0.5, officesHeld: 0, grievance: 0, excludedYears: 0 };
  return state.factions[id];
}

export function ensureStateAdministrationElitePolitics(polity) {
  polity.stateAdministration ||= {};
  const state = polity.stateAdministration;
  state.version = 2;
  state.offices ||= {};
  state.factions ||= {};
  state.provinces ||= {};
  state.court ||= {};
  state.nextOfficialOrdinal = Math.max(1, Number(state.nextOfficialOrdinal) || 1);
  for (const id of FACTION_IDS) ensureFaction(state, id);
  for (const [key, initial] of Object.entries({
    factionalism: 0, patronagePressure: 0, corruptionPressure: 0,
    administrativeOverstretch: 0, centralisationDrive: 0, meritShare: 0.5,
  })) if (!Number.isFinite(state.court[key])) state.court[key] = initial;
  if (!Number.isFinite(state.lastFactionPressureTick)) state.lastFactionPressureTick = -Infinity;
  return state;
}

function regionSignals(region) {
  const society = region.medievalSociety || {};
  const politics = region.medievalPolitics || {};
  const governance = region.governance || {};
  const urban = society.urban || {};
  const estates = society.estates || {};
  const education = society.education || {};
  const trade = Math.max(0, Number(region.tradeEconomy?.weeklyExports) || 0) + Math.max(0, Number(region.tradeEconomy?.weeklyImports) || 0);
  const religiousShare = Math.max(0, ...Object.values(region.religion?.shares || {}).map((v) => Number(v) || 0));
  return {
    bureaucratic: clamp((education.examinationService || 0) * 0.38 + (education.courtSchools || 0) * 0.22 + (governance.administrativeControl || 0) * 0.2 + (society.paths?.bureaucraticService || 0) * 0.2),
    landed: clamp((estates.hereditaryPower || 0) * 0.38 + (estates.privateRetinues || 0) * 0.3 + (estates.eliteLandShare || 0) * 0.22 + (society.paths?.landedRetinues || 0) * 0.1),
    provincial: clamp((politics.eliteOrganisation || 0) * 0.28 + (politics.localFiscalCapacity || 0) * 0.22 + (governance.autonomy || 0) * 0.3 + (politics.localIdentity || 0) * 0.2),
    clerical: clamp(religiousShare * 0.45 + (region.religiousSeatInfluence || 0) * 0.25 + (education.religiousSchools || 0) * 0.3),
    urban: clamp((urban.guilds || 0) * 0.3 + (urban.council || 0) * 0.28 + Math.log1p(trade) / 14 * 0.28 + (education.urbanAcademies || 0) * 0.14),
  };
}

function updateFactionPower(polity, territories, state, years) {
  const admin = polity.administration || {};
  const local = territories.map(regionSignals);
  const targets = {
    bureaucratic: clamp(average(local.map((s) => s.bureaucratic)) * 0.55 + (admin.officialdom || 0) * 0.25 + (admin.recordKeeping || 0) * 0.2),
    landed: clamp(average(local.map((s) => s.landed)) * 0.82 + (1 - (admin.officialdom || 0)) * 0.08),
    provincial: clamp(average(local.map((s) => s.provincial)) * 0.88 + Math.max(0, territories.length - 1) / 10 * 0.12),
    clerical: clamp(average(local.map((s) => s.clerical)) * 0.9),
    urban: clamp(average(local.map((s) => s.urban)) * 0.9 + (admin.accounting || 0) * 0.1),
  };
  const rate = clamp(years * 0.35);
  for (const id of FACTION_IDS) {
    const faction = ensureFaction(state, id);
    faction.power = clamp(faction.power + (targets[id] - faction.power) * rate);
  }
}

function officeCompetence(polity, role, factionId, ordinal) {
  const admin = polity.administration || {};
  const domain = role === 'treasurer' ? (admin.accounting || 0) :
    role === 'chancellor' ? (admin.recordKeeping || 0) :
    role === 'marshal' ? clamp(((polity.institutionalPaths?.landedRetinues || 0) + (polity.institutionalPaths?.clanRetinues || 0)) / 2) :
    role === 'justiciar' ? (admin.officialdom || 0) :
    clamp(((admin.officialdom || 0) + (admin.delegation || 0)) / 2);
  const factionBonus = factionId === 'bureaucratic' ? 0.08 : factionId === 'urban' && role === 'treasurer' ? 0.08 : factionId === 'landed' && role === 'marshal' ? 0.1 : 0;
  return clamp(0.28 + domain * 0.52 + factionBonus + stableFraction(`${polity.id}:${role}:${ordinal}`) * 0.14, 0.2, 0.96);
}

function chooseFactionForOffice(state, role, rng) {
  const affinities = OFFICE_SPECS[role]?.affinities || {};
  const weighted = FACTION_IDS.map((id) => {
    const faction = ensureFaction(state, id);
    const underRepresentation = 1 / (1 + faction.officesHeld * 0.65);
    const dissatisfaction = 0.7 + (1 - faction.satisfaction) * 0.7;
    return { id, weight: Math.max(0.001, (affinities[id] || 0.05) * (0.2 + faction.power) * underRepresentation * dissatisfaction) };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = (rng?.() ?? Math.random()) * total;
  for (const item of weighted) {
    pick -= item.weight;
    if (pick <= 0) return item.id;
  }
  return weighted[weighted.length - 1].id;
}

function appointOffice(polity, state, role, currentTick, rng) {
  const factionId = chooseFactionForOffice(state, role, rng);
  const ordinal = state.nextOfficialOrdinal++;
  const admin = polity.administration || {};
  const merit = clamp(((admin.officialdom || 0) + (admin.recordKeeping || 0) + (admin.accounting || 0)) / 3);
  const patronage = clamp((1 - merit) * 0.55 + state.court.patronagePressure * 0.35 + ensureFaction(state, factionId).power * 0.1);
  const office = {
    role,
    holderId: `${polity.id}:official:${ordinal}`,
    patronFactionId: factionId,
    appointedTick: currentTick,
    tenureYears: 0,
    competence: officeCompetence(polity, role, factionId, ordinal),
    loyalty: clamp(0.42 + (admin.legitimacy || 0) * 0.32 + ensureFaction(state, factionId).satisfaction * 0.16 + stableFraction(`${polity.id}:loyalty:${ordinal}`) * 0.1),
    corruption: clamp(0.08 + patronage * 0.38 + (1 - (admin.accounting || 0)) * 0.16 + (1 - (admin.recordKeeping || 0)) * 0.12),
    patronage,
  };
  state.offices[role] = office;
  return office;
}

function activeOfficeRoles(polity, territoryCount) {
  const admin = polity.administration || {};
  return Object.entries(OFFICE_SPECS).filter(([, spec]) => spec.minimum(admin, territoryCount)).map(([role]) => role);
}

function updateOffices(polity, state, territoryCount, currentTick, years, rng) {
  const required = new Set(activeOfficeRoles(polity, territoryCount));
  for (const faction of Object.values(state.factions)) faction.officesHeld = 0;

  for (const [role, office] of Object.entries(state.offices)) {
    if (!required.has(role)) { delete state.offices[role]; continue; }
    office.tenureYears = Math.max(0, Number(office.tenureYears) || 0) + years;
    const faction = ensureFaction(state, office.patronFactionId || 'bureaucratic');
    office.loyalty = clamp(office.loyalty + (((polity.administration?.legitimacy || 0) * 0.55 + faction.satisfaction * 0.45) - office.loyalty) * clamp(years * 0.08));
    const oversight = clamp(((polity.administration?.accounting || 0) + (polity.administration?.recordKeeping || 0)) / 2);
    const corruptionTarget = clamp(0.08 + office.patronage * 0.42 + state.court.patronagePressure * 0.22 - oversight * 0.2);
    office.corruption = clamp(office.corruption + (corruptionTarget - office.corruption) * clamp(years * 0.12));
    const turnoverChance = office.loyalty < 0.18 ? clamp(years * 0.5) : office.tenureYears > 18 ? clamp(years * 0.08) : 0;
    if (turnoverChance > 0 && (rng?.() ?? Math.random()) < turnoverChance) {
      delete state.offices[role];
      continue;
    }
    faction.officesHeld += 1;
  }

  for (const role of required) {
    if (!state.offices[role]) {
      const office = appointOffice(polity, state, role, currentTick, rng);
      ensureFaction(state, office.patronFactionId).officesHeld += 1;
    }
  }
}

function updateFactionSatisfaction(polity, territories, state, years) {
  const offices = Object.values(state.offices);
  const totalOfficeInfluence = Math.max(1, offices.length);
  const avgAutonomy = average(territories.filter((r) => r.id !== polity.capitalRegionId).map((r) => r.governance?.autonomy || 0));
  const avgTaxExemption = average(territories.map((r) => r.medievalSociety?.estates?.taxExemption || 0));
  const avgUrbanCouncil = average(territories.map((r) => r.medievalSociety?.urban?.council || 0));
  const religiousAlignment = average(territories.map((r) => r.religion?.stateReligionId ? 1 : 0));
  const admin = polity.administration || {};

  const preference = {
    bureaucratic: clamp((admin.officialdom || 0) * 0.35 + (admin.recordKeeping || 0) * 0.25 + state.court.meritShare * 0.4),
    landed: clamp(avgTaxExemption * 0.45 + avgAutonomy * 0.3 + (polity.institutionalPaths?.landedRetinues || 0) * 0.25),
    provincial: clamp(avgAutonomy * 0.55 + (admin.delegation || 0) * 0.25 + (1 - state.court.centralisationDrive) * 0.2),
    clerical: clamp(religiousAlignment * 0.5 + average(territories.map((r) => r.medievalSociety?.education?.religiousSchools || 0)) * 0.5),
    urban: clamp(avgUrbanCouncil * 0.35 + (admin.accounting || 0) * 0.3 + (1 - state.court.corruptionPressure) * 0.35),
  };

  for (const id of FACTION_IDS) {
    const faction = ensureFaction(state, id);
    const officeShare = faction.officesHeld / totalOfficeInfluence;
    const powerTotal = FACTION_IDS.reduce((sum, key) => sum + ensureFaction(state, key).power, 0) || 1;
    const expectedShare = faction.power / powerTotal;
    const representation = clamp(0.5 + (officeShare - expectedShare) * 1.8);
    const target = clamp(preference[id] * 0.58 + representation * 0.42);
    faction.satisfaction = clamp(faction.satisfaction + (target - faction.satisfaction) * clamp(years * 0.24));
    faction.grievance = clamp((1 - faction.satisfaction) * (0.35 + faction.power * 0.65));
    if (faction.power > 0.35 && faction.officesHeld === 0) faction.excludedYears += years;
    else faction.excludedYears = Math.max(0, faction.excludedYears - years * 0.6);
  }
}

function updateCourt(polity, territories, state) {
  const admin = polity.administration || {};
  const factions = FACTION_IDS.map((id) => ensureFaction(state, id));
  const powerful = factions.filter((f) => f.power >= 0.3).length;
  const officeCount = Object.keys(state.offices).length;
  const weightedGrievance = average(factions.map((f) => f.grievance * (0.4 + f.power * 0.6)));
  const avgOfficeCorruption = average(Object.values(state.offices).map((o) => o.corruption));
  const avgOfficeCompetence = average(Object.values(state.offices).map((o) => o.competence));
  const subjects = territories.filter((r) => r.id !== polity.capitalRegionId);
  const avgControl = average(subjects.map((r) => r.governance?.administrativeControl || 0));
  const avgAutonomy = average(subjects.map((r) => r.governance?.autonomy || 0));
  const capacity = 1.5 + (admin.officialdom || 0) * 5 + (admin.delegation || 0) * 4 + (admin.recordKeeping || 0) * 3 + (admin.communications || 0) * 2;
  const load = subjects.length * (1 + avgAutonomy * 0.55) * (1.15 - avgControl * 0.35);

  state.court.meritShare = clamp((admin.officialdom || 0) * 0.38 + (admin.recordKeeping || 0) * 0.25 + (admin.accounting || 0) * 0.2 + (territories.some((r) => (r.medievalSociety?.education?.examinationService || 0) > 0.3) ? 0.17 : 0));
  state.court.patronagePressure = clamp((powerful - officeCount * 0.7) / 5 + weightedGrievance * 0.7 + (1 - state.court.meritShare) * 0.25);
  state.court.factionalism = clamp(weightedGrievance * 0.78 + state.court.patronagePressure * 0.22);
  state.court.corruptionPressure = clamp(avgOfficeCorruption * 0.58 + state.court.patronagePressure * 0.26 + (1 - avgOfficeCompetence) * 0.16);
  state.court.administrativeOverstretch = clamp(load / Math.max(1, capacity) - 0.55, 0, 1);
  state.court.centralisationDrive = clamp((admin.officialdom || 0) * 0.32 + (admin.legitimacy || 0) * 0.24 + ensureFaction(state, 'bureaucratic').power * 0.18 + (1 - avgAutonomy) * 0.18 - state.court.administrativeOverstretch * 0.18);
}

function officeOversightBonus(state) {
  const treasurer = state.offices.treasurer?.competence || 0;
  const chancellor = state.offices.chancellor?.competence || 0;
  const justiciar = state.offices.justiciar?.competence || 0;
  return clamp(treasurer * 0.35 + chancellor * 0.35 + justiciar * 0.3);
}

function updateProvince(polity, region, state, years) {
  if (region.id === polity.capitalRegionId || !region.governance) return;
  const admin = polity.administration || {};
  const province = state.provinces[region.id] ||= {
    regionId: region.id,
    governorId: null,
    governorTenureYears: 0,
    localEntrenchment: 0,
    oversight: 0,
    localPower: 0,
  };
  const governorId = region.governance.governor?.id || region.governance.governorId || null;
  if (province.governorId !== governorId) {
    province.governorId = governorId;
    province.governorTenureYears = 0;
    province.localEntrenchment *= 0.45;
  } else province.governorTenureYears += years;

  const local = regionSignals(region);
  const officeBonus = officeOversightBonus(state);
  province.oversight = clamp((admin.accounting || 0) * 0.22 + (admin.recordKeeping || 0) * 0.2 + (admin.communications || 0) * 0.18 + (region.governance.administrativeControl || 0) * 0.18 + officeBonus * 0.22);
  province.localPower = clamp(local.provincial * 0.45 + local.landed * 0.25 + (region.governance.autonomy || 0) * 0.2 + Math.min(1, province.governorTenureYears / 20) * 0.1);
  const entrenchmentTarget = clamp(province.localPower * (1 - province.oversight) * 1.15 + Math.min(0.25, province.governorTenureYears / 80));
  province.localEntrenchment = clamp(province.localEntrenchment + (entrenchmentTarget - province.localEntrenchment) * clamp(years * 0.16));

  const appointmentFriction = region.governance.governor?.type === 'royal_governor'
    ? clamp(local.provincial * state.court.centralisationDrive * (1 - (region.governance.governor?.localLegitimacy || 0.35)))
    : 0;
  region.governance.elitePoliticsCorruptionDelta = clamp(state.court.corruptionPressure * 0.16 + province.localEntrenchment * 0.2 - province.oversight * 0.09, -0.08, 0.24);
  region.governance.elitePoliticsControlMultiplier = clamp(1 - state.court.administrativeOverstretch * 0.18 - province.localEntrenchment * 0.22 + province.oversight * 0.12, 0.62, 1.08);
  region.governance.elitePoliticsGrievance = clamp(appointmentFriction * 0.18 + province.localEntrenchment * 0.08 + state.court.factionalism * 0.05);

  if (region.governance.governor) {
    const loyaltyTarget = clamp((admin.legitimacy || 0) * 0.42 + province.oversight * 0.22 + (1 - province.localEntrenchment) * 0.16 + (region.governance.governor.localLegitimacy || 0.4) * 0.2);
    region.governance.governor.loyalty = clamp((region.governance.governor.loyalty ?? 0.5) + (loyaltyTarget - (region.governance.governor.loyalty ?? 0.5)) * clamp(years * 0.12));
  }
}

function administrativeConsequences(polity, state, years) {
  const admin = polity.administration || {};
  const offices = Object.values(state.offices);
  const competence = average(offices.map((o) => o.competence));
  const loyalty = average(offices.map((o) => o.loyalty));
  const corruption = state.court.corruptionPressure;
  const factionalism = state.court.factionalism;
  if (admin.experience) {
    admin.experience.officialdom = Math.max(0, (admin.experience.officialdom || 0) + competence * (1 - corruption) * years * 5);
    admin.experience.recordKeeping = Math.max(0, (admin.experience.recordKeeping || 0) + (state.offices.chancellor?.competence || 0) * years * 4);
    admin.experience.accounting = Math.max(0, (admin.experience.accounting || 0) + (state.offices.treasurer?.competence || 0) * years * 4);
    admin.experience.delegation = Math.max(0, (admin.experience.delegation || 0) + (state.offices.steward?.competence || 0) * years * 2.5);
  }
  const legitimacyDelta = (loyalty - 0.5) * 0.008 * years - factionalism * 0.006 * years - state.court.administrativeOverstretch * 0.004 * years;
  admin.legitimacy = clamp((admin.legitimacy || 0) + legitimacyDelta);
}

function maybeFactionPressureEvent(polity, state, currentTick, years, rng, options) {
  if (currentTick - state.lastFactionPressureTick < 260) return null;
  const faction = FACTION_IDS.map((id) => ensureFaction(state, id))
    .filter((f) => f.power >= 0.45 && f.grievance >= 0.42)
    .sort((a, b) => b.grievance * b.power - a.grievance * a.power)[0];
  if (!faction) return null;
  const annualChance = clamp(0.03 + faction.power * faction.grievance * 0.12, 0, 0.16);
  if ((rng?.() ?? Math.random()) >= 1 - Math.pow(1 - annualChance, Math.max(0.001, years))) return null;
  state.lastFactionPressureTick = currentTick;
  const event = {
    type: 'elite_faction_pressure', polityId: polity.id, polityName: polity.name,
    factionId: faction.id, power: faction.power, grievance: faction.grievance,
  };
  const concede = () => {
    faction.satisfaction = clamp(faction.satisfaction + 0.18);
    faction.grievance *= 0.7;
    state.court.patronagePressure = clamp(state.court.patronagePressure + 0.08);
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.01);
    return { conceded: true };
  };
  const resist = () => {
    faction.satisfaction = clamp(faction.satisfaction - 0.1);
    faction.grievance = clamp(faction.grievance + 0.08);
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.025);
    return { conceded: false };
  };
  if (polity.id === options?.playerPolityId) event.resolveDecision = (choice) => choice === 'concede' ? concede() : resist();
  else if ((polity.administration?.legitimacy || 0) < 0.48 || faction.power > 0.66) {
    concede(); event.npcResolution = 'conceded';
  } else {
    resist(); event.npcResolution = 'resisted';
  }
  return event;
}

export function successionEliteModifier(polity, claimantKind) {
  const state = ensureStateAdministrationElitePolitics(polity);
  if (claimantKind === 'designated_heir') {
    const bureaucrats = ensureFaction(state, 'bureaucratic');
    const clerics = ensureFaction(state, 'clerical');
    return clamp(0.82 + bureaucrats.power * bureaucrats.satisfaction * 0.3 + clerics.power * clerics.satisfaction * 0.12, 0.75, 1.18);
  }
  if (claimantKind === 'military_elite') {
    const landed = ensureFaction(state, 'landed');
    return clamp(0.82 + landed.power * (1.15 - landed.satisfaction) * 0.42, 0.75, 1.2);
  }
  const provincial = ensureFaction(state, 'provincial');
  return clamp(0.8 + provincial.power * (1.2 - provincial.satisfaction) * 0.45, 0.72, 1.22);
}

export function tickStateAdministrationElitePolitics(polity, territories, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const state = ensureStateAdministrationElitePolitics(polity);
  updateFactionPower(polity, territories, state, years);
  updateCourt(polity, territories, state);
  updateOffices(polity, state, territories.length, currentTick, years, rng);
  updateFactionSatisfaction(polity, territories, state, years);
  updateCourt(polity, territories, state);
  for (const region of territories) updateProvince(polity, region, state, years);
  administrativeConsequences(polity, state, years);
  const event = maybeFactionPressureEvent(polity, state, currentTick, years, rng, options);
  return event ? [event] : [];
}
