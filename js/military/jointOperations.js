import { canCampaign, launchCampaign } from './campaigns.js?v=20260905-projects1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

export function jointOperationsForRegion(region, agreements = []) {
  return agreements.filter((agreement) => agreement.active && agreement.type === 'joint_operation' &&
    (agreement.proposerRegionId === region.id || agreement.partnerRegionId === region.id));
}

function alreadyCampaigning(region, enemyRegionId, activeCampaigns) {
  return activeCampaigns.some((campaign) => !campaign.completed && campaign.attackerId === region.id && campaign.defenderId === enemyRegionId);
}

function roleFor(region, plan) {
  if (plan.proposerRegionId === region.id) return 'proposer';
  if (plan.partnerRegionId === region.id) return 'partner';
  return null;
}

function privateIntent(plan, role) {
  return role === 'proposer' ? plan.proposerPrivateIntent : plan.partnerPrivateIntent;
}

function declaredFraction(plan, role) {
  return role === 'proposer' ? plan.proposerDeclaredFraction : plan.partnerDeclaredFraction;
}

export function jointOperationStatus(plan, currentTick) {
  if (!plan?.active) return 'inactive';
  if (plan.cancelledTick != null) return 'cancelled';
  if (currentTick < plan.attackTick) return 'preparing';
  if (plan.completedTick != null) return 'completed';
  return 'due';
}

export function activateJointOperations(region, regionsById, agreements, activeCampaigns, polities, currentTick, rng = Math.random) {
  const events = [];
  for (const plan of jointOperationsForRegion(region, agreements)) {
    const role = roleFor(region, plan);
    if (!role || currentTick < plan.attackTick) continue;
    plan.execution ||= {};
    if (plan.execution[role]) continue;
    const enemy = regionsById.get(plan.enemyRegionId);
    if (!enemy) { plan.execution[role] = { status: 'failed_no_target', tick: currentTick }; continue; }

    const intent = privateIntent(plan, role) || { honour: true, commitmentFraction: declaredFraction(plan, role) || 0.5, delayWeeks: 0 };
    const dueTick = plan.attackTick + Math.max(0, Math.round(intent.delayWeeks || 0));
    if (currentTick < dueTick) continue;

    if (!intent.honour) {
      plan.execution[role] = { status: 'reneged', tick: currentTick, declaredFraction: declaredFraction(plan, role), actualFraction: 0 };
      events.push({ type: 'joint_operation_reneged', plan, regionId: region.id, role });
      continue;
    }
    if (alreadyCampaigning(region, enemy.id, activeCampaigns)) {
      plan.execution[role] = { status: 'already_engaged', tick: currentTick };
      continue;
    }
    const reach = canCampaign(region, enemy, activeCampaigns, [...regionsById.values()], polities);
    if (!reach.possible || (region.army?.personnel || 0) < 50) {
      plan.execution[role] = { status: 'unable', tick: currentTick, reason: reach.reason || 'insufficient_force' };
      events.push({ type: 'joint_operation_unable_to_execute', plan, regionId: region.id, role, reason: reach.reason || 'insufficient_force' });
      continue;
    }
    const actualFraction = clamp(intent.commitmentFraction ?? declaredFraction(plan, role) ?? 0.5, 0.08, 0.95);
    const requested = Math.floor((region.army?.personnel || 0) * actualFraction);
    const campaign = launchCampaign(region, enemy, plan.objective || 'subjugation', requested, currentTick, {
      campaigns: activeCampaigns,
      regions: [...regionsById.values()],
      polities,
      subregionalObjective: plan.subregionalObjective || 'capital',
    });
    if (!campaign) {
      plan.execution[role] = { status: 'unable', tick: currentTick, reason: 'launch_failed' };
      continue;
    }
    campaign.jointOperationId = plan.id;
    campaign.battleCommand = {
      declaredCommitmentFraction: clamp(declaredFraction(plan, role) || actualFraction, 0, 1),
      intendedCommitmentFraction: actualFraction,
      reserveFraction: clamp(1 - actualFraction, 0, 0.75),
      commandRelationship: 'independent_allied_command',
    };
    activeCampaigns.push(campaign);
    plan.execution[role] = { status: 'launched', tick: currentTick, campaignId: campaign.id, actualFraction };
    events.push({ type: 'joint_operation_launched', plan, regionId: region.id, role, campaignId: campaign.id, actualFraction });
  }

  for (const plan of agreements.filter((a) => a.active && a.type === 'joint_operation')) {
    if (plan.execution?.proposer && plan.execution?.partner && !plan.completedTick) {
      plan.completedTick = currentTick;
      plan.active = false;
      events.push({ type: 'joint_operation_execution_resolved', plan });
    }
  }
  return events;
}
