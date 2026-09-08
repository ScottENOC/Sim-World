import { canCampaign, launchCampaign } from './campaigns.js?v=20260905-projects1';
import { reviewMilitaryStrategy, setMilitaryStrategy } from './strategicPlanning.js?v=20260908-strategy1';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number(v) || 0));

function roleFor(player, plan) {
  if (plan.proposerRegionId === player.id) return 'proposer';
  if (plan.partnerRegionId === player.id) return 'partner';
  return null;
}

function preparation(plan, role) {
  plan.playerPreparation ||= {};
  plan.playerPreparation[role] ||= { mobilisePrompted: false, stagePrompted: false, launchPrompted: false, mobilised: false, staged: false, stagingNodeId: null };
  return plan.playerPreparation[role];
}

function leadTimes(player, plan) {
  const totalLead = Math.max(1, plan.attackTick - (plan.createdTick ?? plan.attackTick - 8));
  const requestedPrep = Math.max(4, Math.round(player.militaryStrategy?.desiredPreparationWeeks || 12));
  const mobiliseLead = Math.min(Math.max(3, requestedPrep), Math.max(1, totalLead - 1));
  const stageLead = Math.min(Math.max(1, Math.round(mobiliseLead * 0.35)), Math.max(1, totalLead - 1));
  return { mobiliseTick: plan.attackTick - mobiliseLead, stageTick: plan.attackTick - stageLead, attackTick: plan.attackTick };
}

function knownReply(player, plan) {
  return (player.diplomaticIntelligence || []).find((entry) =>
    entry.type === 'joint_operation_reply_received' && entry.jointOperationId === plan.id);
}

function allyRegion(player, plan, regionsById) {
  const allyId = plan.proposerRegionId === player.id ? plan.partnerRegionId : plan.proposerRegionId;
  return regionsById.get(allyId) || null;
}

function enemyRegion(plan, regionsById) { return regionsById.get(plan.enemyRegionId) || null; }

function stagingLocation(player, enemy) {
  const places = player.subregionalControl?.places || [];
  const landAdjacent = Boolean(enemy && (player.neighbors || []).includes(enemy.id));
  if (!landAdjacent) {
    const port = places.find((p) => p.kind === 'port');
    if (port) return { id: port.id, name: port.name || `${player.name} harbour`, kind: 'port' };
  }
  const fort = places.find((p) => p.kind === 'fort');
  if (fort) return { id: fort.id, name: fort.name || `${player.name} fortified position`, kind: 'fort' };
  const principal = places.find((p) => ['principal_settlement','city'].includes(p.kind));
  if (principal) return { id: principal.id, name: principal.name || `${player.name} principal settlement`, kind: principal.kind };
  return { id: player.id, name: `${player.name} muster`, kind: 'regional_muster' };
}

export function jointOperationCouncilAssessment(player, plan, regionsById, activeCampaigns, currentTick) {
  const ally = allyRegion(player, plan, regionsById);
  const enemy = enemyRegion(plan, regionsById);
  const staging = stagingLocation(player, enemy);
  const report = reviewMilitaryStrategy(player, {
    regions: [...regionsById.values()], polities: [], agreements: [plan], activeCampaigns, currentTick,
  });
  const reply = knownReply(player, plan);
  const allyCampaign = activeCampaigns.find((campaign) => !campaign.completed && campaign.jointOperationId === plan.id && campaign.attackerId === ally?.id);
  const relevantIntel = (player.diplomaticIntelligence || []).filter((entry) =>
    entry.jointOperationId === plan.id || entry.sourceMessageId === plan.sourceMessageId ||
    (entry.attackTick === plan.attackTick && [plan.partnerActorId, plan.proposerActorId].includes(entry.senderActorId)));

  let allySignal = 'uncertain';
  let allySummary = 'We have no reliable evidence that our ally has begun moving.';
  if (allyCampaign) {
    allySignal = 'strong';
    allySummary = `${ally?.name || 'Our ally'} has actually put a field army in motion for the agreed operation.`;
  } else if (reply?.accepted) {
    allySignal = 'confirmed_words';
    allySummary = `${ally?.name || 'Our ally'} formally accepted the plan, but words are not troops; we have not yet confirmed a field army moving.`;
  } else if (reply && reply.accepted === false) {
    allySignal = 'refused';
    allySummary = `${ally?.name || 'Our ally'} refused the operation.`;
  } else if (relevantIntel.some((entry) => entry.type === 'intercepted_joint_operation' && entry.accepted === true)) {
    allySignal = 'indirect';
    allySummary = 'Our intelligence suggests the ally accepted, but the normal reply has not reached us.';
  }

  const homeArmy = Math.max(0, player.army?.personnel || 0);
  const declaredFraction = roleFor(player, plan) === 'proposer' ? plan.proposerDeclaredFraction : plan.partnerDeclaredFraction;
  const promised = Math.round(homeArmy * clamp(declaredFraction || 0.55, 0.08, 0.95));
  const readiness = clamp(player.militaryFinance?.readiness ?? 1);
  const food = Number(player.stockpile?.food || 0);
  const affordability = Number(player.treasury || 0) > promised * 0.15 ? 'acceptable' : 'strained';

  return {
    allyName: ally?.name || 'ally', enemyName: enemy?.name || 'enemy', allySignal, allySummary,
    promised, readiness, affordability, food, staging,
    marshal: readiness >= 0.75 ? `Marshal: the army is about ${Math.round(readiness * 100)}% ready.` : `Marshal: readiness is only about ${Math.round(readiness * 100)}%; delay would improve preparation.`,
    treasurer: affordability === 'acceptable' ? 'Treasurer: the treasury can support the promised mobilisation in the short term.' : 'Treasurer: the promised mobilisation will put immediate strain on the treasury.',
    steward: food > promised * 2 ? 'Steward: stores look adequate for initial operations.' : 'Steward: stores are thin for the size of force promised.',
    envoy: `Envoy: ${allySummary}`,
    spymaster: relevantIntel.length ? `Spymaster: we have ${relevantIntel.length} relevant intelligence report${relevantIntel.length === 1 ? '' : 's'} on the plan.` : 'Spymaster: we have no independent confirmation of allied preparations.',
    strategicReport: report,
  };
}

export function tickPlayerJointOperationAdvisor(player, agreements, regionsById, activeCampaigns, currentTick) {
  const events = [];
  if (!player) return events;
  for (const plan of agreements.filter((a) => a.active && a.type === 'joint_operation')) {
    const role = roleFor(player, plan);
    if (!role || plan.execution?.[role]) continue;
    const prep = preparation(plan, role);
    const leads = leadTimes(player, plan);
    const assessment = jointOperationCouncilAssessment(player, plan, regionsById, activeCampaigns, currentTick);

    if (!prep.mobilisePrompted && currentTick >= leads.mobiliseTick) {
      prep.mobilisePrompted = true;
      events.push({ type: 'joint_operation_mobilise_advice', plan, role, assessment, dueTick: leads.mobiliseTick });
      continue;
    }
    if (!prep.stagePrompted && currentTick >= leads.stageTick) {
      prep.stagePrompted = true;
      events.push({ type: 'joint_operation_stage_advice', plan, role, assessment, dueTick: leads.stageTick });
      continue;
    }
    if (!prep.launchPrompted && currentTick >= leads.attackTick) {
      prep.launchPrompted = true;
      events.push({ type: 'joint_operation_launch_confirmation', plan, role, assessment, dueTick: leads.attackTick });
    }
  }
  return events;
}

export function resolvePlayerJointOperationAdvice(event, choice, player, regionsById, activeCampaigns, polities, currentTick) {
  const plan = event.plan;
  const role = event.role || roleFor(player, plan);
  const prep = preparation(plan, role);
  if (event.type === 'joint_operation_mobilise_advice') {
    if (choice === 'yes') {
      prep.mobilised = true;
      setMilitaryStrategy(player, { posture: 'mobilise_war', targetRegionId: plan.enemyRegionId, targetPolityId: plan.enemyActorId, spendingPriority: Math.max(0.7, player.militaryStrategy?.spendingPriority || 0) });
      return { accepted: true, summary: 'The Marshal has begun mobilisation and procurement for the agreed offensive.' };
    }
    prep.mobilised = false;
    return { accepted: false, summary: 'You declined early mobilisation. The operation remains scheduled, but readiness may suffer.' };
  }
  if (event.type === 'joint_operation_stage_advice') {
    prep.staged = choice === 'yes';
    prep.stagingNodeId = choice === 'yes' ? event.assessment?.staging?.id || null : null;
    return choice === 'yes'
      ? { accepted: true, summary: `The Marshal has concentrated the field force at ${event.assessment?.staging?.name || 'the agreed staging area'}.` }
      : { accepted: false, summary: 'You kept the army dispersed at home. It can still attack later, but may leave late or less prepared.' };
  }
  if (event.type === 'joint_operation_launch_confirmation') {
    plan.execution ||= {};
    if (choice !== 'yes') {
      plan.execution[role] = { status: 'reneged_by_player', tick: currentTick, declaredFraction: role === 'proposer' ? plan.proposerDeclaredFraction : plan.partnerDeclaredFraction, actualFraction: 0 };
      return { accepted: false, summary: 'You did not launch on the agreed date. Your ally may treat this as a broken commitment.' };
    }
    const enemy = regionsById.get(plan.enemyRegionId);
    const declared = clamp(role === 'proposer' ? plan.proposerDeclaredFraction : plan.partnerDeclaredFraction, 0.08, 0.95);
    const requested = Math.max(1, Math.floor((player.army?.personnel || 0) * declared));
    const reach = enemy ? canCampaign(player, enemy, activeCampaigns, [...regionsById.values()], polities) : { possible: false, reason: 'no_target' };
    if (!enemy || !reach.possible) {
      plan.execution[role] = { status: 'unable', tick: currentTick, reason: reach.reason || 'no_target' };
      return { accepted: false, summary: `The attack could not be launched (${String(reach.reason || 'no target').replaceAll('_', ' ')}).` };
    }
    const campaign = launchCampaign(player, enemy, plan.objective || 'subjugation', requested, currentTick, {
      campaigns: activeCampaigns, regions: [...regionsById.values()], polities,
      subregionalObjective: plan.subregionalObjective || 'capital',
    });
    if (!campaign) return { accepted: false, summary: 'The Marshal could not form the expedition from the available force.' };
    campaign.jointOperationId = plan.id;
    campaign.battleCommand = { declaredCommitmentFraction: declared, intendedCommitmentFraction: declared, reserveFraction: clamp(1 - declared, 0, 0.75), commandRelationship: 'independent_allied_command' };
    activeCampaigns.push(campaign);
    plan.execution[role] = { status: 'launched', tick: currentTick, campaignId: campaign.id, actualFraction: declared };
    return { accepted: true, campaign, summary: `The attack has been launched as promised with about ${Math.round(declared * 100)}% of the available home army.` };
  }
  return { accepted: false, summary: 'No action was taken.' };
}

export function upcomingPlayerJointOperations(player, agreements, currentTick) {
  return agreements.filter((a) => a.active && a.type === 'joint_operation' && roleFor(player, a))
    .map((plan) => ({ plan, role: roleFor(player, plan), weeksUntilAttack: plan.attackTick - currentTick, preparation: preparation(plan, roleFor(player, plan)) }))
    .sort((a, b) => a.plan.attackTick - b.plan.attackTick);
}
