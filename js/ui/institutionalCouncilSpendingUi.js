import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { polityById } from '../politics/polities.js?v=20260916-institution-ui1';
import { chooseNpcInstitutionalApprovals, institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260916-institution-ui2';
import { executeGovernmentAction } from '../politics/governmentActionExecution.js?v=20260916-institution-ui2';
import { institutionalStatusForRegion } from '../politics/institutionalIntegration.js?v=20260916-institution-ui1';
import { cancelConstruction, setConstructionWorkers, startConstruction, startRepair } from '../economy/construction.js?v=20260905-projects1';
import { setSiegeTarget } from '../military/siegeEquipment.js?v=20260905-projects1';
import { setCounterIntelligencePolicy } from '../diplomacy/counterIntelligence.js?v=20260909-counterintel1';

const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

function institutionContext(council, player, extra = {}) {
  const status = institutionalStatusForRegion(player, council.polities, council.regions);
  const fiscal = player.militaryFinance || {};
  return {
    ...(status?.context || {}),
    wellbeing: player.popularWellbeing || {},
    publicSupport: Math.max(0, Math.min(1, 1 - Number(status?.context?.grievance || 0))),
    fiscalStress: Math.max(0, Math.min(1, 1 - (Number(fiscal.readiness) || 1))),
    ...extra,
  };
}

function governingPolity(council, player) {
  return polityById(council.polities, player.governance?.sovereignPolityId || player.polityId);
}

function needsInstitutionalApproval(council, player, action) {
  const polity = governingPolity(council, player);
  return Boolean(polity && !institutionalActionPrompt(polity, action).executiveCanActAlone);
}

function governedAction(council, player, action, effect, extraContext = {}) {
  const polity = governingPolity(council, player);
  if (!polity) return { changed: false, reason: 'no_governing_polity' };
  const context = institutionContext(council, player, extraContext);
  const decision = chooseNpcInstitutionalApprovals(polity, action, context);
  const result = executeGovernmentAction(player, action, effect, council.polities, {
    approvals: decision.approvals,
    registerRefusal: true,
    currentTick: council.clock.tickIndex,
    context,
  });
  return { ...result, prompt: institutionalActionPrompt(polity, action), decision };
}

function setStatus(council, result, successText = '') {
  let status = document.getElementById('institutional-action-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'institutional-action-status';
    status.className = 'advisor-note warning';
    council.content.prepend(status);
  }
  if (result.changed) {
    status.classList.remove('warning');
    status.textContent = successText;
    return;
  }
  status.classList.add('warning');
  const required = result.prompt?.requiredInstitutions?.map(title).join(' and ') || 'The required institution';
  status.textContent = `${required} refused authorisation. The order was not carried out.`;
}

function interceptNumber(council, player, id, action, effect) {
  const input = document.getElementById(id);
  if (!input || !needsInstitutionalApproval(council, player, action)) return;
  input.addEventListener('change', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, action, () => effect(input.value));
    setStatus(council, result);
    council.render(false);
  }, { capture: true });
}

function interceptButton(council, player, button, action, effect) {
  if (!button || !needsInstitutionalApproval(council, player, action)) return;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, action, effect);
    setStatus(council, result);
    if (result.changed) council.render(false);
  }, { capture: true });
}

function interceptConstructionWorkforce(council, player) {
  const input = document.getElementById('construction-workers');
  if (!input || !needsInstitutionalApproval(council, player, 'change_spending')) return;
  input.addEventListener('input', (event) => {
    event.stopImmediatePropagation();
    const label = document.getElementById('builder-count-label');
    if (label) label.textContent = Math.round(Number(input.value) || 0).toLocaleString();
  }, { capture: true });
  input.addEventListener('change', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, 'change_spending', () =>
      setConstructionWorkers(player, input.dataset.projectId, input.value));
    setStatus(council, result);
    council.render(false);
  }, { capture: true });
}

function interceptCounterIntelligence(council, player) {
  if (!needsInstitutionalApproval(council, player, 'change_intelligence_policy')) return;
  const ids = ['ci-credentials', 'ci-codes', 'ci-caution'];
  const labels = {
    'ci-credentials': 'ci-credentials-label',
    'ci-codes': 'ci-codes-label',
    'ci-caution': 'ci-caution-label',
  };
  const inputs = ids.map((id) => document.getElementById(id));
  if (inputs.some((input) => !input)) return;
  for (const input of inputs) {
    input.addEventListener('input', (event) => {
      event.stopImmediatePropagation();
      const label = document.getElementById(labels[input.id]);
      if (label) label.textContent = `${input.value}%`;
    }, { capture: true });
    input.addEventListener('change', (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const credentials = document.getElementById('ci-credentials');
      const codes = document.getElementById('ci-codes');
      const caution = document.getElementById('ci-caution');
      const result = governedAction(council, player, 'change_intelligence_policy', () =>
        setCounterIntelligencePolicy(player, {
          credentialSecurity: Number(credentials.value) / 100,
          codePractice: Number(codes.value) / 100,
          verificationCaution: Number(caution.value) / 100,
        }));
      setStatus(council, result);
      council.render(false);
    }, { capture: true });
  }
}

const previousWireCurrent = AdvisorCouncil.prototype.wireCurrent;
AdvisorCouncil.prototype.wireCurrent = function wireInstitutionalSpendingControls(player) {
  previousWireCurrent.call(this, player);

  if (this.activeAdvisor === 'steward') {
    interceptConstructionWorkforce(this, player);
    interceptButton(this, player, document.querySelector('[data-cancel-project]'), 'change_spending', () => {
      const button = document.querySelector('[data-cancel-project]');
      if (!button || !window.confirm('Cancel this project? Materials and wages already spent will not be recovered.')) return false;
      return cancelConstruction(player, button.dataset.cancelProject);
    });
    document.querySelectorAll('[data-repair-asset]').forEach((button) =>
      interceptButton(this, player, button, 'change_spending', () => startRepair(player, button.dataset.repairAsset, 50, this.clock.tickIndex)));
    interceptButton(this, player, document.getElementById('start-construction'), 'change_spending', () => {
      const type = document.getElementById('construction-type')?.value;
      const workers = document.getElementById('new-construction-workers')?.value;
      return type ? startConstruction(player, type, workers, this.clock.tickIndex) : false;
    });
  }

  if (this.activeAdvisor === 'spymaster') interceptCounterIntelligence(this, player);

  if (this.activeAdvisor !== 'marshal') return;
  interceptNumber(this, player, 'council-army-target', 'change_spending', (value) => {
    player.targetArmySize = Math.max(0, Number(value) || 0);
    return true;
  });
  interceptNumber(this, player, 'council-navy-target', 'change_spending', (value) => {
    player.targetNavySize = Math.max(0, Number(value) || 0);
    return true;
  });
  interceptNumber(this, player, 'target-rams', 'change_spending', (value) => setSiegeTarget(player, 'ram', value));
  interceptNumber(this, player, 'target-catapults', 'change_spending', (value) => setSiegeTarget(player, 'catapult', value));
};
