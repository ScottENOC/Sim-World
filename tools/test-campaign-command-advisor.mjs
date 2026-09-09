import assert from 'node:assert/strict';
import { issueCampaignOrder, marshalCampaignAssessment, tickCampaignCommandAdvisor } from '../js/military/campaignCommand.js';
import { battleParticipationFraction } from '../js/military/battleCommand.js';

function region(id, polityId) {
  return {
    id, name: id, controllingActorId: polityId,
    governance: { sovereignPolityId: polityId },
    militaryStrategy: { posture: 'guarded' },
    militaryProfessionalisation: { institutionalExperience: 0.3 },
  };
}

function campaign() {
  return {
    id: 1, attackerId: 'Kent', defenderId: 'Essex', occupationActorId: 'polity_Kent',
    phase: 'engaged', viaSea: true, completed: false, initialPersonnel: 1000, personnel: 800,
    attackerCasualties: 200, attackerMorale: 0.7, supply: 0.7, pressure: 0.3,
    subregional: { objectivePolicy: 'balanced', currentNodeId: 'kent-node', targetNodeId: null, route: [], routeIndex: 0, edgeProgress: 0, blockedByCampaignId: null },
    logisticsState: { status: 'supplied', supplyFraction: 0.7, internalCorridorReliability: 0.9, weeklyRequirement: 100, carriedFood: 400 },
  };
}

{
  const c = campaign();
  c.logisticsState.status = 'severe_shortage';
  c.logisticsState.internalCorridorReliability = 0.1;
  c.logisticsState.corridorBrokenNodeId = 'road-town';
  c.supply = 0.18;
  const a = marshalCampaignAssessment(c, region('Kent','polity_Kent'), region('Essex','polity_Essex'));
  assert.equal(a.risk, 'critical');
  assert.equal(a.recommendation, 'secure_supply');
}

{
  const c = campaign();
  assert.equal(issueCampaignOrder(c, 'hold', null, 12, { playerIssued: true }).changed, true);
  assert.equal(c.subregional.objectivePolicy, 'hold');
  assert.equal(c.commandState.order, 'hold');
  assert.equal(c.playerOperationalOverride, true);
}

{
  const c = campaign();
  const attacker = region('Kent','polity_Kent');
  issueCampaignOrder(c, 'avoid_battle', null, 1, { playerIssued: true });
  assert.ok(battleParticipationFraction(c, attacker) <= 0.55, 'avoid battle should cap committed share');
  issueCampaignOrder(c, 'seek_battle', null, 2, { playerIssued: true });
  assert.ok(battleParticipationFraction(c, attacker) >= 0.95, 'seek battle should commit almost all available force');
}

{
  const c = campaign();
  c.logisticsState.internalCorridorReliability = 0.3;
  c.logisticsState.corridorBrokenNodeId = 'road-town';
  const events = tickCampaignCommandAdvisor([c], [region('Kent','polity_Kent'), region('Essex','polity_Essex')], 'polity_Kent', 20);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'campaign_command_advice');
  assert.equal(events[0].assessment.recommendation, 'secure_supply');
  assert.equal(tickCampaignCommandAdvisor([c], [region('Kent','polity_Kent'), region('Essex','polity_Essex')], 'polity_Kent', 21).length, 0, 'same crisis should not spam a popup every week');
}

console.log('campaign command advisor regressions passed');
