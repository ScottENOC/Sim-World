import assert from 'node:assert/strict';
import { acknowledgeVictory, ensureEndgameState, shouldShowVictoryScreen } from '../js/core/endgame.js';
import { bindPersistentEndgameState, evaluateFocusedScenarioVictory } from '../js/ui/victoryContinuationUi.js';

function makeSim({ persistedState = null } = {}) {
  const polity = { id: 'player-polity', scenarioActorId: 'player-country' };
  if (persistedState) polity._worldsimEndgame = structuredClone(persistedState);
  let resolutionCalls = 0;
  let outcomeCalls = 0;
  const sim = {
    activePlayerPolityId: polity.id,
    polities: [polity],
    scenarioState: { scenarioId: 'test-focused-scenario' },
    clock: { tickIndex: 42, elapsedDays: 720 },
    updateScenarioResolution() {
      resolutionCalls += 1;
      return { resolved: true, peaceDays: 180, requiredPeaceDays: 180 };
    },
    scenarioOutcomeFor(countryId) {
      outcomeCalls += 1;
      assert.equal(countryId, 'player-country');
      return {
        ready: true,
        outcome: {
          countryId,
          minimumSuccess: true,
          score: 0.81,
          result: 'strong-success',
          dimensions: { sovereignty: 1 },
        },
      };
    },
    counts() { return { resolutionCalls, outcomeCalls }; },
  };
  return sim;
}

// Old saves have no endgame state. Binding should initialise the fields without
// pretending that victory has already happened.
const migrated = makeSim();
const migratedState = bindPersistentEndgameState(migrated);
assert.equal(migratedState.victoryAchieved, false);
assert.equal(migratedState.victoryAcknowledged, false);
assert.equal(migratedState.continueAfterVictory, false);
assert.equal(shouldShowVictoryScreen(migrated), false);
assert.equal(migrated.polities[0]._worldsimEndgame, migrated.endgame);

// The first resolved outcome records victory exactly once and leaves a snapshot
// of the result for the celebration screen.
const first = evaluateFocusedScenarioVictory(migrated);
assert.equal(first.newlyAchieved, true);
assert.equal(migrated.endgame.victoryAchieved, true);
assert.equal(migrated.endgame.victoryTick, 42);
assert.equal(migrated.endgame.victorySnapshot.scenarioId, 'test-focused-scenario');
assert.equal(migrated.endgame.victorySnapshot.outcome.result, 'strong-success');
assert.equal(shouldShowVictoryScreen(migrated), true);
assert.deepEqual(migrated.counts(), { resolutionCalls: 1, outcomeCalls: 1 });

// Repeated turns do not re-evaluate or re-record a completed campaign.
migrated.clock.tickIndex += 1;
const repeated = evaluateFocusedScenarioVictory(migrated);
assert.equal(repeated.newlyAchieved, false);
assert.deepEqual(migrated.counts(), { resolutionCalls: 1, outcomeCalls: 1 });

// Continue-as-sandbox acknowledges the one-time celebration but never clears
// the fact that the campaign was won.
acknowledgeVictory(migrated, { keepPlaying: true });
assert.equal(migrated.endgame.victoryAchieved, true);
assert.equal(migrated.endgame.victoryAcknowledged, true);
assert.equal(migrated.endgame.continueAfterVictory, true);
assert.equal(shouldShowVictoryScreen(migrated), false);

// Simulate the ordinary polity save/load path. A fresh runtime binds to the
// restored polity object and therefore resumes directly in sandbox mode.
const savedState = structuredClone(migrated.polities[0]._worldsimEndgame);
const loaded = makeSim({ persistedState: savedState });
const loadedState = bindPersistentEndgameState(loaded);
assert.equal(loadedState.victoryAchieved, true);
assert.equal(loadedState.victoryAcknowledged, true);
assert.equal(loadedState.continueAfterVictory, true);
assert.equal(shouldShowVictoryScreen(loaded), false);
const afterLoad = evaluateFocusedScenarioVictory(loaded);
assert.equal(afterLoad.newlyAchieved, false);
assert.deepEqual(loaded.counts(), { resolutionCalls: 0, outcomeCalls: 0 });

console.log('Post-victory sandbox regression passed.');