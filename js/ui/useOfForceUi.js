import { attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260916-force1';
import { governingPolityForRegion } from '../politics/institutionalRuntimeAuthority.js?v=20260916-region-controls1';
import { authoriseUseOfForce, classifyRaidUseOfForce, governmentActionForUseOfForce, USE_OF_FORCE } from '../politics/useOfForce.js?v=20260916-force1';

function world() {
  return globalThis?.window?.__worldsim || null;
}

function playerRegion(state) {
  const id = state?.getPlayerRegionId?.();
  return state?.regions?.find((region) => region.id === id) || null;
}

function currentTarget(state) {
  const id = document.getElementById('raid-target')?.value;
  return id ? state?.regions?.find((region) => region.id === id) || null : null;
}

function currentTick(state) {
  return Number(state?.clock?.tickIndex) || 0;
}

function describe(kind) {
  if (kind === USE_OF_FORCE.REPRISAL) return 'Reprisal';
  return 'Raid';
}

function appendClassification() {
  const state = world();
  const attacker = playerRegion(state);
  const defender = currentTarget(state);
  const info = document.getElementById('raid-info');
  if (!attacker || !defender || !info) return;
  const kind = classifyRaidUseOfForce(attacker, defender, currentTick(state));
  const polity = governingPolityForRegion(attacker, state.polities || []);
  const prompt = polity ? institutionalActionPrompt(polity, governmentActionForUseOfForce(kind)) : null;
  const authority = prompt?.executiveCanActAlone === false
    ? ` · ${prompt.requiredInstitutions.map((name) => name[0].toUpperCase() + name.slice(1)).join(' and ')} approval required`
    : '';
  const suffix = ` · ${describe(kind)}${authority}`;
  if (!info.textContent.includes(suffix)) info.textContent += suffix;
}

document.addEventListener('change', (event) => {
  if (event.target?.id === 'raid-target') queueMicrotask(appendClassification);
}, false);

document.addEventListener('click', (event) => {
  const button = event.target?.closest?.('#btn-raid-launch');
  if (!button) return;
  const state = world();
  const attacker = playerRegion(state);
  const defender = currentTarget(state);
  if (!state || !attacker || !defender) return;

  const tick = currentTick(state);
  const kind = classifyRaidUseOfForce(attacker, defender, tick);
  const polity = governingPolityForRegion(attacker, state.polities || []);
  const action = governmentActionForUseOfForce(kind);
  const prompt = polity ? institutionalActionPrompt(polity, action) : null;
  if (!prompt?.valid || prompt.executiveCanActAlone) return;

  const hostility = Math.max(0, Math.min(1, -attitudeToward(attacker, defender.id)));
  const threat = kind === USE_OF_FORCE.REPRISAL ? 0.85 : Math.max(0, 1 - (attacker.safetyRating ?? 1));
  const result = authoriseUseOfForce(attacker, defender, kind, {
    polities: state.polities || [],
    currentTick: tick,
    hostility,
    threat,
    publicSupport: kind === USE_OF_FORCE.REPRISAL ? 0.72 : 0.5,
    registerRefusal: true,
  });
  attacker.lastUseOfForceAuthorisation = { kind, targetRegionId: defender.id, currentTick: tick, ...result };
  if (!result.allowed) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const info = document.getElementById('raid-info');
    const required = prompt.requiredInstitutions.map((name) => name[0].toUpperCase() + name.slice(1)).join(' and ') || 'The required institution';
    if (info) info.textContent = `${required} refused authority for this ${describe(kind).toLowerCase()}. No troops were mustered.`;
    return;
  }

  attacker._pendingUseOfForceAuthorisation = {
    kind,
    targetRegionId: defender.id,
    currentTick: tick,
    result,
  };
}, true);
