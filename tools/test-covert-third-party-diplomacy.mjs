import assert from 'node:assert/strict';
import { ensureInstitutionalGovernment } from '../js/politics/institutionalPowers.js';
import { ensureInstitutionalCrisisState } from '../js/politics/institutionalCrises.js';
import { relationToward, tradeRelationMultiplier, tickDiplomacy } from '../js/diplomacy/relations.js';
import {
  COVERT_THIRD_PARTY_ACTIONS,
  applyThirdPartyCovertAction,
  thirdPartyCovertAssessment,
  tickCovertThirdPartyDiplomacy,
} from '../js/diplomacy/covertIncidentThirdParty.js';
import { covertDemandResponseAssessment } from '../js/diplomacy/covertIncidentResponses.js';

function polity(id, capitalRegionId) {
  const p = { id, name: id, capitalRegionId, administration: { legitimacy: .6, officialdom: .5, delegation: .5, breakthroughs: new Set(), experience: {} }, continuity: { legitimacy: .6, status: 'sovereign' } };
  ensureInstitutionalGovernment(p);
  return p;
}
function region(id, polityId) {
  return { id, name: id, population: 100000, treasury: 500, wallet: 100, stockpile: {}, neighbors: [], adjacentSeaIds: [], army: { personnel: 500, away: 0 }, governance: { sovereignPolityId: polityId, localPolityId: polityId }, relations: new Map(), stability: .7 };
}
function incident(victimId, culpritId) {
  return {
    id: 'incident-1', mission: 'vip_capture', targetActorId: victimId, attributedActorId: culpritId,
    attributed: true, attributionConfidence: .9, publicAttributionConfidence: .9,
    status: 'responded', response: 'ultimatum', responseTick: 10, createdTick: 9,
    responseAssessment: { outrage: .72, powerRatio: .55, nuclearRisk: .1 },
    demands: [{ id: 'd1', type: 'return_captive', status: 'pending', vipId: 'vip-1', deadlineTick: 14 }],
    escalationPressure: .35,
  };
}

// Friendly third parties should be capable of backing the victim and increasing coercive leverage.
{
  const victim = polity('victim', 'v'); const culprit = polity('culprit', 'c'); const ally = polity('ally', 'a');
  const v = region('v', victim.id); const c = region('c', culprit.id); const a = region('a', ally.id);
  relationToward(a, v.id).attitude = .8; relationToward(a, c.id).attitude = -.5;
  const inc = incident(victim.id, culprit.id);
  const before = covertDemandResponseAssessment(culprit, victim, inc, [v, c, a]);
  const result = applyThirdPartyCovertAction(ally, victim, culprit, inc, [v, c, a], 12, COVERT_THIRD_PARTY_ACTIONS.BACK_VICTIM);
  const after = covertDemandResponseAssessment(culprit, victim, inc, [v, c, a]);
  assert.equal(result.applied, true);
  assert.ok(inc.thirdPartyPressure > 0);
  assert.ok(after.scores.full_compliance >= before.scores.full_compliance, 'external backing should not make compliance less attractive');
}

// Neutral mediation should reduce crisis pressure on both sides and incident escalation pressure.
{
  const victim = polity('victim2', 'v2'); const culprit = polity('culprit2', 'c2'); const mediator = polity('mediator', 'm2');
  const v = region('v2', victim.id); const c = region('c2', culprit.id); const m = region('m2', mediator.id);
  relationToward(m, v.id).attitude = .35; relationToward(m, c.id).attitude = .30;
  v.nuclearDeterrence = { crises: { [culprit.id]: { pressure: .62, level: 3, history: [] } } };
  c.nuclearDeterrence = { crises: { [victim.id]: { pressure: .58, level: 3, history: [] } } };
  ensureInstitutionalCrisisState(victim).pressure = .4; ensureInstitutionalCrisisState(culprit).pressure = .3;
  const inc = incident(victim.id, culprit.id); inc.escalationPressure = .6;
  const result = applyThirdPartyCovertAction(mediator, victim, culprit, inc, [v, c, m], 12, COVERT_THIRD_PARTY_ACTIONS.MEDIATE);
  assert.equal(result.applied, true);
  assert.ok(v.nuclearDeterrence.crises[culprit.id].pressure < .62);
  assert.ok(c.nuclearDeterrence.crises[victim.id].pressure < .58);
  assert.ok(inc.escalationPressure < .6);
  assert.ok(inc.mediationSupport > 0);
}

// Sanctions should produce a real bilateral trade penalty and expire through diplomacy maintenance.
{
  const victim = polity('victim3', 'v3'); const culprit = polity('culprit3', 'c3'); const sanctioner = polity('sanctioner', 's3');
  const v = region('v3', victim.id); const c = region('c3', culprit.id); const s = region('s3', sanctioner.id);
  relationToward(s, v.id).attitude = .7; relationToward(s, c.id).attitude = -.4;
  const inc = incident(victim.id, culprit.id);
  const baseline = tradeRelationMultiplier(s, c);
  const result = applyThirdPartyCovertAction(sanctioner, victim, culprit, inc, [v, c, s], 20, COVERT_THIRD_PARTY_ACTIONS.SANCTION_CULPRIT);
  const sanctioned = tradeRelationMultiplier(s, c);
  assert.equal(result.applied, true);
  assert.ok(sanctioned < baseline, 'sanctions should reduce bilateral trade multiplier');
  tickDiplomacy([v, c, s], [], [], 80, 7, null, { maintainRelationships: true });
  assert.equal(relationToward(s, c.id).tradeSanctionSeverity, 0, 'expired sanction should clear');
}

// High nuclear danger should make balanced neutrals prefer mediation/restraint to taking a side.
{
  const victim = polity('victim4', 'v4'); const culprit = polity('culprit4', 'c4'); const neutral = polity('neutral4', 'n4');
  const v = region('v4', victim.id); const c = region('c4', culprit.id); const n = region('n4', neutral.id);
  relationToward(n, v.id).attitude = .2; relationToward(n, c.id).attitude = .22;
  v.nuclearDeterrence = { crises: { [culprit.id]: { pressure: .9, level: 4, history: [] } } };
  const inc = incident(victim.id, culprit.id); inc.escalationPressure = .8;
  const assessment = thirdPartyCovertAssessment(neutral, victim, culprit, inc, [v, c, n]);
  assert.ok([COVERT_THIRD_PARTY_ACTIONS.MEDIATE, COVERT_THIRD_PARTY_ACTIONS.URGE_RESTRAINT].includes(assessment.action));
}

// Player third parties should get a choice event rather than an automatic intervention.
{
  const victim = polity('victim5', 'v5'); const culprit = polity('culprit5', 'c5'); const player = polity('player5', 'p5');
  const v = region('v5', victim.id); const c = region('c5', culprit.id); const p = region('p5', player.id);
  relationToward(p, v.id).attitude = .9; relationToward(p, c.id).attitude = -.7;
  const inc = incident(victim.id, culprit.id); v.covertIncidentEscalation = { incidents: [inc], history: [], nextIncidentId: 2 };
  const events = tickCovertThirdPartyDiplomacy([victim, culprit, player], [v, c, p], 12, 7, () => 0, { playerPolityId: player.id });
  assert.ok(events.some((event) => event.type === 'covert_incident_third_party_action_available' && event.actorId === player.id));
  assert.equal((inc.thirdPartyInterventions || []).length, 0);
}

console.log('covert third-party diplomacy regressions passed');
