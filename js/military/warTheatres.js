import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';

export const WAR_STANCES = Object.freeze({
  COOPERATE: 'cooperate',
  COBELLIGERENT: 'cobelligerent',
  AVOID: 'avoid',
  HOSTILE: 'hostile',
});

export const WAR_AIMS = Object.freeze({
  DEFEAT: 'defeat',
  DEFEND: 'defend',
  ANNEX: 'annex',
  LIBERATE: 'liberate',
  PUNITIVE: 'punitive',
  REGIME_CHANGE: 'regime_change',
});

let nextWarId = 1;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id;

export function syncNextWarId(wars = []) {
  nextWarId = Math.max(1, ...wars.map((war) => (Number(String(war.id || '').replace(/\D/g, '')) || 0) + 1));
}

function ensureParticipant(war, id, currentTick, options = {}) {
  if (!id) return null;
  let p = war.participants.find((item) => item.actorId === id);
  if (!p) {
    p = {
      actorId: id,
      joinedTick: currentTick,
      sideId: options.sideId || id,
      warAim: options.warAim || WAR_AIMS.DEFEAT,
      targetActorId: options.targetActorId || null,
      stances: {},
      enemyPriorities: {},
      surrenderPolicy: {},
      occupationPreferences: {},
    };
    war.participants.push(p);
  }
  return p;
}

function campaignObjectiveAim(campaign, defender = false) {
  if (defender) return WAR_AIMS.DEFEND;
  if (campaign.objective === 'liberation') return WAR_AIMS.LIBERATE;
  if (campaign.objective === 'punitive') return WAR_AIMS.PUNITIVE;
  if (campaign.objective === 'devastation') return WAR_AIMS.PUNITIVE;
  return WAR_AIMS.DEFEAT;
}

function pairKey(a, b) { return [a, b].sort().join('|'); }

export function createWarFromCampaign(campaign, regionsById, currentTick) {
  const attacker = regionsById.get(campaign.attackerId);
  const defender = regionsById.get(campaign.defenderId);
  if (!attacker || !defender) return null;
  const attackerActorId = actorId(attacker);
  const defenderActorId = actorId(defender);
  const war = {
    id: `war-${nextWarId++}`,
    startedTick: currentTick,
    endedTick: null,
    active: true,
    originatingCampaignId: campaign.id,
    primaryPair: pairKey(attackerActorId, defenderActorId),
    participants: [],
    history: [],
  };
  const a = ensureParticipant(war, attackerActorId, currentTick, { sideId: attackerActorId, warAim: campaignObjectiveAim(campaign), targetActorId: defenderActorId });
  const d = ensureParticipant(war, defenderActorId, currentTick, { sideId: defenderActorId, warAim: WAR_AIMS.DEFEND, targetActorId: attackerActorId });
  a.stances[defenderActorId] = WAR_STANCES.HOSTILE;
  d.stances[attackerActorId] = WAR_STANCES.HOSTILE;
  a.enemyPriorities[defenderActorId] = 1;
  d.enemyPriorities[attackerActorId] = 1;
  campaign.warId = war.id;
  return war;
}

export function participantInWar(war, actor) {
  return war?.participants?.find((p) => p.actorId === actor) || null;
}

export function stanceBetween(war, fromActorId, toActorId) {
  return participantInWar(war, fromActorId)?.stances?.[toActorId] || WAR_STANCES.AVOID;
}

export function setWarStance(war, fromActorId, toActorId, stance) {
  const p = participantInWar(war, fromActorId);
  if (!p || !Object.values(WAR_STANCES).includes(stance) || fromActorId === toActorId) return false;
  p.stances[toActorId] = stance;
  if (stance === WAR_STANCES.HOSTILE && !Number.isFinite(p.enemyPriorities[toActorId])) p.enemyPriorities[toActorId] = 0.5;
  return true;
}

export function setEnemyPriority(war, actor, enemyActorId, priority) {
  const p = participantInWar(war, actor);
  if (!p || stanceBetween(war, actor, enemyActorId) !== WAR_STANCES.HOSTILE) return false;
  p.enemyPriorities[enemyActorId] = clamp(priority, 0.05, 1);
  normaliseEnemyPriorities(p);
  return true;
}

function normaliseEnemyPriorities(p) {
  const hostile = Object.keys(p.stances).filter((id) => p.stances[id] === WAR_STANCES.HOSTILE);
  if (!hostile.length) return;
  let total = hostile.reduce((sum, id) => sum + Math.max(0.05, Number(p.enemyPriorities[id]) || 0.5), 0);
  if (total <= 0) total = hostile.length;
  for (const id of hostile) p.enemyPriorities[id] = Math.max(0.05, Number(p.enemyPriorities[id]) || 0.5) / total;
}

function regionForActor(regions, actor) {
  return regions.find((r) => actorId(r) === actor) || null;
}

export function expectedOccupationSeverity(victimActorId, occupierActorId, regions, war = null) {
  const victim = regionForActor(regions, victimActorId);
  const occupier = regionForActor(regions, occupierActorId);
  if (!victim || !occupier) return 0.5;
  const hostility = clamp((-attitudeToward(victim, occupier.id) + 1) / 2);
  const raidMemory = clamp((victim.raidEconomy?.totalCasualties || 0) / Math.max(1, victim.population || 1) * 8);
  const occupierAim = participantInWar(war, occupierActorId)?.warAim;
  const aimSeverity = occupierAim === WAR_AIMS.ANNEX ? 0.22 : occupierAim === WAR_AIMS.REGIME_CHANGE ? 0.16 : occupierAim === WAR_AIMS.PUNITIVE ? 0.18 : occupierAim === WAR_AIMS.LIBERATE ? -0.12 : 0;
  return clamp(0.2 + hostility * 0.5 + raidMemory * 0.12 + aimSeverity);
}

export function allocateEnemyPriorities(war, actor, regions, options = {}) {
  const p = participantInWar(war, actor);
  if (!p) return {};
  const enemies = war.participants.filter((other) => stanceBetween(war, actor, other.actorId) === WAR_STANCES.HOSTILE);
  if (!enemies.length) return {};
  const values = {};
  for (const enemy of enemies) {
    const severity = expectedOccupationSeverity(actor, enemy.actorId, regions, war);
    const explicit = Number(p.enemyPriorities[enemy.actorId]);
    const existingWeight = Number.isFinite(explicit) ? explicit : 0.5;
    values[enemy.actorId] = Math.max(0.05, existingWeight * 0.45 + severity * 0.55);
  }
  const total = Object.values(values).reduce((s, v) => s + v, 0) || 1;
  for (const id of Object.keys(values)) p.enemyPriorities[id] = values[id] / total;
  return { ...p.enemyPriorities };
}

function defaultEntryStance(existing, entrant, regions) {
  const a = regionForActor(regions, existing.actorId);
  const b = regionForActor(regions, entrant.actorId);
  if (!a || !b) return WAR_STANCES.AVOID;
  const feeling = attitudeToward(a, b.id);
  if (existing.sideId === entrant.sideId) return feeling > 0.45 ? WAR_STANCES.COOPERATE : feeling > -0.25 ? WAR_STANCES.COBELLIGERENT : WAR_STANCES.AVOID;
  return WAR_STANCES.HOSTILE;
}

export function addWarParticipant(war, actor, currentTick, regions, options = {}) {
  if (!war?.active || participantInWar(war, actor)) return { added: false, participant: participantInWar(war, actor), events: [] };
  const entrant = ensureParticipant(war, actor, currentTick, options);
  const events = [];
  for (const existing of war.participants) {
    if (existing === entrant) continue;
    const entrantStance = options.stances?.[existing.actorId] || defaultEntryStance(entrant, existing, regions);
    const existingStance = defaultEntryStance(existing, entrant, regions);
    entrant.stances[existing.actorId] = entrantStance;
    existing.stances[entrant.actorId] = existingStance;
    if (entrantStance === WAR_STANCES.HOSTILE) entrant.enemyPriorities[existing.actorId] = 0.5;
    if (existingStance === WAR_STANCES.HOSTILE) existing.enemyPriorities[entrant.actorId] = 0.5;
  }
  normaliseEnemyPriorities(entrant);
  for (const existing of war.participants) normaliseEnemyPriorities(existing);
  war.history.push({ type: 'participant_joined', actorId: actor, tick: currentTick });
  events.push({ type: 'war_participant_joined', warId: war.id, actorId: actor, participant: entrant });
  return { added: true, participant: entrant, events };
}

export function setOpponentSurrenderPolicy(war, actor, opponentActorId, policy) {
  const p = participantInWar(war, actor);
  if (!p || !['fight','delay','seek_terms','surrender_if_contacted','permit_advance'].includes(policy)) return false;
  p.surrenderPolicy[opponentActorId] = policy;
  return true;
}

export function syncWarTheatres(wars, campaigns, regions, agreements, currentTick) {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const events = [];
  for (const campaign of campaigns) {
    if (campaign.completed) continue;
    let war = campaign.warId ? wars.find((w) => w.id === campaign.warId) : null;
    if (!war) {
      const attacker = regionsById.get(campaign.attackerId);
      const defender = regionsById.get(campaign.defenderId);
      const pair = attacker && defender ? pairKey(actorId(attacker), actorId(defender)) : null;
      war = wars.find((w) => w.active && w.primaryPair === pair) || createWarFromCampaign(campaign, regionsById, currentTick);
      if (war && !wars.includes(war)) { wars.push(war); events.push({ type: 'war_started', warId: war.id }); }
      if (war) campaign.warId = war.id;
    }
  }
  for (const agreement of agreements) {
    if (!agreement.active || agreement.type !== 'war_commitment' || !agreement.enemyActorId) continue;
    const joinerRegion = regionsById.get(agreement.fromId);
    const sponsorRegion = regionsById.get(agreement.toId);
    if (!joinerRegion || !sponsorRegion) continue;
    const joiner = actorId(joinerRegion);
    const sponsor = actorId(sponsorRegion);
    const war = wars.find((w) => w.active && participantInWar(w, sponsor) && participantInWar(w, agreement.enemyActorId));
    if (!war || participantInWar(war, joiner)) continue;
    const sponsorP = participantInWar(war, sponsor);
    const result = addWarParticipant(war, joiner, currentTick, regions, {
      sideId: sponsorP?.sideId || sponsor,
      targetActorId: agreement.enemyActorId,
      warAim: WAR_AIMS.DEFEAT,
      stances: { [sponsor]: WAR_STANCES.COOPERATE, [agreement.enemyActorId]: WAR_STANCES.HOSTILE },
    });
    events.push(...result.events);
  }
  for (const war of wars.filter((w) => w.active)) for (const p of war.participants) allocateEnemyPriorities(war, p.actorId, regions);
  return events;
}

export function warForCampaign(wars, campaign) { return wars.find((w) => w.id === campaign?.warId) || null; }
