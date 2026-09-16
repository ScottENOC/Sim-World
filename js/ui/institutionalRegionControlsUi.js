import { institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260916-region-controls1';
import { authoriseRuntimeGovernmentAction, governingPolityForRegion } from '../politics/institutionalRuntimeAuthority.js?v=20260916-region-controls1';
import { setMilitaryStrategy, reviewMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';
import { setGovernancePolicy } from '../politics/polities.js?v=20260912-currency2';

const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, Number(value) || 0));

function world() {
  return globalThis?.window?.__worldsim || null;
}

function selectedRegion(state = world()) {
  if (!state) return null;
  const id = state.map?.selectedId || state.getPlayerRegionId?.();
  return state.regions?.find((region) => region.id === id) || null;
}

function playerCapital(state = world()) {
  const id = state?.getPlayerRegionId?.();
  return state?.regions?.find((region) => region.id === id) || null;
}

function institutionalContext(state, extra = {}) {
  const capital = playerCapital(state) || selectedRegion(state);
  const fiscal = capital?.militaryFinance || {};
  const grievance = clamp(capital?.popularWellbeing?.grievance ?? capital?.institutionalContext?.grievance ?? 0);
  return {
    wellbeing: capital?.popularWellbeing || {},
    publicSupport: clamp(1 - grievance),
    fiscalStress: clamp(1 - (Number(fiscal.readiness) || 1)),
    ...extra,
  };
}

function status(text, warning = true) {
  const root = document.getElementById('region-controls');
  if (!root) return;
  let node = document.getElementById('institutional-region-control-status');
  if (!node) {
    node = document.createElement('div');
    node.id = 'institutional-region-control-status';
    node.className = 'raid-status';
    root.prepend(node);
  }
  node.classList.toggle('warning', warning);
  node.textContent = text;
}

function authorityState(action) {
  const state = world();
  const region = selectedRegion(state);
  const polity = region ? governingPolityForRegion(region, state?.polities || []) : null;
  if (!state || !region || !polity) return { state, region, polity, constrained: false, prompt: null };
  const prompt = institutionalActionPrompt(polity, action);
  return { state, region, polity, constrained: Boolean(prompt?.valid && !prompt.executiveCanActAlone), prompt };
}

function authorise(action, extraContext = {}) {
  const current = authorityState(action);
  if (!current.state || !current.region || !current.polity) return { ...current, allowed: true };
  const result = authoriseRuntimeGovernmentAction(current.region, action, {
    polities: current.state.polities,
    currentTick: current.state.clock?.tickIndex,
    context: institutionalContext(current.state, extraContext),
    registerRefusal: true,
  });
  return { ...current, ...result };
}

function refusalMessage(result) {
  const prompt = result.prompt || (result.polity ? institutionalActionPrompt(result.polity, result.action) : null);
  const required = prompt?.requiredInstitutions?.map(title).join(' and ') || title(result.required) || 'The required institution';
  return `${required} refused authorisation. The proposed change was not carried out.`;
}

function stop(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
}

function militaryStrategy(region) {
  return region?.militaryStrategy || {};
}

function restoreMilitaryControl(control, region) {
  const strategy = militaryStrategy(region);
  if (!control || !region) return;
  const values = {
    'military-posture': strategy.posture || 'peace',
    'military-plan-target': strategy.targetRegionId || '',
    'military-garrison-floor': Math.round((Number(strategy.garrisonFloor) || 1) * 100),
    'military-spending-priority': Math.round((Number(strategy.spendingPriority) || 0.45) * 100),
    'military-prep-weeks': Number(strategy.desiredPreparationWeeks) || 26,
    'military-vassal-assumption': strategy.vassalAssumption || 'conservative',
    'military-ally-assumption': strategy.allyAssumption || 'conservative',
    'input-navy': Math.max(0, Math.round(Number(region.targetNavySize) || 0)),
  };
  if (control.id in values) control.value = values[control.id];
  if (control.id === 'military-garrison-floor') {
    const label = document.getElementById('garrison-floor-label');
    if (label) label.textContent = `${values[control.id]}%`;
  }
  if (control.id === 'military-spending-priority') {
    const label = document.getElementById('military-spending-label');
    if (label) label.textContent = `${values[control.id]}%`;
  }
}

function applyMilitaryPlanFromControls(state, region) {
  const strategy = setMilitaryStrategy(region, {
    posture: document.getElementById('military-posture')?.value || 'peace',
    targetRegionId: document.getElementById('military-plan-target')?.value || null,
    garrisonFloor: (Number(document.getElementById('military-garrison-floor')?.value) || 100) / 100,
    spendingPriority: (Number(document.getElementById('military-spending-priority')?.value) || 45) / 100,
    desiredPreparationWeeks: Number(document.getElementById('military-prep-weeks')?.value) || 26,
    vassalAssumption: document.getElementById('military-vassal-assumption')?.value || 'conservative',
    allyAssumption: document.getElementById('military-ally-assumption')?.value || 'conservative',
  });
  const report = reviewMilitaryStrategy(region, {
    regions: state.regions || [],
    polities: state.polities || [],
    agreements: state.agreements || [],
    activeCampaigns: state.activeCampaigns || [],
    currentTick: state.clock?.tickIndex || 0,
  });
  const garrisonLabel = document.getElementById('garrison-floor-label');
  const spendingLabel = document.getElementById('military-spending-label');
  if (garrisonLabel) garrisonLabel.textContent = `${Math.round(strategy.garrisonFloor * 100)}%`;
  if (spendingLabel) spendingLabel.textContent = `${Math.round(strategy.spendingPriority * 100)}%`;
  const reportNode = document.getElementById('military-plan-report');
  if (reportNode && report) {
    reportNode.innerHTML = `Authorised establishment: ${report.establishment.toLocaleString()} · current ${report.currentPersonnel.toLocaleString()}<br>` +
      `Normal garrisons ${report.normalGarrison.toLocaleString()} → retain ${report.retainedGarrison.toLocaleString()} · desired field army ${report.desiredFieldArmy.toLocaleString()}` +
      (report.targetName ? `<br>Plan against ${report.targetName}: estimated opposing force ${report.estimatedEnemy.toLocaleString()} (uncertainty ±${Math.round(report.enemyUncertainty * 100)}%)${report.viaSea ? ' · overseas operation' : ''}` : '');
  }
}

const strategicSelectActions = new Map([
  ['military-posture', 'change_military_policy'],
  ['military-plan-target', 'change_military_policy'],
  ['military-prep-weeks', 'change_military_policy'],
  ['military-vassal-assumption', 'change_military_policy'],
  ['military-ally-assumption', 'change_military_policy'],
  ['input-navy', 'change_spending'],
]);

const subjectRangePolicies = new Map([
  ['subject-tribute', { action: 'change_taxation', policy: 'tributeRate', label: 'subject-tribute-label' }],
  ['subject-levy', { action: 'change_governance_policy', policy: 'militaryObligation', label: 'subject-levy-label' }],
  ['subject-autonomy', { action: 'change_governance_policy', policy: 'autonomy', label: 'subject-autonomy-label' }],
]);

function restoreSubjectRange(control, region, config) {
  const value = clamp(region?.governance?.[config.policy] || 0);
  control.value = Math.round(value * 100);
  const label = document.getElementById(config.label);
  if (label) label.textContent = `${Math.round(value * 100)}%`;
}

// Range inputs in main.js mutate on every input event. When institutions share
// the relevant power, turn dragging into a preview and decide once on change.
document.addEventListener('input', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLInputElement)) return;

  if (control.id === 'military-garrison-floor' || control.id === 'military-spending-priority') {
    const action = control.id === 'military-spending-priority' ? 'change_spending' : 'change_military_policy';
    if (!authorityState(action).constrained) return;
    stop(event);
    const label = document.getElementById(control.id === 'military-spending-priority' ? 'military-spending-label' : 'garrison-floor-label');
    if (label) label.textContent = `${control.value}%`;
    return;
  }

  const subject = subjectRangePolicies.get(control.id);
  if (!subject || !authorityState(subject.action).constrained) return;
  stop(event);
  const label = document.getElementById(subject.label);
  if (label) label.textContent = `${control.value}%`;
}, true);

document.addEventListener('change', (event) => {
  const control = event.target;
  if (!(control instanceof HTMLElement)) return;

  if (control.id === 'military-garrison-floor' || control.id === 'military-spending-priority') {
    const action = control.id === 'military-spending-priority' ? 'change_spending' : 'change_military_policy';
    const current = authorityState(action);
    if (!current.constrained) return;
    stop(event);
    const result = authorise(action);
    if (!result.allowed) {
      restoreMilitaryControl(control, result.region);
      status(refusalMessage(result));
      return;
    }
    applyMilitaryPlanFromControls(result.state, result.region);
    status('The required institution authorised the strategic change.', false);
    return;
  }

  const subjectRange = subjectRangePolicies.get(control.id);
  if (subjectRange) {
    const current = authorityState(subjectRange.action);
    if (!current.constrained) return;
    stop(event);
    const result = authorise(subjectRange.action);
    if (!result.allowed) {
      restoreSubjectRange(control, result.region, subjectRange);
      status(refusalMessage(result));
      return;
    }
    setGovernancePolicy(result.region, subjectRange.policy, Number(control.value) / 100);
    const label = document.getElementById(subjectRange.label);
    if (label) label.textContent = `${Math.round(Number(control.value) || 0)}%`;
    status('The required institution authorised the governance change.', false);
    return;
  }

  const strategicAction = strategicSelectActions.get(control.id);
  if (strategicAction) {
    const current = authorityState(strategicAction);
    if (!current.constrained) return;
    const result = authorise(strategicAction);
    if (result.allowed) {
      status('The required institution authorised the strategic change.', false);
      return; // allow main.js legacy handler to perform the mutation exactly once
    }
    stop(event);
    restoreMilitaryControl(control, result.region);
    status(refusalMessage(result));
    return;
  }

  let action = null;
  if (control.id === 'subject-form') action = 'change_governance_policy';
  else if (control.id === 'subject-language-policy') action = 'change_language_policy';
  else if (control.matches?.('[data-delegated-power]')) action = 'change_governance_policy';
  if (!action) return;

  const current = authorityState(action);
  if (!current.constrained) return;
  const result = authorise(action);
  if (result.allowed) {
    status('The required institution authorised the governance change.', false);
    return; // preserve the existing mutation and rerender path
  }

  stop(event);
  if (control.id === 'subject-form') control.value = result.region?.governance?.relationship || control.value;
  else if (control.matches?.('[data-delegated-power]')) {
    control.checked = Boolean(result.region?.governance?.delegatedPowers?.[control.dataset.delegatedPower]);
  }
  // Language policy is rerendered elsewhere; retain the old model state and
  // simply prevent this select change from reaching its mutation handler.
  status(refusalMessage(result));
}, true);
