import { acknowledgeVictory, ensureEndgameState, recordVictory, shouldShowVictoryScreen } from '../core/endgame.js?v=20260924-post-victory1';

const POLITY_STATE_KEY = '_worldsimEndgame';
const CHECK_INTERVAL_MS = 250;

function playerPolity(sim) {
  const id = sim?.activePlayerPolityId;
  if (!id) return null;
  return (sim.polities || []).find((candidate) => candidate?.id === id)
    || (sim.scenarioPolities || []).find((candidate) => candidate?.id === id)
    || null;
}

export function bindPersistentEndgameState(sim) {
  const polity = playerPolity(sim);
  if (!polity) return null;
  if (!polity[POLITY_STATE_KEY] || typeof polity[POLITY_STATE_KEY] !== 'object') polity[POLITY_STATE_KEY] = {};
  // The polity object is part of the ordinary save snapshot. Keeping this object
  // as the canonical endgame state means save/load needs no parallel storage and
  // old saves simply initialise the new fields on first use.
  if (sim.endgame !== polity[POLITY_STATE_KEY]) sim.endgame = polity[POLITY_STATE_KEY];
  return ensureEndgameState(sim);
}

function scenarioCountryId(sim) {
  const polity = playerPolity(sim);
  return polity?.scenarioActorId || sim?.activePlayerPolityId || null;
}

export function evaluateFocusedScenarioVictory(sim) {
  const state = bindPersistentEndgameState(sim);
  if (!state || state.victoryAchieved) return { newlyAchieved: false, state };
  if (typeof sim?.updateScenarioResolution !== 'function' || typeof sim?.scenarioOutcomeFor !== 'function') {
    return { newlyAchieved: false, state, reason: 'no_focused_victory_runtime' };
  }

  const resolution = sim.updateScenarioResolution(sim.clock?.elapsedDays || 0);
  if (!resolution?.resolved) return { newlyAchieved: false, state, resolution };
  const countryId = scenarioCountryId(sim);
  if (!countryId) return { newlyAchieved: false, state, resolution, reason: 'no_player_country' };
  const result = sim.scenarioOutcomeFor(countryId);
  if (!result?.ready) return { newlyAchieved: false, state, resolution, result };

  const newlyAchieved = recordVictory(sim, {
    tick: sim.clock?.tickIndex ?? -1,
    snapshot: {
      scenarioId: sim.scenarioState?.scenarioId || window.__worldsimScenarioRuntime?.scenarioId || null,
      countryId,
      outcome: result.outcome || null,
      resolution,
    },
  });
  return { newlyAchieved, state: ensureEndgameState(sim), resolution, result };
}

function outcomeTitle(snapshot) {
  const result = snapshot?.outcome?.result;
  if (result === 'strong-success') return 'A strong outcome';
  if (result === 'success') return 'Victory';
  if (result === 'survived') return 'You endured';
  if (result === 'defeat') return 'The campaign is over';
  return 'Campaign complete';
}

function outcomeSummary(snapshot) {
  const outcome = snapshot?.outcome;
  if (!outcome) return 'The victory conditions have been met. This result is now part of this save.';
  const pct = Number.isFinite(outcome.score) ? ` Overall outcome: ${Math.round(outcome.score * 100)}%.` : '';
  const survival = outcome.minimumSuccess === false
    ? ' Your state did not retain the minimum sovereign continuity required for success.'
    : ' Your state retained the minimum sovereign continuity required by the scenario.';
  return `The campaign has reached its resolution point.${pct}${survival}`;
}

function ensureVictoryModal() {
  let modal = document.getElementById('victory-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'victory-modal';
  modal.className = 'modal hidden';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'victory-title');
  modal.innerHTML = `
    <div class="modal-card victory-card">
      <h2 id="victory-title">Campaign complete</h2>
      <p id="victory-body"></p>
      <p><strong>Victory is recorded permanently in this save.</strong> You can keep playing the same world without resetting diplomacy, technology, population, resources or history.</p>
      <div id="victory-options">
        <button id="btn-victory-sandbox" type="button">Continue as sandbox</button>
      </div>
    </div>`;
  document.getElementById('app')?.appendChild(modal);
  return modal;
}

function presentVictory(sim) {
  if (!shouldShowVictoryScreen(sim)) return false;
  const modal = ensureVictoryModal();
  const state = ensureEndgameState(sim);
  document.getElementById('victory-title').textContent = outcomeTitle(state.victorySnapshot);
  document.getElementById('victory-body').textContent = outcomeSummary(state.victorySnapshot);
  const continueButton = document.getElementById('btn-victory-sandbox');
  continueButton.onclick = () => {
    acknowledgeVictory(sim, { keepPlaying: true });
    modal.classList.add('hidden');
    // Victory itself is not a simulation stop. If the modal requested an
    // automatic pause, release exactly that pause and return to the prior speed.
    sim.clock?.releaseAutoPause?.();
  };
  modal.classList.remove('hidden');
  continueButton.focus?.();
  return true;
}

export function tickVictoryContinuation(sim) {
  const state = bindPersistentEndgameState(sim);
  if (!state) return { ready: false };
  const evaluation = evaluateFocusedScenarioVictory(sim);
  if (evaluation.newlyAchieved) sim.clock?.requestAutoPause?.();
  const shown = shouldShowVictoryScreen(sim) ? presentVictory(sim) : false;
  if (!shown) document.getElementById('victory-modal')?.classList.add('hidden');
  return { ready: true, shown, evaluation, state: ensureEndgameState(sim) };
}

function install() {
  let lastTick = null;
  const check = () => {
    const sim = window.__worldsim;
    if (!sim?.clock || !sim.activePlayerPolityId) return;
    // Always bind persistence so a freshly loaded save replaces the in-memory
    // state immediately. Full victory evaluation only needs to run once per turn,
    // except while an unacknowledged victory is waiting to be presented.
    const state = bindPersistentEndgameState(sim);
    if (!state) return;
    const tick = sim.clock.tickIndex;
    if (tick !== lastTick || shouldShowVictoryScreen(sim)) {
      lastTick = tick;
      tickVictoryContinuation(sim);
    }
  };
  check();
  setInterval(check, CHECK_INTERVAL_MS);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') install();