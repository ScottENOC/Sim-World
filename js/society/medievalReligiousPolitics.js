const DAYS_PER_YEAR = 365.2425;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function ensureSet(value) { return value instanceof Set ? value : new Set(Array.isArray(value) ? value : []); }

function followerShareInPolity(religionId, polityId, regions) {
  let followers = 0, pop = 0;
  for (const region of regions) {
    if ((region.governance?.sovereignPolityId || region.polityId) !== polityId) continue;
    const p = Math.max(0, region.population || 0); pop += p;
    followers += p * Math.max(0, region.religion?.shares?.[religionId] || 0);
  }
  return pop > 0 ? followers / pop : 0;
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
  return p;
}

export function recogniseRuler(authority, polity) {
  if (!authority || !polity) return { changed:false, reason:'invalid' };
  const p = ensureAuthorityPolitics(authority);
  if (p.recognisedRulers.has(polity.id)) return { changed:false, reason:'already_recognised' };
  p.recognisedRulers.add(polity.id); p.sanctionedPolities.delete(polity.id);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + 0.035 * clamp(authority.diplomaticInfluence || 0));
  return { changed:true };
}

export function sanctionRuler(authority, polity) {
  if (!authority || !polity) return { changed:false, reason:'invalid' };
  const p = ensureAuthorityPolitics(authority);
  p.sanctionedPolities.add(polity.id); p.recognisedRulers.delete(polity.id);
  polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - 0.045 * clamp(authority.diplomaticInfluence || 0));
  return { changed:true };
}

export function callReligiousCouncil(authority, religion, regions, currentTick) {
  const p = ensureAuthorityPolitics(authority);
  const cost = 15 + (authority.influenceByPolity ? Object.keys(authority.influenceByPolity).length * 2 : 0);
  if ((authority.treasury || 0) < cost) return { changed:false, reason:'insufficient_treasury' };
  authority.treasury -= cost;
  religion.authority = clamp((religion.authority || 0) + 0.035);
  religion.lastInstitutionalSchismTick = Math.max(religion.lastInstitutionalSchismTick || -Infinity, currentTick - 350);
  for (const region of regions) {
    if ((region.religion?.shares?.[religion.id] || 0) > 0.2) region.religion.unrest = clamp((region.religion.unrest || 0) - 0.035);
  }
  p.councils.push({ tick:currentTick, cost });
  if (p.councils.length > 12) p.councils.shift();
  return { changed:true, cost };
}

function authorityIntervention(authority, religion, polity, regions, currentTick, rng) {
  const politics = ensureAuthorityPolitics(authority);
  const influence = clamp(authority.influenceByPolity?.[polity.id] || 0);
  const followers = followerShareInPolity(religion.id, polity.id, regions);
  if (followers < 0.18 || influence < 0.18) return null;
  const legitimacy = clamp(polity.administration?.legitimacy || 0.3);
  const successionContested = Boolean(polity.succession?.crisis?.contested);
  if (successionContested && !politics.recognisedRulers.has(polity.id) && rng() < 0.12 * influence) {
    return { type:'religious_ruler_recognition_offer', polityId:polity.id, religionId:religion.id, authorityId:authority.id, influence, resolveDecision:(choice)=> choice==='accept' ? recogniseRuler(authority, polity) : { changed:false, declined:true } };
  }
  if (legitimacy < 0.32 && influence > 0.35 && !politics.sanctionedPolities.has(polity.id) && rng() < 0.035 * influence) {
    sanctionRuler(authority, polity);
    return { type:'religious_ruler_sanction', polityId:polity.id, religionId:religion.id, authorityId:authority.id, influence };
  }
  return null;
}

export function tickMedievalReligiousPolitics(regions, religiousWorld, polities, currentTick, elapsedDays = 30, rng = Math.random) {
  const years = Math.max(0.001, elapsedDays / DAYS_PER_YEAR); const events=[];
  const religionById = new Map((religiousWorld?.religions || []).map(r=>[r.id,r]));
  const polityById = new Map(polities.map(p=>[p.id,p]));
  for (const authority of religiousWorld?.authorities || []) {
    if (authority.active === false) continue;
    const religion = religionById.get(authority.religionId); if (!religion) continue;
    const politics = ensureAuthorityPolitics(authority);
    for (const polityId of Object.keys(authority.influenceByPolity || {})) {
      const polity = polityById.get(polityId); if (!polity) continue;
      const event = authorityIntervention(authority, religion, polity, regions, currentTick, rng); if (event) events.push(event);
      if (politics.sanctionedPolities.has(polity.id)) polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) - followerShareInPolity(religion.id, polity.id, regions) * authority.diplomaticInfluence * years * 0.008);
      if (politics.recognisedRulers.has(polity.id)) polity.administration.legitimacy = clamp((polity.administration.legitimacy || 0) + followerShareInPolity(religion.id, polity.id, regions) * authority.diplomaticInfluence * years * 0.003);
    }
    // Appointment power grows from real cross-border followers, not from a Christianity-specific rule.
    for (const polity of polities) {
      const share = followerShareInPolity(religion.id, polity.id, regions);
      const target = clamp(share * authority.diplomaticInfluence * 0.8);
      politics.appointmentInfluence[polity.id] = (politics.appointmentInfluence[polity.id] || 0) + (target - (politics.appointmentInfluence[polity.id] || 0)) * clamp(years * 0.25);
    }
  }
  return events;
}
