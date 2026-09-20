const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));
const actorId = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id || null;
let nextArmisticeId = 1;

export const ARMISTICE_VIOLATIONS = Object.freeze({
  SMALL_ARMS: 'small_arms_fire',
  ARTILLERY: 'artillery_fire',
  INCURSION: 'dmz_incursion',
  ADVANCE: 'renewed_advance',
  REINFORCE_DMZ: 'reinforce_dmz',
});

function campaignActor(campaign, world) {
  const origin = (world.regions || []).find((region) => region.id === campaign.attackerId);
  return actorId(origin);
}

function relevantCampaigns(world, crisis) {
  return (world.activeCampaigns || []).filter((campaign) => !campaign.completed && campaign.warId === crisis.sourceId);
}

function verificationStrength(mode) {
  if (mode === 'inspections') return .9;
  if (mode === 'observers') return .72;
  return .18;
}

export function establishArmistice(proposal, crisis, world, currentTick = 0) {
  world.activeArmistices ||= [];
  if (proposal.armisticeId) return world.activeArmistices.find((armistice) => armistice.id === proposal.armisticeId) || null;
  const withdrawal = proposal.terms?.find((term) => term.type === 'withdrawal');
  const implementation = withdrawal?.implementation || {};
  const trust = clamp(proposal.negotiation?.trustAtOpening ?? .5);
  const verification = implementation.verification || (trust < .62 ? 'observers' : 'trust');
  const monitored = verification !== 'trust';
  const dmzWidthKm = monitored ? (trust < .42 ? 12 : 6) : (trust < .5 ? 3 : 0);
  const armistice = {
    id: `armistice-${nextArmisticeId++}`,
    crisisId: crisis.id,
    proposalId: proposal.id,
    warId: crisis.sourceId || null,
    sideAActorId: crisis.sideAActorId,
    sideBActorId: crisis.sideBActorId,
    signedTick: currentTick,
    status: 'active',
    verification,
    observerCoverage: monitored ? clamp(.55 + verificationStrength(verification) * .4) : 0,
    dmzWidthKm,
    fronts: [],
    incidents: [],
    violations: [],
    tension: clamp(crisis.severity * .35 + crisis.nuclearRisk * .35 + (1 - trust) * .3),
  };
  for (const campaign of relevantCampaigns(world, crisis)) {
    const front = {
      campaignId: campaign.id,
      attackerActorId: campaignActor(campaign, world),
      defenderRegionId: campaign.defenderId,
      frozenPhase: campaign.phase,
      frozenStage: campaign.stage,
      frozenTick: currentTick,
      dmzWidthKm,
      status: 'holding',
    };
    armistice.fronts.push(front);
    campaign.ceasefireHold = {
      active: true,
      armisticeId: armistice.id,
      sinceTick: currentTick,
      dmzWidthKm,
      verification,
      frozenPhase: campaign.phase,
      frozenStage: campaign.stage,
    };
  }
  world.activeArmistices.push(armistice);
  proposal.armisticeId = armistice.id;
  crisis.armisticeId = armistice.id;
  crisis.history.push({ type: 'armistice_started', armisticeId: armistice.id, proposalId: proposal.id, tick: currentTick, dmzWidthKm, verification });
  return armistice;
}

export function releaseArmistice(world, armistice, currentTick = 0, reason = 'ended') {
  if (!armistice || armistice.status === 'ended') return false;
  armistice.status = 'ended';
  armistice.endedTick = currentTick;
  armistice.endReason = reason;
  for (const campaign of world.activeCampaigns || []) {
    if (campaign.ceasefireHold?.armisticeId !== armistice.id) continue;
    campaign.ceasefireHold.active = false;
    campaign.ceasefireHold.endedTick = currentTick;
    campaign.ceasefireHold.endReason = reason;
  }
  return true;
}

export function armisticeForCampaign(world, campaign) {
  const id = campaign?.ceasefireHold?.armisticeId;
  return id ? (world.activeArmistices || []).find((armistice) => armistice.id === id && armistice.status === 'active') || null : null;
}

export function recordArmisticeViolation(world, armistice, actor, type, currentTick = 0, options = {}, rng = Math.random) {
  if (!armistice || armistice.status !== 'active') return { recorded: false, reason: 'inactive_armistice' };
  const severity = clamp(options.severity ?? ({
    [ARMISTICE_VIOLATIONS.SMALL_ARMS]: .12,
    [ARMISTICE_VIOLATIONS.ARTILLERY]: .38,
    [ARMISTICE_VIOLATIONS.INCURSION]: .32,
    [ARMISTICE_VIOLATIONS.REINFORCE_DMZ]: .42,
    [ARMISTICE_VIOLATIONS.ADVANCE]: .78,
  })[type] ?? .25);
  const detectionChance = clamp(.14 + armistice.observerCoverage * .72 + severity * .18);
  const detected = options.public === true || rng() < detectionChance;
  const violation = {
    id: `${armistice.id}:violation:${armistice.violations.length + 1}`,
    actorId: actor,
    type,
    severity,
    tick: currentTick,
    detected,
    detectionChance,
    campaignId: options.campaignId || null,
  };
  armistice.violations.push(violation);
  armistice.tension = clamp(armistice.tension + severity * (detected ? .34 : .12));
  if (detected && severity >= .3) armistice.status = severity >= .7 ? 'breached' : 'strained';
  return { recorded: true, violation };
}

export function resumeCampaignAfterArmisticeViolation(world, campaign, actor, currentTick = 0, type = ARMISTICE_VIOLATIONS.ADVANCE, rng = Math.random) {
  const armistice = armisticeForCampaign(world, campaign);
  if (!armistice) return { resumed: false, reason: 'no_active_armistice' };
  const result = recordArmisticeViolation(world, armistice, actor, type, currentTick, { campaignId: campaign.id, public: type === ARMISTICE_VIOLATIONS.ADVANCE }, rng);
  campaign.ceasefireHold.active = false;
  campaign.ceasefireHold.breachedTick = currentTick;
  campaign.ceasefireHold.breachedByActorId = actor;
  if (type === ARMISTICE_VIOLATIONS.ADVANCE) {
    armistice.status = 'breached';
    armistice.breachedTick = currentTick;
    armistice.breachedByActorId = actor;
  }
  return { resumed: true, ...result };
}

export function tickArmistices(world, currentTick = 0, rng = Math.random) {
  const events = [];
  for (const armistice of world.activeArmistices || []) {
    if (!['active', 'strained'].includes(armistice.status)) continue;
    for (const violation of armistice.violations || []) {
      if (violation.detected || currentTick <= violation.tick) continue;
      const age = currentTick - violation.tick;
      const chance = clamp(violation.detectionChance + age * .045);
      if (rng() < chance) {
        violation.detected = true;
        violation.detectedTick = currentTick;
        armistice.tension = clamp(armistice.tension + violation.severity * .28);
        if (violation.severity >= .3) armistice.status = violation.severity >= .7 ? 'breached' : 'strained';
        events.push({ type: 'armistice_violation_discovered', armisticeId: armistice.id, violation });
      }
    }
  }
  return events;
}
