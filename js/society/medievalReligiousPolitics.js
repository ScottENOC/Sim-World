const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function ensureSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }
function chanceForYears(annualChance, years) { return 1 - Math.pow(1 - clamp(annualChance), Math.max(0, years)); }
function actorId(region) { return region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id; }

function followerShareInPolity(religionId, polityId, regions) {
  let followers = 0, pop = 0;
  for (const region of regions) {
    if (actorId(region) !== polityId) continue;
    const p = Math.max(0, region.population || 0); pop += p;
    followers += p * Math.max(0, region.religion?.shares?.[religionId] || 0);
  }
  return pop > 0 ? followers / pop : 0;
}

function followersInPolity(religionId, polityId, regions) {
  let followers = 0;
  for (const region of regions) if (actorId(region) === polityId) followers += Math.max(0, region.population || 0) * Math.max(0, region.religion?.shares?.[religionId] || 0);
  return followers;
}

function polityRegions(polityId, regions) { return regions.filter(region => actorId(region) === polityId); }
function authoritySeatPlace(authority, regions) {
  const seat = regions.find(region => region.id === authority.seatRegionId);
  const place = seat?.subregionalControl?.places?.find?.(candidate => candidate.id === authority.seatPlaceId) ||
    seat?.subregional?.places?.find?.(candidate => candidate.id === authority.seatPlaceId) || null;
  return { seat, place };
}

export function ensureAuthorityPolitics(authority) {
  authority.politics ||= {};
  const p = authority.politics;
  p.recognisedRulers = ensureSet(p.recognisedRulers);
  p.sanctionedPolities = ensureSet(p.sanctionedPolities);
  p.mediationHistory ||= [];
  p.councils ||= [];
  p.holyWarCalls ||= [];
  p.peaceCalls ||= [];
  p.appointmentInfluence ||= {};
  p.appointmentSettlements ||= {};
  p.investitureDisputes ||= {};
  p.propertyByPolity ||= {};
  p.taxExemptionByPolity ||= {};
  p.patronageByPolity ||= {};
  p.rivalAuthorityIds = ensureSet(p.rivalAuthorityIds);
  p.doctrinalDisputes ||= [];
  p.seatOccupation ||= { occupied: false, occupierActorId: null, sinceTick: null, yearsOccupied: 0 };
  p.lastCouncilTick ||= -Infinity;
  p.lastWarCallTick ||= -Infinity;
  p.lastPeaceCallTick ||= -Infinity;
  return p;
}

export function ensurePolityReligiousPolitics(polity) {
  polity.religiousPolitics ||= {};
  const p = polity.religiousPolitics;
  p.recognition ||= {};
  p.sanctions ||= {};
  p.appointmentControl ||= {};
  p.holyWarMandates ||= {};
  p.peacePressure ||= {};
  p.clericalPropertyShare ||= {};
  p.religiousTaxExemptions ||= {};
  p.investitureConflict ||= {};
  return p;
}

export function recogniseRuler(authority, polity, regions = []) {
  if (!authority || !polity) return { changed:false, reason:'invalid' };
  const p = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  if (p.recognisedRulers.has(polity.id)) return { changed:false, reason:'already_recognised' };
  p.recognisedRulers.add(polity.id); p.sanctionedPolities.delete(polity.id);
  const followers = followerShareInPolity(authority.religionId, polity.id, regions);
  state.recognition[authority.id] = clamp(0.45 + (authority.diplomaticInfluence || 0) * 0.4 + followers * 0.15);
  delete state.sanctions[authority.id];
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.02 + 0.035 * clamp(authority.diplomaticInfluence || 0) * Math.max(0.25, followers));
  return { changed:true, followers };
}

export function sanctionRuler(authority, polity, regions = []) {
  if (!authority || !polity) return { changed:false, reason:'invalid' };
  const p = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  p.sanctionedPolities.add(polity.id); p.recognisedRulers.delete(polity.id);
  const followers = followerShareInPolity(authority.religionId, polity.id, regions);
  state.sanctions[authority.id] = clamp(0.4 + (authority.diplomaticInfluence || 0) * 0.4 + followers * 0.2);
  delete state.recognition[authority.id];
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.025 - 0.045 * clamp(authority.diplomaticInfluence || 0) * Math.max(0.25, followers));
  return { changed:true, followers };
}

export function settleReligiousAppointments(authority, polity, mode = 'shared') {
  if (!authority || !polity || !['state','shared','authority','local'].includes(mode)) return { changed:false, reason:'invalid' };
  const politics = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  politics.appointmentSettlements[polity.id] = mode;
  state.appointmentControl[authority.id] = mode;
  politics.investitureDisputes[polity.id] = 0;
  state.investitureConflict[authority.id] = 0;
  return { changed:true, mode };
}

export function callReligiousCouncil(authority, religion, regions, currentTick, options = {}) {
  const p = ensureAuthorityPolitics(authority);
  const cost = 15 + (authority.influenceByPolity ? Object.keys(authority.influenceByPolity).length * 2 : 0);
  if ((authority.treasury || 0) < cost) return { changed:false, reason:'insufficient_treasury' };
  authority.treasury -= cost;
  const disputes = p.doctrinalDisputes.filter(dispute => dispute.active !== false);
  const cohesion = clamp((religion.authority || 0) * 0.4 + (authority.prestige || 0) * 0.32 + (authority.diplomaticInfluence || 0) * 0.28);
  const success = options.forceOutcome ?? (Math.random() < 0.45 + cohesion * 0.4 - disputes.length * 0.06);
  if (success) {
    religion.authority = clamp((religion.authority || 0) + 0.035);
    for (const dispute of disputes.slice(0, 2)) { dispute.active = false; dispute.resolvedTick = currentTick; dispute.outcome = 'settled'; }
    for (const region of regions) if ((region.religion?.shares?.[religion.id] || 0) > 0.2) region.religion.unrest = clamp((region.religion.unrest || 0) - 0.045);
  } else {
    religion.authority = clamp((religion.authority || 0) - 0.02);
    for (const region of regions) if ((region.religion?.shares?.[religion.id] || 0) > 0.25) region.religion.unrest = clamp((region.religion.unrest || 0) + 0.018);
    p.doctrinalDisputes.push({ id:`${authority.id}:council-failure:${currentTick}`, active:true, severity:0.3 + disputes.length * 0.05, startedTick:currentTick, source:'failed_council' });
  }
  p.councils.push({ tick:currentTick, cost, success, disputesConsidered:disputes.length });
  if (p.councils.length > 12) p.councils.shift();
  p.lastCouncilTick = currentTick;
  return { changed:true, cost, success };
}

function sameReligiousFamily(a, b) {
  if (!a || !b) return false;
  return a.id === b.id || (a.familyId && b.familyId && a.familyId === b.familyId) || a.parentId === b.id || b.parentId === a.id || (a.parentId && a.parentId === b.parentId);
}

function updateRivalAuthorities(authority, religion, authorities, religionById, years, events) {
  const p = ensureAuthorityPolitics(authority);
  for (const other of authorities) {
    if (other === authority || other.active === false) continue;
    const otherReligion = religionById.get(other.religionId);
    if (!sameReligiousFamily(religion, otherReligion)) continue;
    const overlap = Object.keys(authority.influenceByPolity || {}).filter(id => (other.influenceByPolity?.[id] || 0) > 0.12 && (authority.influenceByPolity?.[id] || 0) > 0.12).length;
    if (!overlap) continue;
    const firstRivalry = !p.rivalAuthorityIds.has(other.id);
    p.rivalAuthorityIds.add(other.id);
    const pressure = clamp(overlap / 5 + (other.prestige || 0) * 0.15);
    authority.prestige = clamp((authority.prestige || 0) - pressure * years * 0.002);
    if (firstRivalry) events.push({ type:'religious_authority_rivalry', authorityId:authority.id, rivalAuthorityId:other.id, religionId:religion.id, rivalReligionId:other.religionId });
  }
}

function updateReligiousProperty(authority, religion, polity, regions, years) {
  const politics = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  const followers = followerShareInPolity(religion.id, polity.id, regions);
  const influence = clamp(authority.influenceByPolity?.[polity.id] || 0);
  const recognised = politics.recognisedRulers.has(polity.id) ? 1 : 0;
  const sanctioned = politics.sanctionedPolities.has(polity.id) ? 1 : 0;
  const currentProperty = clamp(politics.propertyByPolity[polity.id] || 0, 0, 0.35);
  const target = clamp(followers * (0.04 + influence * 0.11 + recognised * 0.03) - sanctioned * 0.02, 0, 0.28);
  politics.propertyByPolity[polity.id] = clamp(currentProperty + (target - currentProperty) * clamp(years * 0.08), 0, 0.35);
  const exemptionTarget = clamp(politics.propertyByPolity[polity.id] * (0.35 + influence * 0.45), 0, 0.22);
  politics.taxExemptionByPolity[polity.id] = clamp((politics.taxExemptionByPolity[polity.id] || 0) + (exemptionTarget - (politics.taxExemptionByPolity[polity.id] || 0)) * clamp(years * 0.1), 0, 0.25);
  state.clericalPropertyShare[authority.id] = politics.propertyByPolity[polity.id];
  state.religiousTaxExemptions[authority.id] = politics.taxExemptionByPolity[polity.id];

  const territories = polityRegions(polity.id, regions);
  const annualRevenue = territories.reduce((sum, region) => sum + Math.max(0, region.militaryFinance?.weeklyTaxRevenue || region.militaryFinance?.revenueEma || 0) * 52, 0);
  const diverted = annualRevenue * politics.taxExemptionByPolity[polity.id] * 0.08 * years;
  authority.treasury = Math.max(0, (authority.treasury || 0) + diverted * 0.65);
  const capital = regions.find(region => region.id === polity.capitalRegionId) || territories[0];
  if (capital) capital.treasury = Math.max(0, (capital.treasury || 0) - diverted * 0.35);
}

function updateAppointmentConflict(authority, religion, polity, regions, years, rng, events, options) {
  const p = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  const influence = clamp(p.appointmentInfluence[polity.id] || 0);
  if (influence < 0.22) return;
  const mode = p.appointmentSettlements[polity.id] || 'local';
  const officialdom = clamp(polity.administration?.officialdom || 0);
  const stateControlPreference = clamp(officialdom * 0.5 + (polity.administration?.legitimacy || 0) * 0.3 + (polity.institutionalPaths?.bureaucraticService || 0) * 0.2);
  const religiousClaim = clamp(influence * 0.62 + followerShareInPolity(religion.id, polity.id, regions) * 0.38);
  let tension = mode === 'shared' ? Math.abs(stateControlPreference - religiousClaim) * 0.35 : mode === 'state' ? religiousClaim * 0.75 : mode === 'authority' ? stateControlPreference * 0.68 : Math.abs(stateControlPreference - religiousClaim) * 0.5;
  if (p.sanctionedPolities.has(polity.id)) tension += 0.12;
  const current = clamp(p.investitureDisputes[polity.id] || 0);
  p.investitureDisputes[polity.id] = clamp(current + (tension - current) * clamp(years * 0.22));
  state.investitureConflict[authority.id] = p.investitureDisputes[polity.id];
  if (p.investitureDisputes[polity.id] > 0.5) {
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - p.investitureDisputes[polity.id] * years * 0.004);
    for (const region of polityRegions(polity.id, regions)) if ((region.religion?.shares?.[religion.id] || 0) > 0.25) region.religion.unrest = clamp((region.religion.unrest || 0) + years * 0.003 * p.investitureDisputes[polity.id]);
  }
  if (p.investitureDisputes[polity.id] > 0.58 && rng() < chanceForYears(0.06 * p.investitureDisputes[polity.id], years)) {
    const event = { type:'religious_appointment_conflict', polityId:polity.id, authorityId:authority.id, religionId:religion.id, tension:p.investitureDisputes[polity.id] };
    if (polity.id === options.playerPolityId) event.resolveDecision = (choice) => settleReligiousAppointments(authority, polity, choice);
    else {
      const choice = stateControlPreference > religiousClaim + 0.2 ? 'state' : religiousClaim > stateControlPreference + 0.2 ? 'authority' : 'shared';
      event.npcResolution = settleReligiousAppointments(authority, polity, choice);
    }
    events.push(event);
  }
}

function updateSeatOccupation(authority, religion, regions, currentTick, years, events) {
  const p = ensureAuthorityPolitics(authority); const { seat, place } = authoritySeatPlace(authority, regions);
  if (!seat) return;
  const occupier = place && place.controllerActorId && place.controllerActorId !== authority.id ? place.controllerActorId : null;
  if (occupier) {
    if (!p.seatOccupation.occupied) {
      p.seatOccupation = { occupied:true, occupierActorId:occupier, sinceTick:currentTick, yearsOccupied:0 };
      events.push({ type:'religious_seat_occupied', authorityId:authority.id, religionId:religion.id, regionId:seat.id, occupierActorId:occupier });
    }
    p.seatOccupation.yearsOccupied += years;
    authority.prestige = clamp((authority.prestige || 0) - years * 0.012);
    authority.diplomaticInfluence = clamp((authority.diplomaticInfluence || 0) - years * 0.008);
    // Occupation does not destroy the transnational authority. If prolonged,
    // administration shifts to the strongest unoccupied follower region.
    if (p.seatOccupation.yearsOccupied > 2.5 && !p.seatOccupation.administrativeRefugeRegionId) {
      const candidates = regions.filter(region => region.id !== seat.id && (region.religion?.shares?.[religion.id] || 0) >= 0.3)
        .sort((a,b) => ((b.religion?.shares?.[religion.id] || 0) * (b.population || 0)) - ((a.religion?.shares?.[religion.id] || 0) * (a.population || 0)));
      if (candidates[0]) {
        p.seatOccupation.administrativeRefugeRegionId = candidates[0].id;
        events.push({ type:'religious_authority_relocated', authorityId:authority.id, religionId:religion.id, fromRegionId:seat.id, regionId:candidates[0].id });
      }
    }
  } else if (p.seatOccupation.occupied) {
    p.seatOccupation = { occupied:false, occupierActorId:null, sinceTick:null, yearsOccupied:0 };
    events.push({ type:'religious_seat_restored', authorityId:authority.id, religionId:religion.id, regionId:seat.id });
  }
}

function activeWarPairs(wars = []) {
  const pairs = [];
  for (const war of wars) {
    if (!war?.active) continue;
    for (const a of war.participants || []) for (const b of war.participants || []) {
      if (a.actorId >= b.actorId) continue;
      const hostile = a.stances?.[b.actorId] === 'hostile' || b.stances?.[a.actorId] === 'hostile' || a.sideId !== b.sideId;
      if (hostile) pairs.push([a.actorId,b.actorId,war]);
    }
  }
  return pairs;
}

function maybeIssueWarOrPeaceCall(authority, religion, polities, regions, currentTick, years, rng, events, options) {
  const p = ensureAuthorityPolitics(authority); const pairs = activeWarPairs(options.activeWars || []);
  if (!pairs.length) return;
  for (const [aId,bId,war] of pairs) {
    const a = polities.find(polity => polity.id === aId); const b = polities.find(polity => polity.id === bId);
    if (!a || !b) continue;
    const aFollowers = followerShareInPolity(religion.id,aId,regions); const bFollowers = followerShareInPolity(religion.id,bId,regions);
    const aInf = clamp(authority.influenceByPolity?.[aId] || 0); const bInf = clamp(authority.influenceByPolity?.[bId] || 0);
    const warKey = `${war.id}:${aId}:${bId}`;
    if (aFollowers > 0.35 && bFollowers > 0.35 && Math.min(aInf,bInf) > 0.2 && currentTick - p.lastPeaceCallTick > 26 && rng() < chanceForYears(0.09 * authority.diplomaticInfluence, years)) {
      const strength = clamp(authority.diplomaticInfluence * Math.min(aFollowers,bFollowers));
      for (const polity of [a,b]) {
        const state = ensurePolityReligiousPolitics(polity); const enemyId = polity.id === aId ? bId : aId;
        state.peacePressure[enemyId] = Math.max(state.peacePressure[enemyId] || 0, strength);
        polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - strength * 0.008);
      }
      p.peaceCalls.push({ tick:currentTick, warId:war.id, polityIds:[aId,bId], strength }); p.lastPeaceCallTick = currentTick;
      events.push({ type:'religious_peace_call', authorityId:authority.id, religionId:religion.id, warId:war.id, polityIds:[aId,bId], strength });
      continue;
    }
    const protectedPolity = aFollowers > 0.45 && aInf > 0.24 ? a : bFollowers > 0.45 && bInf > 0.24 ? b : null;
    const target = protectedPolity?.id === aId ? b : protectedPolity?.id === bId ? a : null;
    if (!protectedPolity || !target || currentTick - p.lastWarCallTick <= 52) continue;
    const targetFollowers = followerShareInPolity(religion.id,target.id,regions);
    if (targetFollowers > 0.18) continue; // not a generic licence for intra-faith warfare
    if (rng() < chanceForYears(0.045 * authority.diplomaticInfluence * aInf, years)) {
      const strength = clamp(authority.diplomaticInfluence * followerShareInPolity(religion.id,protectedPolity.id,regions));
      const state = ensurePolityReligiousPolitics(protectedPolity);
      state.holyWarMandates[target.id] = Math.max(state.holyWarMandates[target.id] || 0, strength);
      protectedPolity.administration.legitimacy = clamp((protectedPolity.administration.legitimacy || 0) + strength * 0.012);
      p.holyWarCalls.push({ tick:currentTick, warId:war.id, protectedPolityId:protectedPolity.id, targetPolityId:target.id, strength, key:warKey }); p.lastWarCallTick = currentTick;
      events.push({ type:'religious_war_call', authorityId:authority.id, religionId:religion.id, warId:war.id, polityId:protectedPolity.id, targetPolityId:target.id, strength });
    }
  }
}

function authorityIntervention(authority, religion, polity, regions, currentTick, rng, options) {
  const politics = ensureAuthorityPolitics(authority);
  const influence = clamp(authority.influenceByPolity?.[polity.id] || 0);
  const followers = followerShareInPolity(religion.id, polity.id, regions);
  if (followers < 0.18 || influence < 0.18) return null;
  const legitimacy = clamp(polity.administration?.legitimacy || 0.3);
  const successionContested = Boolean(polity.succession?.crisis?.contested);
  if (successionContested && !politics.recognisedRulers.has(polity.id) && rng() < 0.12 * influence) {
    const event = { type:'religious_ruler_recognition_offer', polityId:polity.id, religionId:religion.id, authorityId:authority.id, influence };
    if (polity.id === options.playerPolityId) event.resolveDecision = (choice)=> choice==='accept' ? recogniseRuler(authority, polity, regions) : { changed:false, declined:true };
    else event.npcResolution = recogniseRuler(authority, polity, regions);
    return event;
  }
  if (legitimacy < 0.32 && influence > 0.35 && !politics.sanctionedPolities.has(polity.id) && rng() < 0.035 * influence) {
    sanctionRuler(authority, polity, regions);
    return { type:'religious_ruler_sanction', polityId:polity.id, religionId:religion.id, authorityId:authority.id, influence };
  }
  return null;
}

function updatePersistentRecognition(authority, religion, polity, regions, years) {
  const politics = ensureAuthorityPolitics(authority); const state = ensurePolityReligiousPolitics(polity);
  const followers = followerShareInPolity(religion.id, polity.id, regions); const influence = clamp(authority.diplomaticInfluence || 0);
  if (politics.sanctionedPolities.has(polity.id)) {
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - followers * influence * years * 0.008);
    for (const region of polityRegions(polity.id,regions)) if ((region.religion?.shares?.[religion.id] || 0) > 0.35) region.religion.unrest = clamp((region.religion.unrest || 0) + years * followers * influence * 0.004);
    state.sanctions[authority.id] = clamp((state.sanctions[authority.id] || 0.5) + years * 0.01);
  }
  if (politics.recognisedRulers.has(polity.id)) {
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + followers * influence * years * 0.003);
    state.recognition[authority.id] = clamp((state.recognition[authority.id] || 0.5) + years * 0.006);
  }
}

export function tickMedievalReligiousPolitics(regions, religiousWorld, polities, currentTick, elapsedDays = 30, rng = Math.random, options = {}) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR); const events=[];
  const religions = religiousWorld?.religions || []; const authorities = religiousWorld?.authorities || [];
  const religionById = new Map(religions.map(r=>[r.id,r])); const polityById = new Map(polities.map(p=>[p.id,p]));
  for (const authority of authorities) {
    if (authority.active === false) continue;
    const religion = religionById.get(authority.religionId); if (!religion) continue;
    const politics = ensureAuthorityPolitics(authority);
    updateSeatOccupation(authority,religion,regions,currentTick,years,events);
    updateRivalAuthorities(authority,religion,authorities,religionById,years,events);
    for (const polityId of Object.keys(authority.influenceByPolity || {})) {
      const polity = polityById.get(polityId); if (!polity) continue;
      const event = authorityIntervention(authority,religion,polity,regions,currentTick,rng,options); if (event) events.push(event);
      updatePersistentRecognition(authority,religion,polity,regions,years);
      updateReligiousProperty(authority,religion,polity,regions,years);
      updateAppointmentConflict(authority,religion,polity,regions,years,rng,events,options);
    }
    // Appointment power grows from real follower networks, not a Christianity-specific rule.
    for (const polity of polities) {
      const share = followerShareInPolity(religion.id,polity.id,regions);
      const target = clamp(share * authority.diplomaticInfluence * 0.8);
      politics.appointmentInfluence[polity.id] = (politics.appointmentInfluence[polity.id] || 0) + (target - (politics.appointmentInfluence[polity.id] || 0)) * clamp(years * 0.25);
    }
    if (politics.doctrinalDisputes.some(dispute => dispute.active !== false) && currentTick - politics.lastCouncilTick > 260 && authority.treasury > 40 && rng() < chanceForYears(0.035 * authority.diplomaticInfluence,years)) {
      const result = callReligiousCouncil(authority,religion,regions,currentTick);
      if (result.changed) events.push({ type:'religious_council', authorityId:authority.id, religionId:religion.id, success:result.success });
    }
    maybeIssueWarOrPeaceCall(authority,religion,polities,regions,currentTick,years,rng,events,options);
  }
  return events;
}
