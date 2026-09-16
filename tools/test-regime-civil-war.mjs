import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialisePoliticalContinuity } from '../js/politics/continuityCore.js';
import { resolveRegimeConflictCapture } from '../js/military/campaigns.js';
import { tickRegimeCivilWars } from '../js/politics/regimeCivilWar.js';

function region(id, polityId, population = 10000) {
  return {
    id,
    name: id,
    population,
    stability: 0.5,
    neighbors: [],
    governance: {
      sovereignPolityId: polityId,
      localPolityId: polityId,
      localRulerId: id,
      relationship: 'core',
      autonomy: 0,
      administrativeControl: 1,
      tributeRate: 0,
    },
    controllingActorId: id,
    army: { personnel: 300, away: 0, cohesion: 0.7 },
    navy: { personnel: 0, boats: 0, advancedBoats: 0 },
    unlockedTechIds: new Set(),
    stockpile: {},
  };
}

function polity(id, capitalRegionId) {
  return {
    id,
    name: `${id} government`,
    capitalRegionId,
    rulerRegionId: capitalRegionId,
    administration: { legitimacy: 0.4, breakthroughs: new Set() },
    report: {},
  };
}

function activeConflict(incumbent, revolutionary, startedTick = 100) {
  const conflict = {
    type: 'revolution',
    startedTick,
    incumbentPolityId: incumbent.id,
    revolutionaryPolityId: revolutionary.id,
    contestedRegionIds: [],
    status: 'active',
  };
  incumbent.regimeConflict = { ...conflict };
  revolutionary.regimeConflict = { ...conflict };
  return conflict;
}

// A winning civil-war campaign transfers political sovereignty directly rather
// than dropping into the generic conquest/vassal settlement path. Losing the
// capital must relocate the defending government to territory it still owns.
{
  const incumbent = polity('incumbent', 'a');
  const revolutionary = polity('revolutionary', 'c');
  const regions = [region('a', incumbent.id, 9000), region('b', incumbent.id, 14000), region('c', revolutionary.id, 11000)];
  initialisePoliticalContinuity([incumbent, revolutionary], regions, 0);
  const conflict = activeConflict(incumbent, revolutionary);
  const campaign = {
    id: 1,
    attackerId: 'c',
    defenderId: 'a',
    regimeConflict: { ...conflict },
    settlementResolved: false,
    settlementQueued: false,
    outcome: 'submission_pending',
  };
  const result = resolveRegimeConflictCapture(campaign, regions[2], regions[0], [incumbent, revolutionary], regions, 130);
  assert.equal(result.resolved, true);
  assert.equal(regions[0].governance.sovereignPolityId, revolutionary.id);
  assert.equal(regions[0].governance.relationship, 'integrated');
  assert.equal(regions[0].governance.autonomy, 0.42);
  assert.equal(incumbent.capitalRegionId, 'b', 'incumbent should relocate to surviving territory after capital capture');
  assert.equal(incumbent.continuity.seatRegionId, 'b');
  assert.equal(result.newSeatRegionId, 'b');
  assert.equal(campaign.settlementResolved, true);
  assert.equal(campaign.outcome, 'region_lost');
}

// Once one side has no sovereign territory, the revolutionary conflict ends;
// the winner becomes sovereign and the loser continues through exile/claimant
// continuity rather than being deleted from the simulation.
{
  const incumbent = polity('old-order', 'x');
  const revolutionary = polity('new-order', 'y');
  const regions = [region('x', revolutionary.id), region('y', revolutionary.id)];
  initialisePoliticalContinuity([incumbent, revolutionary], regions, 0);
  activeConflict(incumbent, revolutionary, 200);
  incumbent.continuity.status = 'claimant';
  incumbent.continuity.seatRegionId = 'x';
  revolutionary.continuity.status = 'claimant';
  revolutionary.continuity.seatRegionId = 'y';
  const events = tickRegimeCivilWars([incumbent, revolutionary], regions, [], 240, () => 0.5, { playerPolityId: incumbent.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'regime_civil_war_resolved');
  assert.equal(events[0].outcome, 'revolutionary_victory');
  assert.equal(events[0].winnerPolityId, revolutionary.id);
  assert.equal(events[0].loserPolityId, incumbent.id);
  assert.equal(events[0].playerRelevant, true);
  assert.equal(revolutionary.continuity.status, 'sovereign');
  assert.equal(incumbent.continuity.status, 'exile');
  assert.equal(incumbent.regimeConflict, null);
  assert.equal(revolutionary.regimeConflict, null);
}

// Static integration checks complement the model tests: active conflicts must
// launch ordinary campaigns with regime metadata, main must tick the civil-war
// orchestrator, and post-capture player filtering must use the recorded sides
// because sovereignty has already changed by that point.
const civilWarSource = fs.readFileSync(new URL('../js/politics/regimeCivilWar.js', import.meta.url), 'utf8');
assert.ok(civilWarSource.includes("launchCampaign(option.attacker, option.defender, 'subjugation'"));
assert.ok(civilWarSource.includes('regimeConflict: {'));
assert.ok(civilWarSource.includes('CAMPAIGN_GAP_WEEKS'));

const campaignsSource = fs.readFileSync(new URL('../js/military/campaigns.js', import.meta.url), 'utf8');
assert.ok(campaignsSource.includes('resolveRegimeConflictCapture('));
assert.ok(campaignsSource.includes("event.type === 'regime_civil_war_region_captured'") || campaignsSource.includes("type: 'regime_civil_war_region_captured'"));
assert.ok(campaignsSource.includes("options.regimeConflict && attacker.neighbors?.includes(defender.id)"));

const mainSource = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
assert.ok(mainSource.includes('tickRegimeCivilWars(polities, regions, activeCampaigns'));
assert.ok(mainSource.includes("event.type === 'regime_civil_war_region_captured'"));
assert.ok(mainSource.includes('event.fromPolityId === activePlayerPolityId || event.toPolityId === activePlayerPolityId'));
assert.ok(mainSource.includes('captureEvent.newSeatRegionId'));
assert.ok(mainSource.includes('fogOfWar.setPlayerRegion(nextSeat)'));

console.log('regime civil war regressions passed');
