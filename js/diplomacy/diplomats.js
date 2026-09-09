import { attitudeToward } from './relations.js?v=20260904-save1';
import { maritimeRouteBetween } from '../world/chokepoints.js?v=20260907-chokepoints1';
import { diplomatLanguageComprehension, trainDiplomatLanguage } from './languageCommunication.js?v=20260909-language1';
import { attemptTurnDiplomat, diplomatMayExceedAuthority, diplomatReliability, diplomaticTrustSummary, ensureDiplomatPersonality, recordAuthorityBreach, recordDiplomatPerformance, recordGovernmentTrust } from './diplomatPersonalities.js?v=20260909-agent-trust1';

let nextDiplomatId = 1;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;

export const DIPLOMAT_AUTHORITY = Object.freeze({
  OBSERVE: 'observe',
  NEGOTIATE: 'negotiate',
  MILITARY: 'military',
  PLENIPOTENTIARY: 'plenipotentiary',
});

function ensureService(region) {
  region.diplomaticService ||= { diplomats: [], lastReportTick: null };
  if (!Array.isArray(region.diplomaticService.diplomats)) region.diplomaticService.diplomats = [];
  if (!region.diplomaticService.diplomats.length) {
    const id = `dip-${nextDiplomatId++}`;
    region.diplomaticService.diplomats.push({
      id, name: 'Chief Envoy', homeRegionId: region.id, homeActorId: actorId(region),
      status: 'home', postedRegionId: null, authority: DIPLOMAT_AUTHORITY.OBSERVE,
      maxMilitaryCommitmentFraction: 0.2,
      negotiationSkill: 0.52, observationSkill: 0.5, secrecy: 0.5, loyalty: 0.72,
      localFamiliarity: 0, languageSkills: {}, compromised: false, credentialsCompromised: false,
      route: null, departTick: null, arrivalTick: null,
    });
  }
  for (const diplomat of region.diplomaticService.diplomats) ensureDiplomatPersonality(diplomat);
  return region.diplomaticService;
}

export function ensureDiplomaticService(region) { return ensureService(region); }

export function syncNextDiplomatId(regions = []) {
  let max = 0;
  for (const region of regions) for (const diplomat of ensureService(region).diplomats) {
    max = Math.max(max, Number(String(diplomat.id || '').replace(/\D/g, '')) || 0);
  }
  nextDiplomatId = max + 1;
}

function landRoute(origin, target, regionsById, maxHops = 14) {
  if (origin.id === target.id) return [origin.id];
  const queue = [[origin.id]];
  const seen = new Set([origin.id]);
  while (queue.length) {
    const path = queue.shift();
    if (path.length > maxHops + 1) continue;
    const here = regionsById.get(path[path.length - 1]);
    for (const nextId of here?.neighbors || []) {
      if (seen.has(nextId)) continue;
      const nextPath = [...path, nextId];
      if (nextId === target.id) return nextPath;
      seen.add(nextId); queue.push(nextPath);
    }
  }
  return null;
}

function routeFor(origin, target, regionsById) {
  const land = landRoute(origin, target, regionsById);
  const sea = maritimeRouteBetween(origin, target);
  if (!land && !sea) return null;
  const landDays = land ? Math.max(3, (land.length - 1) * 5) : Infinity;
  const seaDays = sea ? Math.max(4, sea.seaIds.length * 4 + (sea.physicalFriction || 0) * 9) : Infinity;
  if (seaDays < landDays) return { mode: 'sea', seaIds: sea.seaIds, passageIds: sea.passageIds || [], days: seaDays };
  return { mode: 'land', regionIds: land, days: landDays };
}

export function diplomatsFor(region) { return ensureService(region).diplomats; }

export function diplomatPublicProfile(diplomat) {
  ensureDiplomatPersonality(diplomat);
  return {
    id: diplomat.id, name: diplomat.name, status: diplomat.status, authority: diplomat.authority,
    postedRegionId: diplomat.postedRegionId, loyalty: clamp(diplomat.loyalty ?? 0.5),
    reliability: diplomatReliability(diplomat), reputation: { ...diplomat.reputation },
    suspectedCompromise: clamp(diplomat.suspectedCompromise || 0),
    authorityBreaches: [...(diplomat.authorityBreaches || [])],
    // Deliberately omit turnedByActorId: home governments do not get omniscient access to betrayal.
  };
}

export function setDiplomatAuthority(region, diplomatId, authority, options = {}) {
  const diplomat = diplomatsFor(region).find((d) => d.id === diplomatId);
  if (!diplomat || !Object.values(DIPLOMAT_AUTHORITY).includes(authority)) return false;
  diplomat.authority = authority;
  if (Number.isFinite(options.maxMilitaryCommitmentFraction)) {
    diplomat.maxMilitaryCommitmentFraction = clamp(options.maxMilitaryCommitmentFraction, 0, 0.8);
  }
  return true;
}

export function dispatchDiplomat(home, target, regions, diplomatId, currentTick) {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || diplomat.status === 'en_route' || !target || target.id === home.id) return { sent: false, reason: 'unavailable' };
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(home, target, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  diplomat.status = 'en_route';
  diplomat.postedRegionId = target.id;
  diplomat.route = route;
  diplomat.departTick = currentTick;
  diplomat.arrivalTick = currentTick + Math.max(1, Math.ceil(route.days / 7));
  diplomat.localFamiliarity = 0;
  return { sent: true, diplomat, route };
}

export function recallDiplomat(home, diplomatId, regions, currentTick) {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || !diplomat.postedRegionId || diplomat.status === 'en_route' || diplomat.status === 'detained') return { sent: false, reason: diplomat?.status === 'detained' ? 'detained' : 'not_posted' };
  const host = regions.find((r) => r.id === diplomat.postedRegionId);
  if (!host) return { sent: false, reason: 'host_missing' };
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(host, home, regionsById);
  if (!route) return { sent: false, reason: 'no_route' };
  diplomat.status = 'returning';
  diplomat.route = route;
  diplomat.departTick = currentTick;
  diplomat.arrivalTick = currentTick + Math.max(1, Math.ceil(route.days / 7));
  return { sent: true, diplomat, route };
}

export function residentDiplomatFor(home, hostRegionId) {
  return diplomatsFor(home).find((d) => d.status === 'posted' && d.postedRegionId === hostRegionId) || null;
}

export function diplomatCanCommit(diplomat, action, fraction = 0) {
  if (!diplomat || diplomat.status !== 'posted') return false;
  if (diplomat.authority === DIPLOMAT_AUTHORITY.PLENIPOTENTIARY) return true;
  if (action === 'joint_operation' && diplomat.authority === DIPLOMAT_AUTHORITY.MILITARY) {
    return clamp(fraction) <= clamp(diplomat.maxMilitaryCommitmentFraction || 0.2);
  }
  if (action === 'minor_agreement' && [DIPLOMAT_AUTHORITY.NEGOTIATE, DIPLOMAT_AUTHORITY.MILITARY].includes(diplomat.authority)) return true;
  return false;
}

export function diplomatCommitDecision(diplomat, action, fraction = 0, currentTick = null, options = {}) {
  if (diplomatCanCommit(diplomat, action, fraction)) return { canCommit: true, withinAuthority: true, exceededAuthority: false };
  if (!diplomat || diplomat.status !== 'posted') return { canCommit: false, reason: 'not_posted' };
  const urgency = clamp(options.urgency || 0);
  if (['joint_operation','minor_agreement'].includes(action) && diplomatMayExceedAuthority(diplomat, clamp(fraction), urgency, options.rng || Math.random)) {
    recordAuthorityBreach(diplomat, action, clamp(fraction), currentTick);
    return { canCommit: true, withinAuthority: false, exceededAuthority: true };
  }
  return { canCommit: false, reason: 'outside_mandate' };
}

export function attemptBribeDiplomat(home, diplomatId, foreignActorId, offeredValue = 0, pressure = 0, rng = Math.random) {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || diplomat.status !== 'posted') return { attempted: false, reason: 'not_posted' };
  return attemptTurnDiplomat(diplomat, foreignActorId, offeredValue, pressure, rng);
}

export function expelDiplomat(home, diplomatId, host, regions, currentTick, reason = 'persona_non_grata') {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || diplomat.status !== 'posted' || diplomat.postedRegionId !== host?.id) return { expelled: false, reason: 'not_posted_here' };
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const route = routeFor(host, home, regionsById);
  if (!route) { diplomat.status = 'home'; diplomat.postedRegionId = null; diplomat.route = null; }
  else {
    diplomat.status = 'returning'; diplomat.route = route; diplomat.departTick = currentTick;
    diplomat.arrivalTick = currentTick + Math.max(1, Math.ceil(route.days / 7));
  }
  diplomat.expelledByActorId = actorId(host);
  diplomat.expelledReason = reason;
  recordGovernmentTrust(home, actorId(host), 'promise_broken', currentTick);
  return { expelled: true, diplomat, route };
}

export function detainDiplomat(home, diplomatId, host, currentTick, reason = 'security') {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || !['posted','en_route'].includes(diplomat.status) || diplomat.postedRegionId !== host?.id) return { detained: false, reason: 'not_available' };
  diplomat.status = 'detained'; diplomat.detainedSinceTick = currentTick; diplomat.detainedByActorId = actorId(host); diplomat.detainedReason = reason;
  recordGovernmentTrust(home, actorId(host), 'promise_broken', currentTick);
  return { detained: true, diplomat };
}

export function releaseDiplomat(home, diplomatId, host, regions, currentTick) {
  const diplomat = diplomatsFor(home).find((d) => d.id === diplomatId);
  if (!diplomat || diplomat.status !== 'detained' || diplomat.postedRegionId !== host?.id) return { released: false, reason: 'not_detained_here' };
  diplomat.status = 'posted'; delete diplomat.detainedSinceTick; delete diplomat.detainedByActorId; delete diplomat.detainedReason;
  return recallDiplomat(home, diplomatId, regions, currentTick);
}

export function foreignGovernmentTrust(home, foreignActorId) { return diplomaticTrustSummary(home, foreignActorId); }

function postObservation(home, host, diplomat, currentTick, rng) {
  home.diplomaticIntelligence ||= [];
  const language = diplomatLanguageComprehension(diplomat, home, host);
  const skill = clamp((diplomat.observationSkill + diplomat.localFamiliarity * 0.25) * (0.62 + language * 0.38));
  const turnedForHost = diplomat.turnedByActorId && diplomat.turnedByActorId === actorId(host);
  const distortion = turnedForHost ? 0.3 + (1 - diplomatReliability(diplomat)) * 0.45 : 0;
  const directionalBias = turnedForHost ? (rng() < 0.5 ? -1 : 1) * distortion : 0;
  const noise = (rng() - 0.5) * (1 - skill) * 0.8 + directionalBias;
  const armyEstimate = Math.max(0, Math.round((host.army?.personnel || 0) * (1 + noise)));
  const posture = host.militaryStrategy?.posture || 'unknown';
  const targetRegionId = host.militaryStrategy?.targetRegionId || null;
  const report = {
    type: 'diplomat_military_observation', diplomatId: diplomat.id, hostRegionId: host.id,
    hostActorId: actorId(host), estimatedArmy: armyEstimate,
    observedPosture: turnedForHost && rng() < 0.45 ? 'guarded' : posture,
    observedTargetRegionId: skill >= 0.62 && !(turnedForHost && rng() < 0.55) ? targetRegionId : null,
    confidence: clamp(0.22 + skill * 0.48 + language * 0.22), languageComprehension: language, learnedTick: currentTick,
  };
  home.diplomaticIntelligence.push(report);
  if (home.diplomaticIntelligence.length > 60) home.diplomaticIntelligence.shift();
  if (turnedForHost) recordDiplomatPerformance(diplomat, 'false_report', actorId(host));
  else recordDiplomatPerformance(diplomat, 'accurate_report', actorId(host));
}

function maybeHostAction(home, host, diplomat, currentTick, elapsedDays, rng, regions) {
  const hostility = clamp((-attitudeToward(host, home.id) + 1) / 2);
  const suspicion = clamp(diplomat.suspectedCompromise || 0);
  const annual = Math.max(0, elapsedDays) / 365.2425;
  if (hostility > 0.82 && rng() < annual * (0.08 + hostility * 0.18)) {
    const severe = hostility > 0.94 && rng() < 0.35;
    return severe ? detainDiplomat(home, diplomat.id, host, currentTick, 'hostile_relations')
      : expelDiplomat(home, diplomat.id, host, regions, currentTick, 'hostile_relations');
  }
  if (!diplomat.turnedByActorId && hostility < 0.7 && rng() < annual * (0.012 + (diplomat.personality?.avarice || 0.5) * 0.025)) {
    const offer = 2 + rng() * 10;
    const result = attemptTurnDiplomat(diplomat, actorId(host), offer, suspicion * 0.3, rng);
    if (!result.success && result.attempted) diplomat.suspectedCompromise = clamp(diplomat.suspectedCompromise + 0.05);
    return { briberyAttempt: result, offeredValue: offer };
  }
  return null;
}

export function tickDiplomats(regions, currentTick, elapsedDays = 7, rng = Math.random) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const events = [];
  for (const home of regions) {
    for (const diplomat of diplomatsFor(home)) {
      if (['en_route','returning'].includes(diplomat.status) && currentTick >= (diplomat.arrivalTick ?? Infinity)) {
        if (diplomat.status === 'returning') {
          diplomat.status = 'home'; diplomat.postedRegionId = null; diplomat.route = null;
          events.push({ type: 'diplomat_returned', homeRegionId: home.id, diplomat });
        } else {
          const host = regionsById.get(diplomat.postedRegionId);
          if (!host) { diplomat.status = 'home'; diplomat.postedRegionId = null; continue; }
          const hostility = clamp((-attitudeToward(host, home.id) + 1) / 2);
          const detained = hostility > 0.8 && rng() < (hostility - 0.75) * 0.35;
          if (detained) {
            diplomat.status = 'detained'; diplomat.detainedSinceTick = currentTick; diplomat.detainedByActorId = actorId(host);
            events.push({ type: 'diplomat_detained', homeRegionId: home.id, hostRegionId: host.id, diplomat });
          } else {
            diplomat.status = 'posted'; diplomat.route = null; diplomat.localFamiliarity = 0.12;
            events.push({ type: 'diplomat_posted', homeRegionId: home.id, hostRegionId: host.id, diplomat });
          }
        }
      } else if (diplomat.status === 'posted') {
        diplomat.localFamiliarity = clamp(diplomat.localFamiliarity + elapsedDays / 365.2425 * 0.18);
        const host = regionsById.get(diplomat.postedRegionId);
        if (host) trainDiplomatLanguage(diplomat, home, host, elapsedDays);
        if (host) {
          const hostAction = maybeHostAction(home, host, diplomat, currentTick, elapsedDays, rng, regions);
          if (hostAction?.detained) events.push({ type: 'diplomat_detained', homeRegionId: home.id, hostRegionId: host.id, diplomat });
          else if (hostAction?.expelled) events.push({ type: 'diplomat_expelled', homeRegionId: home.id, hostRegionId: host.id, diplomat });
          else if (hostAction?.briberyAttempt?.attempted && !hostAction.briberyAttempt.success && diplomat.suspectedCompromise > 0.35) {
            events.push({ type: 'diplomat_compromise_suspected', homeRegionId: home.id, hostRegionId: host.id, diplomat, confidence: diplomat.suspectedCompromise });
          }
        }
        if (diplomat.status === 'posted' && host && (diplomat.lastReportTick == null || currentTick - diplomat.lastReportTick >= 13)) {
          diplomat.lastReportTick = currentTick;
          postObservation(home, host, diplomat, currentTick, rng);
          events.push({ type: 'diplomat_report', homeRegionId: home.id, hostRegionId: host.id, diplomat });
        }
      }
    }
  }
  return events;
}

export function chooseNpcDiplomatPosting(home, regions, currentTick, rng = Math.random) {
  const service = ensureService(home);
  const diplomat = service.diplomats.find((d) => d.status === 'home');
  if (!diplomat || rng() > 0.18) return null;
  const candidates = regions.filter((r) => r.id !== home.id &&
    ((home.neighbors || []).includes(r.id) || (home.adjacentSeaIds || []).some((id) => (r.adjacentSeaIds || []).includes(id))));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(attitudeToward(home, b.id)) - Math.abs(attitudeToward(home, a.id)));
  const target = candidates[0];
  const feeling = attitudeToward(home, target.id);
  const authority = feeling > 0.65 ? DIPLOMAT_AUTHORITY.MILITARY : feeling > 0.15 ? DIPLOMAT_AUTHORITY.NEGOTIATE : DIPLOMAT_AUTHORITY.OBSERVE;
  setDiplomatAuthority(home, diplomat.id, authority, { maxMilitaryCommitmentFraction: feeling > 0.75 ? 0.35 : 0.18 });
  return dispatchDiplomat(home, target, regions, diplomat.id, currentTick);
}
