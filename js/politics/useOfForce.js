import { authoriseRuntimeGovernmentAction } from './institutionalRuntimeAuthority.js?v=20260916-force1';

export const USE_OF_FORCE = Object.freeze({
  RAID: 'raid',
  REPRISAL: 'reprisal',
  LIMITED_CAMPAIGN: 'limited_campaign',
  FORMAL_WAR: 'formal_war',
});

export const REPRISAL_WINDOW_WEEKS = 26;

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;
}

export function isRecentReprisal(attacker, defender, currentTick, windowWeeks = REPRISAL_WINDOW_WEEKS) {
  const threat = attacker?.militaryThreat || {};
  if (!Number.isFinite(threat.lastRaidedTick) || !Number.isFinite(currentTick)) return false;
  if (currentTick - threat.lastRaidedTick > windowWeeks) return false;
  const lastRaiderActorId = threat.lastRaiderActorId || null;
  return Boolean(lastRaiderActorId && lastRaiderActorId === actorId(defender));
}

export function classifyRaidUseOfForce(attacker, defender, currentTick) {
  return isRecentReprisal(attacker, defender, currentTick) ? USE_OF_FORCE.REPRISAL : USE_OF_FORCE.RAID;
}

export function classifyCampaignUseOfForce(attacker, defender, objective, currentTick) {
  if (objective === 'punitive') return USE_OF_FORCE.LIMITED_CAMPAIGN;
  return USE_OF_FORCE.FORMAL_WAR;
}

export function governmentActionForUseOfForce(kind) {
  if (kind === USE_OF_FORCE.REPRISAL) return 'launch_reprisals';
  if (kind === USE_OF_FORCE.RAID) return 'launch_raid';
  if (kind === USE_OF_FORCE.LIMITED_CAMPAIGN) return 'launch_limited_military_action';
  return 'launch_offensive_war';
}

export function authoriseUseOfForce(attacker, defender, kind, options = {}) {
  const action = governmentActionForUseOfForce(kind);
  const reprisal = kind === USE_OF_FORCE.REPRISAL;
  const limited = kind !== USE_OF_FORCE.FORMAL_WAR;
  const context = options.context || {};
  const threat = Math.max(0, Math.min(1, Number(context.threat ?? options.threat ?? (reprisal ? 0.8 : 0)) || 0));
  const hostility = Math.max(0, Math.min(1, Number(context.hostility ?? options.hostility ?? 0) || 0));
  const publicSupport = Math.max(0, Math.min(1, Number(context.publicSupport ?? options.publicSupport ?? (reprisal ? 0.7 : 0.5)) || 0));
  return authoriseRuntimeGovernmentAction(attacker, action, {
    polities: options.polities,
    approvals: options.approvals,
    rng: options.rng,
    currentTick: options.currentTick,
    registerRefusal: options.registerRefusal !== false,
    context: {
      ...context,
      threat,
      hostility,
      publicSupport,
      defensive: reprisal,
      reprisal,
      limited,
      targetRegionId: defender?.id || null,
      targetActorId: actorId(defender),
      useOfForceKind: kind,
    },
  });
}
