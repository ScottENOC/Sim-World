import assert from 'node:assert/strict';
import fs from 'node:fs';
import { establishParliament, requireInstitutionalConsent } from '../js/politics/institutionalPowers.js';
import { governmentActionAuthority, requestExecutiveAction } from '../js/politics/institutionalActions.js';
import {
  USE_OF_FORCE,
  authoriseUseOfForce,
  classifyCampaignUseOfForce,
  classifyRaidUseOfForce,
  governmentActionForUseOfForce,
  isRecentReprisal,
} from '../js/politics/useOfForce.js';

const polity = { id: 'limited-state' };
establishParliament(polity, { strength: 0.8, independence: 0.8, representation: 0.8 });
requireInstitutionalConsent(polity, 'limitedForce', 'parliament');

assert.equal(governmentActionAuthority(polity, 'launch_raid').power, 'limitedForce');
assert.equal(governmentActionAuthority(polity, 'launch_reprisals').power, 'limitedForce');
assert.equal(governmentActionAuthority(polity, 'launch_limited_military_action').power, 'limitedForce');
assert.equal(governmentActionAuthority(polity, 'launch_offensive_war').power, 'offensiveWar');
assert.equal(requestExecutiveAction(polity, 'launch_raid').allowed, false);
assert.equal(requestExecutiveAction(polity, 'launch_raid', ['parliament']).allowed, true);

const attacker = {
  id: 'a', polityId: polity.id, governance: { sovereignPolityId: polity.id },
  militaryThreat: { lastRaidedTick: 90, lastRaiderActorId: 'enemy-polity' },
};
const enemy = { id: 'b', polityId: 'enemy-polity', governance: { sovereignPolityId: 'enemy-polity' } };
const stranger = { id: 'c', polityId: 'stranger-polity', governance: { sovereignPolityId: 'stranger-polity' } };

assert.equal(isRecentReprisal(attacker, enemy, 100), true);
assert.equal(classifyRaidUseOfForce(attacker, enemy, 100), USE_OF_FORCE.REPRISAL);
assert.equal(classifyRaidUseOfForce(attacker, stranger, 100), USE_OF_FORCE.RAID);
assert.equal(classifyRaidUseOfForce(attacker, enemy, 117), false ? USE_OF_FORCE.REPRISAL : USE_OF_FORCE.RAID);
assert.equal(classifyCampaignUseOfForce(attacker, enemy, 'punitive', 100), USE_OF_FORCE.LIMITED_CAMPAIGN);
assert.equal(classifyCampaignUseOfForce(attacker, enemy, 'subjugation', 100), USE_OF_FORCE.FORMAL_WAR);
assert.equal(classifyCampaignUseOfForce(attacker, enemy, 'devastation', 100), USE_OF_FORCE.FORMAL_WAR);
assert.equal(governmentActionForUseOfForce(USE_OF_FORCE.REPRISAL), 'launch_reprisals');
assert.equal(governmentActionForUseOfForce(USE_OF_FORCE.LIMITED_CAMPAIGN), 'launch_limited_military_action');
assert.equal(governmentActionForUseOfForce(USE_OF_FORCE.FORMAL_WAR), 'launch_offensive_war');

const blocked = authoriseUseOfForce(attacker, enemy, USE_OF_FORCE.RAID, {
  polities: [polity], approvals: [], currentTick: 100, registerRefusal: false,
});
assert.equal(blocked.allowed, false);
const approved = authoriseUseOfForce(attacker, enemy, USE_OF_FORCE.RAID, {
  polities: [polity], approvals: ['parliament'], currentTick: 100, registerRefusal: false,
});
assert.equal(approved.allowed, true);

const raidSource = fs.readFileSync(new URL('../js/military/raiding.js', import.meta.url), 'utf8');
assert.ok(raidSource.indexOf('authoriseUseOfForce(attacker, defender') < raidSource.indexOf('attacker.army.personnel -= homePersonnel'),
  'raid authority must be resolved before home-army mutation');
assert.ok(raidSource.includes('defender.militaryThreat.lastRaiderActorId = actorId(attacker)'),
  'resolved raids should record the aggressor for later reprisal classification');

const uiSource = fs.readFileSync(new URL('../js/ui/useOfForceUi.js', import.meta.url), 'utf8');
assert.ok(uiSource.includes("document.addEventListener('click'"));
assert.ok(uiSource.includes('event.stopImmediatePropagation()'));
assert.ok(uiSource.includes('No troops were mustered.'), 'player refusal should occur before the legacy raid handler musters vassals');
assert.ok(uiSource.includes('}, true);'), 'raid pre-authorisation listener must run in capture phase');

console.log('use-of-force regressions passed');
