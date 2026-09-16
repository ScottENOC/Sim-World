import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialisePoliticalContinuity } from '../js/politics/continuityCore.js';
import { ensureInstitutionalCrisisState } from '../js/politics/institutionalCrises.js';
import { resolveRegimeChangeAttempt, regimeChangeAssessment, tickRegimeChange } from '../js/politics/regimeChange.js';

function region(id, polityId, pressure = 0.75, mobilisation = 0.65, grievance = 0.78) {
  return {
    id,
    name: id,
    polityId,
    population: 10000,
    wallet: 150,
    stability: 0.25,
    army: { personnel: 500, away: 0, cohesion: 0.28 },
    governance: {
      sovereignPolityId: polityId,
      localPolityId: polityId,
      localRulerId: id,
      relationship: 'core',
      autonomy: 0,
      administrativeControl: 1,
    },
    popularWellbeing: {
      satisfaction: 0.22,
      grievance,
      revolutionaryPressure: pressure,
      mobilisationPotential: mobilisation,
      politicalVoice: 0.12,
    },
  };
}

function polity(id, capitalRegionId) {
  return {
    id,
    name: `${id} state`,
    capitalRegionId,
    rulerRegionId: capitalRegionId,
    administration: {
      legitimacy: 0.24,
      officialdom: 0.08,
      experience: { recordKeeping: 0, accounting: 0, communications: 0, officialdom: 0, delegation: 0 },
      breakthroughs: new Set(),
    },
    report: { tributeReceived: 0, subjectCount: 0, administrativeLoad: 0, administrativeCapacity: 0 },
  };
}

// Successful coup replaces sovereignty and sends the displaced government into
// the same exile machinery used after conquest.
{
  const incumbent = polity('old', 'a');
  const regions = [region('a', incumbent.id), region('b', incumbent.id)];
  const polities = [incumbent];
  initialisePoliticalContinuity(polities, regions, 0);
  const crisis = ensureInstitutionalCrisisState(incumbent);
  crisis.coupRisk = 0.95;
  incumbent.stateAdministration = { court: { factionalism: 0.9 } };
  const assessment = regimeChangeAssessment(incumbent, regions);
  const event = resolveRegimeChangeAttempt(incumbent, 'coup', regions, polities, 100, assessment, () => 0.001);
  assert.equal(event.type, 'coup_succeeded');
  assert.equal(polities.length, 2);
  const successor = polities.find((candidate) => candidate.id === event.successorPolityId);
  assert.ok(successor, 'successful coup should create a successor government');
  assert.ok(regions.every((item) => item.governance.sovereignPolityId === successor.id), 'successful coup should transfer the state');
  assert.equal(incumbent.continuity.status, 'exile', 'displaced government should remain as an exile actor');
  assert.equal(successor.predecessorPolityId, incumbent.id);
}

// A strong but not overwhelming revolution should split the country instead of
// magically deciding the entire struggle in one RNG roll.
{
  const incumbent = polity('realm', 'r1');
  const regions = [
    region('r1', incumbent.id, 0.62, 0.52, 0.72),
    region('r2', incumbent.id, 0.86, 0.72, 0.85),
    region('r3', incumbent.id, 0.80, 0.68, 0.82),
    region('r4', incumbent.id, 0.45, 0.38, 0.58),
  ];
  const polities = [incumbent];
  initialisePoliticalContinuity(polities, regions, 0);
  const crisis = ensureInstitutionalCrisisState(incumbent);
  crisis.revolutionRisk = 0.78;
  crisis.pressure = 0.82;
  const assessment = regimeChangeAssessment(incumbent, regions);
  assert.ok(assessment.revolutionaryStrength >= 0.5 && assessment.revolutionaryStrength < 0.72,
    `fixture should produce a contested revolution, got ${assessment.revolutionaryStrength}`);
  const event = resolveRegimeChangeAttempt(incumbent, 'revolution', regions, polities, 200, assessment, () => 0.001);
  assert.equal(event.type, 'revolution_civil_war_started');
  const revolutionary = polities.find((candidate) => candidate.id === event.successorPolityId);
  assert.ok(revolutionary);
  const incumbentRegions = regions.filter((item) => item.governance.sovereignPolityId === incumbent.id);
  const rebelRegions = regions.filter((item) => item.governance.sovereignPolityId === revolutionary.id);
  assert.ok(incumbentRegions.length > 0 && rebelRegions.length > 0, 'civil war should leave territory on both sides');
  assert.equal(incumbent.regimeConflict.status, 'active');
  assert.equal(revolutionary.regimeConflict.incumbentPolityId, incumbent.id);
}

// If the revolutionary side takes the old capital, the surviving incumbent must
// receive a valid new seat before the player/UI handoff tries to follow it.
{
  const incumbent = polity('capital-test', 'c1');
  const regions = [
    region('c1', incumbent.id, 0.95, 0.82, 0.90),
    region('c2', incumbent.id, 0.84, 0.72, 0.84),
    region('c3', incumbent.id, 0.35, 0.30, 0.45),
    region('c4', incumbent.id, 0.30, 0.28, 0.42),
  ];
  regions[2].population = 14000;
  const polities = [incumbent];
  initialisePoliticalContinuity(polities, regions, 0);
  const crisis = ensureInstitutionalCrisisState(incumbent);
  crisis.revolutionRisk = 0.78;
  crisis.pressure = 0.82;
  const assessment = regimeChangeAssessment(incumbent, regions);
  assert.ok(assessment.revolutionaryStrength < 0.72, 'fixture should remain a contested revolution');
  const event = resolveRegimeChangeAttempt(incumbent, 'revolution', regions, polities, 220, assessment, () => 0.001);
  assert.equal(event.type, 'revolution_civil_war_started');
  assert.notEqual(incumbent.capitalRegionId, 'c1', 'incumbent capital should move when rebels seize it');
  assert.equal(event.incumbentSeatRegionId, incumbent.capitalRegionId);
  assert.equal(regions.find((item) => item.id === incumbent.capitalRegionId)?.governance?.sovereignPolityId, incumbent.id,
    'replacement incumbent seat must remain under incumbent sovereignty');
}

// The live tick must no longer special-case the player out of regime change.
// Zero RNG guarantees both the hazard trigger and the resulting attempt succeed.
{
  const incumbent = polity('player-state', 'p1');
  const regions = [region('p1', incumbent.id), region('p2', incumbent.id)];
  const polities = [incumbent];
  initialisePoliticalContinuity(polities, regions, 0);
  const crisis = ensureInstitutionalCrisisState(incumbent);
  crisis.revolutionRisk = 0.96;
  crisis.coupRisk = 0.92;
  crisis.pressure = 0.95;
  incumbent.stateAdministration = { court: { factionalism: 0.85 } };
  const events = tickRegimeChange(polities, regions, 400, 365.2425, () => 0, { playerPolityId: incumbent.id });
  assert.ok(events.some((event) => ['coup_succeeded', 'revolution_succeeded', 'revolution_civil_war_started'].includes(event.type)),
    'player polity should resolve a real regime-change event rather than a warning-only placeholder');
  assert.ok(events.every((event) => event.type !== 'player_regime_crisis'), 'warning-only player suppression should be gone');
  assert.ok(events.some((event) => event.playerRelevant === true), 'player regime-change event should be marked player-relevant');
}

const wrapper = fs.readFileSync(new URL('../js/politics/continuity.js', import.meta.url), 'utf8');
const wellbeingAt = wrapper.indexOf('tickPopularWellbeing(');
const institutionsAt = wrapper.indexOf('tickInstitutionalPolitics(');
const regimeAt = wrapper.indexOf('tickRegimeChange(');
const continuityAt = wrapper.indexOf('tickPoliticalContinuityCore(');
assert.ok(wellbeingAt >= 0 && wellbeingAt < institutionsAt && institutionsAt < regimeAt && regimeAt < continuityAt,
  'live political pass should run wellbeing, institutions, regime change, then continuity');
assert.equal(wrapper.includes('player_regime_crisis'), false, 'continuity wrapper should not suppress player overthrow behind warning events');

const mainSource = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
assert.ok(mainSource.includes("politicalEvent.type === 'coup_succeeded' || politicalEvent.type === 'revolution_succeeded'"),
  'main loop should hand a displaced player government to its exile seat');
assert.ok(mainSource.includes("politicalEvent.type === 'revolution_civil_war_started'"),
  'main loop should hand a player incumbent to a surviving civil-war seat');
assert.ok(mainSource.includes('playerRegionId = nextPlayerRegionId;') && mainSource.includes('fogOfWar.setPlayerRegion(nextPlayerRegionId);'),
  'player handoff should update both the private region pointer and fog-of-war origin');

console.log('regime change regressions passed');
