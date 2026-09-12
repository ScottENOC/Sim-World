const DAYS_PER_YEAR = 365.2425;
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function authorityFor(world, id) { return (world.authorities || []).find((a) => a.id === id && a.active !== false) || null; }
function polityById(polities, id) { return (polities || []).find((p) => p.id === id) || null; }

export function ensureReligiousPoliticalState(authority) {
  authority.politics ||= {};
  const p = authority.politics;
  p.recognisedRulers ||= {};
  p.sanctions ||= {};
  p.councils ||= [];
  p.peaceCalls ||= [];
  p.holyWarCalls ||= [];
  p.appointmentConflicts ||= {};
  if (!Number.isFinite(p.centralAppointmentPower)) p.centralAppointmentPower = 0.25;
  if (!Number.isFinite(p.temporalIndependence)) p.temporalIndependence = authority.autonomy || 0.5;
  return p;
}

export function recogniseRuler(world, authorityId, polityId, polities) {
  const authority = authorityFor(world, authorityId);
  const polity = polityById(polities, polityId);
  if (!authority || !polity) return { changed: false, reason: 'invalid_actor' };
  const p = ensureReligiousPoliticalState(authority);
  p.recognisedRulers[polityId] = true;
  const influence = clamp(authority.influenceByPolity?.[polityId] || 0);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.025 + influence * 0.04);
  authority.treasury = Math.max(0, (authority.treasury || 0) - 2);
  return { changed: true, legitimacyGain: 0.025 + influence * 0.04 };
}

export function imposeReligiousSanction(world, authorityId, polityId, polities, severity = 0.5) {
  const authority = authorityFor(world, authorityId);
  const polity = polityById(polities, polityId);
  if (!authority || !polity) return { changed: false, reason: 'invalid_actor' };
  const influence = clamp(authority.influenceByPolity?.[polityId] || 0);
  if (influence < 0.18) return { changed: false, reason: 'insufficient_influence' };
  const p = ensureReligiousPoliticalState(authority);
  const level = clamp(severity, 0.15, 1);
  p.sanctions[polityId] = { level, active: true };
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - influence * level * 0.08);
  return { changed: true, influence, level };
}

export function liftReligiousSanction(world, authorityId, polityId) {
  const authority = authorityFor(world, authorityId);
  const p = authority ? ensureReligiousPoliticalState(authority) : null;
  if (!p?.sanctions?.[polityId]?.active) return { changed: false, reason: 'no_active_sanction' };
  p.sanctions[polityId].active = false;
  return { changed: true };
}

export function callReligiousCouncil(world, authorityId, issue, currentTick) {
  const authority = authorityFor(world, authorityId);
  if (!authority) return { changed: false, reason: 'invalid_authority' };
  const p = ensureReligiousPoliticalState(authority);
  const council = { id: `${authority.id}:council:${p.councils.length + 1}`, issue, calledTick: currentTick, authorityAtCall: authority.diplomaticInfluence || 0, resolved: false };
  p.councils.push(council);
  return { changed: true, council };
}

export function rulerAttemptsClericalControl(world, authorityId, polityId, polities, strength = 0.5) {
  const authority = authorityFor(world, authorityId);
  const polity = polityById(polities, polityId);
  if (!authority || !polity) return { changed: false, reason: 'invalid_actor' };
  const p = ensureReligiousPoliticalState(authority);
  const pressure = clamp(strength) * clamp(polity.administration?.officialdom || 0);
  const resistance = clamp((authority.diplomaticInfluence || 0) * 0.45 + p.centralAppointmentPower * 0.35 + p.temporalIndependence * 0.2);
  p.appointmentConflicts[polityId] = { pressure, resistance, active: true };
  if (pressure > resistance) {
    p.centralAppointmentPower = clamp(p.centralAppointmentPower - (pressure - resistance) * 0.08);
    polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.01);
    return { changed: true, outcome: 'ruler_gain' };
  }
  authority.diplomaticInfluence = clamp((authority.diplomaticInfluence || 0) + 0.015);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.015);
  return { changed: true, outcome: 'authority_resists' };
}

export function callReligiousPeace(world, authorityId, polityIds, currentTick) {
  const authority = authorityFor(world, authorityId);
  if (!authority || (authority.diplomaticInfluence || 0) < 0.3) return { changed: false, reason: 'insufficient_authority' };
  const p = ensureReligiousPoliticalState(authority);
  const call = { polityIds: [...new Set(polityIds)], tick: currentTick, strength: clamp(authority.diplomaticInfluence || 0), active: true };
  p.peaceCalls.push(call);
  return { changed: true, call };
}

export function callHolyWar(world, authorityId, targetPolityId, memberPolityIds, currentTick) {
  const authority = authorityFor(world, authorityId);
  if (!authority || (authority.diplomaticInfluence || 0) < 0.42) return { changed: false, reason: 'insufficient_authority' };
  const p = ensureReligiousPoliticalState(authority);
  const call = { targetPolityId, memberPolityIds: [...new Set(memberPolityIds)], tick: currentTick, strength: clamp(authority.diplomaticInfluence || 0), active: true };
  p.holyWarCalls.push(call);
  return { changed: true, call };
}

export function tickReligiousPolitics(world, polities, currentTick, elapsedDays = 30) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR);
  const events = [];
  for (const authority of world.authorities || []) {
    if (authority.active === false) continue;
    const p = ensureReligiousPoliticalState(authority);
    const transnational = Object.values(authority.influenceByPolity || {}).filter((v) => Number(v) > 0.08).length;
    const targetAppointment = clamp(0.18 + (authority.diplomaticInfluence || 0) * 0.45 + Math.min(0.25, transnational * 0.04));
    p.centralAppointmentPower += (targetAppointment - p.centralAppointmentPower) * clamp(years * 0.08);
    p.temporalIndependence += (clamp((authority.autonomy || 0) * 0.55 + (authority.territorialShare || 0) * 4 + (authority.diplomaticInfluence || 0) * 0.22) - p.temporalIndependence) * clamp(years * 0.06);
    for (const [polityId, sanction] of Object.entries(p.sanctions)) {
      if (!sanction?.active) continue;
      const polity = polityById(polities, polityId);
      const influence = clamp(authority.influenceByPolity?.[polityId] || 0);
      if (!polity || influence < 0.06) { sanction.active = false; continue; }
      polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - influence * sanction.level * years * 0.01);
    }
    for (const council of p.councils) {
      if (council.resolved || currentTick - council.calledTick < 26) continue;
      council.resolved = true;
      council.outcomeStrength = clamp((authority.diplomaticInfluence || 0) * 0.5 + p.centralAppointmentPower * 0.3 + p.temporalIndependence * 0.2);
      authority.diplomaticInfluence = clamp((authority.diplomaticInfluence || 0) + (council.outcomeStrength - 0.5) * 0.03);
      events.push({ type: 'religious_council_resolved', authorityId: authority.id, council });
    }
  }
  return events;
}
