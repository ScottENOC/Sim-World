import assert from 'node:assert/strict';
import {
  COVERT_INCIDENT_RESPONSES,
  applyCovertIncidentResponse,
  registerCovertIncident,
} from '../js/diplomacy/covertIncidentEscalation.js';
import {
  COVERT_DEMAND_REPLIES,
  applyCovertDemandResponse,
  covertDemandResponseAssessment,
  tickCovertDemandResponses,
} from '../js/diplomacy/covertIncidentResponses.js';
import { ensureInstitutionalGovernment } from '../js/politics/institutionalPowers.js';

function polity(id, capitalRegionId) {
  const p = {
    id,
    name: id,
    capitalRegionId,
    rulerRegionId: capitalRegionId,
    administration: { legitimacy: .62, officialdom: .58, delegation: .52, breakthroughs: new Set(), experience: {} },
    continuity: { legitimacy: .62, status: 'sovereign' },
  };
  ensureInstitutionalGovernment(p);
  return p;
}

function region(id, polityId, army = 500) {
  return {
    id,
    name: id,
    population: 100000,
    treasury: 500,
    wallet: 100,
    stockpile: {},
    unlockedTechIds: new Set(),
    army: { personnel: army, away: 0, cohesion: .7 },
    governance: { sovereignPolityId: polityId, localPolityId: polityId, administrativeControl: .75, vipStatus: {} },
    stability: .68,
    relations: new Map(),
    popularWellbeing: { satisfaction: .6, grievance: .24 },
  };
}

function capturedLeaderFixture() {
  const victim = polity('victim', 'v1');
  const culprit = polity('culprit', 'c1');
  const v1 = region('v1', victim.id, 900);
  const c1 = region('c1', culprit.id, 650);
  c1.specialForces = {
    version: 1, operators: 24, available: 24, training: .7, experience: .5,
    missionExperience: {}, nextOperationId: 1, operations: [], rescuedVips: [],
    captives: [{ id: 'leader', role: 'ruler', label: 'Leader', capturedFromRegionId: v1.id, capturedTick: 100, operationId: 'op-capture' }],
  };
  v1.governance.vipStatus.leader = { status: 'captured', heldByActorId: culprit.id, sinceTick: 100 };
  const incident = registerCovertIncident(v1, {
    operationId: 'op-capture', mission: 'vip_capture', sourceActorId: culprit.id,
    attributed: true, attributionProbability: .95, vip: { id: 'leader', role: 'ruler', label: 'Leader' }, success: true,
  }, 100);
  const response = applyCovertIncidentResponse(victim, culprit, incident, [v1, c1], 101, COVERT_INCIDENT_RESPONSES.ULTIMATUM, { rng: () => 0 });
  assert.equal(response.applied, true);
  return { victim, culprit, v1, c1, incident };
}

// Full compliance should actually return a captive, pay the demanded money,
// accept the apology/cease demands, and cool an existing nuclear crisis.
{
  const { victim, culprit, v1, c1, incident } = capturedLeaderFixture();
  v1.nuclearDeterrence = { crises: { [culprit.id]: { opponentActorId: culprit.id, pressure: .55, level: 2, history: [] } } };
  const beforeVictimTreasury = v1.treasury;
  const beforeCulpritTreasury = c1.treasury;
  const result = applyCovertDemandResponse(culprit, victim, incident, [v1, c1], 103, COVERT_DEMAND_REPLIES.FULL_COMPLIANCE, { rng: () => 0 });
  assert.equal(result.applied, true);
  assert.equal(incident.status, 'settled');
  assert.equal(c1.specialForces.captives.length, 0, 'captured leader should physically leave captor custody');
  assert.equal(v1.governance.vipStatus.leader.status, 'released');
  assert.ok(v1.treasury > beforeVictimTreasury, 'compensation should transfer to the victim');
  assert.ok(c1.treasury < beforeCulpritTreasury, 'compensation should be paid by the culprit');
  assert.ok(incident.demands.every((d) => d.status === 'accepted'));
  assert.ok(v1.nuclearDeterrence.crises[culprit.id].pressure < .55, 'settlement should cool an existing nuclear crisis');
}

// A low-confidence accusation should make denial substantially more plausible
// than it is under strong evidence, without secretly consulting the true source.
{
  const victim = polity('victim2', 'v2');
  const culprit = polity('culprit2', 'c2');
  const v2 = region('v2', victim.id, 500);
  const c2 = region('c2', culprit.id, 500);
  const weak = registerCovertIncident(v2, { mission: 'special_sabotage', sourceActorId: culprit.id, attributed: true, attributionProbability: .08 }, 200);
  weak.attributionConfidence = .35;
  applyCovertIncidentResponse(victim, culprit, weak, [v2, c2], 201, COVERT_INCIDENT_RESPONSES.PROTEST, { rng: () => 0 });
  const weakAssessment = covertDemandResponseAssessment(culprit, victim, weak, [v2, c2]);

  const strong = registerCovertIncident(v2, { mission: 'special_sabotage', sourceActorId: culprit.id, attributed: true, attributionProbability: .95 }, 202);
  strong.attributionConfidence = .93;
  applyCovertIncidentResponse(victim, culprit, strong, [v2, c2], 203, COVERT_INCIDENT_RESPONSES.PROTEST, { rng: () => 0 });
  const strongAssessment = covertDemandResponseAssessment(culprit, victim, strong, [v2, c2]);
  assert.ok(weakAssessment.plausibleDenial > strongAssessment.plausibleDenial);
  assert.ok(weakAssessment.scores.deny_responsibility > strongAssessment.scores.deny_responsibility);

  const denied = applyCovertDemandResponse(culprit, victim, weak, [v2, c2], 204, COVERT_DEMAND_REPLIES.DENY_RESPONSIBILITY, { rng: () => 0 });
  assert.equal(denied.applied, true);
  assert.equal(weak.perpetratorStatement.type, 'denial');
  assert.ok(weak.publicAttributionConfidence < weak.attributionConfidence, 'a plausible denial can reduce public confidence without changing the underlying evidence');
}

// Stalling should preserve live demands, buy limited time, and become less
// attractive after repeated use rather than allowing an endless free delay.
{
  const { victim, culprit, v1, c1, incident } = capturedLeaderFixture();
  const firstDeadline = incident.demands.find((d) => Number.isFinite(d.deadlineTick)).deadlineTick;
  const first = applyCovertDemandResponse(culprit, victim, incident, [v1, c1], 103, COVERT_DEMAND_REPLIES.STALL, { rng: () => 0 });
  assert.equal(first.applied, true);
  assert.ok(incident.demands.some((d) => d.status === 'pending'));
  assert.ok(incident.demands.find((d) => Number.isFinite(d.deadlineTick)).deadlineTick > firstDeadline);
  const scoreAfterFirst = covertDemandResponseAssessment(culprit, victim, incident, [v1, c1]).scores.stall;
  incident.perpetratorResponseTick = 100;
  applyCovertDemandResponse(culprit, victim, incident, [v1, c1], 107, COVERT_DEMAND_REPLIES.STALL, { rng: () => 0 });
  const scoreAfterSecond = covertDemandResponseAssessment(culprit, victim, incident, [v1, c1]).scores.stall;
  assert.ok(scoreAfterSecond < scoreAfterFirst, 'repeated stalling should lose attractiveness');
}

// NPC accused states should answer demands automatically. If the accused state
// is player-controlled, the demand response should be surfaced instead.
{
  const npcCase = capturedLeaderFixture();
  const npcEvents = tickCovertDemandResponses([npcCase.victim, npcCase.culprit], [npcCase.v1, npcCase.c1], 103, 7, () => 0, {});
  assert.ok(npcEvents.some((event) => event.type === 'covert_incident_demand_response'));
  assert.ok(npcCase.incident.perpetratorResponse, 'NPC culprit should choose a reply');

  const playerCase = capturedLeaderFixture();
  const playerEvents = tickCovertDemandResponses([playerCase.victim, playerCase.culprit], [playerCase.v1, playerCase.c1], 103, 7, () => 0, { playerPolityId: playerCase.culprit.id });
  assert.ok(playerEvents.some((event) => event.type === 'covert_incident_demand_response_available'));
  assert.equal(playerCase.incident.perpetratorResponse, undefined, 'player culprit must not be auto-resolved');
  assert.equal(playerCase.incident.awaitingPerpetratorPlayerResponse, true);
}

console.log('covert incident demand response regressions passed');
