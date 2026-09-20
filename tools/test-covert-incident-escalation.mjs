import assert from 'node:assert/strict';
import {
  COVERT_INCIDENT_RESPONSES,
  applyCovertIncidentResponse,
  covertIncidentResponseAssessment,
  ensureCovertIncidentEscalation,
  registerCovertIncident,
  tickCovertIncidentEscalation,
} from '../js/diplomacy/covertIncidentEscalation.js';
import { harvestCovertIncidents } from '../js/diplomacy/covertIncidentBridge.js';
import { ensureInstitutionalGovernment } from '../js/politics/institutionalPowers.js';

function polity(id, capitalRegionId) {
  const p = {
    id,
    name: id,
    capitalRegionId,
    rulerRegionId: capitalRegionId,
    administration: { legitimacy: .55, officialdom: .5, delegation: .45, breakthroughs: new Set(), experience: {} },
    continuity: { legitimacy: .55, status: 'sovereign' },
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
    governance: { sovereignPolityId: polityId, localPolityId: polityId, administrativeControl: .75 },
    stability: .65,
    relations: new Map(),
    popularWellbeing: { satisfaction: .58, grievance: .28 },
  };
}

// Leadership-shock evidence should become one diplomatic incident, without
// duplicating the generic military-threat record from the same week.
{
  const target = region('target-capital', 'target');
  target.governance.pendingLeadershipShocks = [{
    tick: 100,
    operationId: 'op-1',
    sourceActorId: 'culprit',
    removedBy: 'capture',
    detected: true,
    attributed: true,
    vip: { id: 'target-leader', role: 'ruler', label: 'Target leader' },
  }];
  target.militaryThreat = {
    lastCovertAttackTick: 100,
    lastCovertAttackActorId: 'culprit',
    lastCovertAttackMission: 'vip_capture',
    lastCovertAttackAttributed: true,
  };
  const made = harvestCovertIncidents([target], 100);
  assert.ok(made.length >= 1);
  const state = ensureCovertIncidentEscalation(target);
  assert.ok(state.incidents.some((incident) => incident.operationId === 'op-1'));
  const before = state.incidents.length;
  harvestCovertIncidents([target], 101);
  assert.equal(state.incidents.length, before, 'harvesting the same evidence twice must not duplicate incidents');
}

// A captured leader can generate an explicit return demand rather than forcing
// military escalation.
{
  const responder = polity('responder', 'r1');
  const culprit = polity('culprit', 'c1');
  const r1 = region('r1', responder.id, 800);
  const c1 = region('c1', culprit.id, 650);
  const regions = [r1, c1];
  const incident = registerCovertIncident(r1, {
    mission: 'vip_capture', sourceActorId: culprit.id, attributed: true,
    attributionProbability: .9, vip: { id: 'leader', role: 'ruler' }, success: true,
  }, 200);
  const result = applyCovertIncidentResponse(responder, culprit, incident, regions, 201, COVERT_INCIDENT_RESPONSES.DEMAND_RETURN, { rng: () => 0 });
  assert.equal(result.applied, true);
  assert.equal(incident.response, COVERT_INCIDENT_RESPONSES.DEMAND_RETURN);
  assert.ok(incident.demands.some((demand) => demand.type === 'return_captive'));
}

// Nuclear survivability should make open limited force less attractive and
// make covert retaliation/mobilisation relatively more attractive.
{
  const responder = polity('responder2', 'r2');
  const culprit = polity('nuclear-culprit', 'c2');
  const r2 = region('r2', responder.id, 1100);
  const c2 = region('c2', culprit.id, 900);
  c2.nuclearWeapons = {
    policy: { programme: 'prototype', testPolicy: 'public', secrecy: .1 },
    weaponisationProgress: 1,
    validationConfidence: .9,
    programmeExperience: .8,
    prototypeCount: 2,
    tests: [{ tick: 10, completed: true, detected: true, publiclyDeclared: true }],
    observableSignals: { researchFootprint: 1, procurement: 1, testRange: 1, concealment: .1 },
  };
  c2.strategicNuclear = { policy: { posture: 'strategic', secrecy: .1 } };
  c2.strategicDelivery = {
    air: { available: true, survivability: .55 },
    land: { available: true, survivability: .7 },
    sea: { available: true, survivability: .8 },
    warning: .7,
    commandResilience: .8,
  };
  const incident = registerCovertIncident(r2, {
    mission: 'vip_assassination', sourceActorId: culprit.id, attributed: true,
    attributionProbability: .95, vip: { id: 'head', role: 'head_of_state' }, success: true,
  }, 300);
  const nuclear = covertIncidentResponseAssessment(responder, culprit, incident, [r2, c2]);

  const conventionalCulprit = polity('conventional', 'c3');
  const c3 = region('c3', conventionalCulprit.id, 900);
  const incident2 = registerCovertIncident(r2, {
    mission: 'vip_assassination', sourceActorId: conventionalCulprit.id, attributed: true,
    attributionProbability: .95, vip: { id: 'head2', role: 'head_of_state' }, success: true,
  }, 301);
  const conventional = covertIncidentResponseAssessment(responder, conventionalCulprit, incident2, [r2, c3]);
  assert.ok(nuclear.nuclearRisk > conventional.nuclearRisk, 'demonstrated nuclear capability should increase escalation risk');
  assert.ok(nuclear.scores.limited_force < conventional.scores.limited_force, 'nuclear deterrence should suppress open limited-force retaliation');
  assert.ok(nuclear.scores.covert_retaliation >= nuclear.scores.limited_force, 'nuclear danger should push retaliation toward lower-visibility channels');
}

// NPC processing should answer an attributed incident, while a player target is
// surfaced as a choice instead of being auto-resolved.
{
  const npc = polity('npc', 'n1');
  const player = polity('player', 'p1');
  const culprit = polity('culprit3', 'x1');
  const n1 = region('n1', npc.id, 700);
  const p1 = region('p1', player.id, 700);
  const x1 = region('x1', culprit.id, 500);
  const npcIncident = registerCovertIncident(n1, { mission: 'special_sabotage', sourceActorId: culprit.id, attributed: true, attributionProbability: .8 }, 400);
  const playerIncident = registerCovertIncident(p1, { mission: 'vip_capture', sourceActorId: culprit.id, attributed: true, attributionProbability: .8, vip: { id: 'p-vip', role: 'ruler' } }, 400);
  const events = tickCovertIncidentEscalation([npc, player, culprit], [n1, p1, x1], 402, 7, () => 0, { playerPolityId: player.id });
  assert.notEqual(npcIncident.status, 'unanswered', 'NPC should choose a response');
  assert.equal(playerIncident.status, 'unanswered', 'player incident should remain available for player decision');
  assert.ok(events.some((event) => event.type === 'covert_incident_response_available' && event.targetActorId === player.id));
}

console.log('covert incident escalation regressions passed');
