import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { polityById } from '../politics/polities.js?v=20260916-institution-ui1';
import { GOVERNMENT_POWERS, describeGovernmentInstitutions } from '../politics/institutionalPowers.js?v=20260916-institution-ui1';
import { chooseNpcInstitutionalApprovals, institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260916-institution-ui1';
import { executeGovernmentAction, executeGovernmentCampaign, executeGovernmentMilitaryPolicy } from '../politics/governmentActionExecution.js?v=20260916-institution-ui2';
import { institutionalStatusForRegion, resolvePlayerInstitutionalDemand } from '../politics/institutionalIntegration.js?v=20260916-institution-ui1';
import { setRoadTollPolicy, setChokepointTollPolicy } from '../economy/transitTolls.js?v=20260907-transit1';
import { setTradeRestriction, removeTradeRestriction } from '../economy/tradePolicy.js?v=20260905-policy1';
import { setMandatoryEducationYears } from '../society/massEducation.js?v=20260914-mass-education1';
import { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter } from '../diplomacy/couriers.js?v=20260909-counterintel1';

const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const label = (power) => GOVERNMENT_POWERS[power]?.label || String(power || 'government power').replaceAll('_', ' ');
const title = (value) => String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase());

function institutionSummary(polity) {
  const institutions = polity.institutions || {};
  const parliament = institutions.parliament || {};
  const judiciary = institutions.judiciary || {};
  const powers = describeGovernmentInstitutions(polity);
  const shared = Object.entries(polity.governmentPowers || {})
    .filter(([, record]) => (record.consentRequiredFrom || []).length)
    .map(([power, record]) => `${label(power)}: ${record.consentRequiredFrom.map(title).join(' + ')} consent`);
  return `
    <div class="advisor-report-row"><span>Executive control</span><strong>${powers.executivePowers.length} powers</strong></div>
    <div class="advisor-report-row"><span>Political voice</span><strong>${pct(powers.politicalVoice)}</strong></div>
    <div class="advisor-report-row"><span>Parliament</span><strong>${parliament.established ? `${pct(parliament.strength)} strength · ${pct(parliament.representation)} representation` : 'Not established'}</strong></div>
    <div class="advisor-report-row"><span>Judiciary</span><strong>${judiciary.established ? `${pct(judiciary.strength)} strength · ${pct(judiciary.independence)} independent` : 'Not established'}</strong></div>
    ${shared.length ? `<p class="advisor-note"><strong>Shared powers:</strong><br>${shared.join('<br>')}</p>` : '<p class="advisor-note">The executive currently needs no standing institutional consent for its retained powers.</p>'}`;
}

function crisisSummary(status) {
  const { crisis, context } = status;
  const active = crisis.demands.filter((d) => d.status === 'active');
  return `
    <div class="advisor-report-row ${crisis.pressure >= 0.65 ? 'warning' : ''}"><span>Institutional pressure</span><strong>${pct(crisis.pressure)}</strong></div>
    <div class="advisor-report-row ${crisis.protests >= 0.35 ? 'warning' : ''}"><span>Protest mobilisation</span><strong>${pct(crisis.protests)}</strong></div>
    <div class="advisor-report-row ${crisis.coupRisk >= 0.35 ? 'warning' : ''}"><span>Coup pressure</span><strong>${pct(crisis.coupRisk)}</strong></div>
    <div class="advisor-report-row ${crisis.revolutionRisk >= 0.35 ? 'warning' : ''}"><span>Revolutionary pressure</span><strong>${pct(crisis.revolutionRisk)}</strong></div>
    <p class="advisor-note">Public grievance ${pct(context.grievance)} · political voice ${pct(context.politicalVoice)} · economic stress ${pct(context.economicStress)}. These are pressures, not guaranteed outcomes.</p>
    ${active.map((demand) => `
      <div class="advisor-note institutional-demand">
        <strong>${title(demand.institution)} demand</strong><br>
        ${demand.type === 'expand_institutional_control' ? `Require ${title(demand.institution)} consent over ${label(demand.power).toLowerCase()}.` : title(demand.type)}
        <br>Support: ${pct(demand.support)}
        <div class="advisor-actions">
          <button class="advisor-order" data-institution-demand="${demand.id}" data-accept-demand="yes">Accept</button>
          <button class="advisor-order danger" data-institution-demand="${demand.id}" data-accept-demand="no">Reject</button>
        </div>
      </div>`).join('')}`;
}

const originalChancellor = AdvisorCouncil.prototype.renderChancellor;
AdvisorCouncil.prototype.renderChancellor = function renderInstitutionalChancellor(player) {
  const base = originalChancellor.call(this, player);
  const status = institutionalStatusForRegion(player, this.polities, this.regions);
  if (!status) return base;
  return `${base}
    <section class="advisor-section"><h3>Who actually governs</h3>${institutionSummary(status.polity)}</section>
    <section class="advisor-section"><h3>Political pressure</h3>${crisisSummary(status)}</section>`;
};

function playerInstitutionContext(council, player, extra = {}) {
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

function campaignInstitutionContext(council, player, target) {
  const threat = Math.min(1, (player.militaryThreat?.recentRaids || 0) / 4);
  return playerInstitutionContext(council, player, {
    threat,
    defensive: false,
    hostility: Math.max(0, -(Number(player.relations?.[target.id]) || 0)),
  });
}

function governedAction(council, player, action, effect, context = {}) {
  const polity = polityById(council.polities, player.governance?.sovereignPolityId || player.polityId);
  if (!polity) return { handled: true, changed: false, reason: 'no_governing_polity' };
  const prompt = institutionalActionPrompt(polity, action);
  if (prompt.executiveCanActAlone) return { handled: false, changed: false };
  const decision = chooseNpcInstitutionalApprovals(polity, action, context);
  const result = executeGovernmentAction(player, action, effect, council.polities, {
    approvals: decision.approvals,
    registerRefusal: true,
    currentTick: council.clock.tickIndex,
    context,
  });
  return { handled: true, ...result, prompt, decision };
}

function refusalText(result) {
  const required = result.prompt?.requiredInstitutions?.map(title).join(' and ') || 'The required institution';
  return `${required} refused authorisation. The order was not carried out.`;
}

function setCouncilStatus(council, text) {
  let status = document.getElementById('institutional-action-status');
  if (!status) {
    status = document.createElement('div');
    status.id = 'institutional-action-status';
    status.className = 'advisor-note warning';
    council.content.prepend(status);
  }
  status.textContent = text;
}

function interceptRange(council, player, id, action, effect, labelId, suffix = '%') {
  const input = document.getElementById(id);
  if (!input) return;
  const polity = polityById(council.polities, player.governance?.sovereignPolityId || player.polityId);
  if (!polity || institutionalActionPrompt(polity, action).executiveCanActAlone) return;
  input.addEventListener('input', (event) => {
    event.stopImmediatePropagation();
    const out = labelId ? document.getElementById(labelId) : null;
    if (out) out.textContent = `${input.value}${suffix}`;
  }, { capture: true });
  input.addEventListener('change', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, action, () => effect(input.value), playerInstitutionContext(council, player));
    if (!result.changed) setCouncilStatus(council, refusalText(result));
    council.render(false);
  }, { capture: true });
}

function interceptSelect(council, player, id, action, effect) {
  const select = document.getElementById(id);
  if (!select) return;
  const polity = polityById(council.polities, player.governance?.sovereignPolityId || player.polityId);
  if (!polity || institutionalActionPrompt(polity, action).executiveCanActAlone) return;
  select.addEventListener('change', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, action, () => effect(select.value), playerInstitutionContext(council, player));
    if (!result.changed) setCouncilStatus(council, refusalText(result));
    council.render(false);
  }, { capture: true });
}

function interceptButton(council, player, button, action, effect, context = {}) {
  if (!button) return;
  const polity = polityById(council.polities, player.governance?.sovereignPolityId || player.polityId);
  if (!polity || institutionalActionPrompt(polity, action).executiveCanActAlone) return;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const result = governedAction(council, player, action, effect, playerInstitutionContext(council, player, context));
    if (!result.changed) setCouncilStatus(council, refusalText(result));
    else council.render(false);
  }, { capture: true });
}

const originalWireCurrent = AdvisorCouncil.prototype.wireCurrent;
AdvisorCouncil.prototype.wireCurrent = function wireInstitutionalCouncil(player) {
  originalWireCurrent.call(this, player);

  if (this.activeAdvisor === 'chancellor') {
    document.querySelectorAll('#advisor-content [data-institution-demand]').forEach((button) => {
      button.addEventListener('click', () => {
        const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
        if (!polity) return;
        resolvePlayerInstitutionalDemand(polity, button.dataset.institutionDemand, button.dataset.acceptDemand === 'yes', this.clock.tickIndex);
        this.render(false);
      });
    });
  }

  if (this.activeAdvisor === 'treasurer') {
    interceptRange(this, player, 'road-toll-rate', 'change_taxation', (value) => {
      const allies = document.getElementById('road-allies-free');
      return setRoadTollPolicy(player, { rate: Number(value) / 100, alliesFree: allies?.value !== 'no' });
    }, 'road-toll-label');
    interceptSelect(this, player, 'road-allies-free', 'change_taxation', (value) => {
      const rate = Number(document.getElementById('road-toll-rate')?.value || 0) / 100;
      return setRoadTollPolicy(player, { rate, alliesFree: value !== 'no' });
    });
    document.querySelectorAll('[data-cp-toll]').forEach((input) => {
      const id = input.dataset.cpToll;
      const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
      if (!polity || institutionalActionPrompt(polity, 'change_taxation').executiveCanActAlone) return;
      input.addEventListener('input', (event) => {
        event.stopImmediatePropagation();
        const out = document.getElementById(`cp-toll-label-${id}`);
        if (out) out.textContent = `${input.value}%`;
      }, { capture: true });
      input.addEventListener('change', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        const allies = document.querySelector(`[data-cp-allies="${id}"]`);
        const access = document.querySelector(`[data-cp-access="${id}"]`);
        const result = governedAction(this, player, 'change_taxation', () => setChokepointTollPolicy(player, id, {
          rate: Number(input.value) / 100, alliesFree: allies?.value !== 'no', access: access?.value || 'open',
        }), playerInstitutionContext(this, player));
        if (!result.changed) setCouncilStatus(this, refusalText(result));
        this.render(false);
      }, { capture: true });
    });
    document.querySelectorAll('[data-cp-access]').forEach((select) => {
      const id = select.dataset.cpAccess;
      const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
      if (!polity || institutionalActionPrompt(polity, 'change_economic_policy').executiveCanActAlone) return;
      select.addEventListener('change', (event) => {
        event.preventDefault(); event.stopImmediatePropagation();
        const input = document.querySelector(`[data-cp-toll="${id}"]`);
        const allies = document.querySelector(`[data-cp-allies="${id}"]`);
        const result = governedAction(this, player, 'change_economic_policy', () => setChokepointTollPolicy(player, id, {
          rate: Number(input?.value || 0) / 100, alliesFree: allies?.value !== 'no', access: select.value,
        }), playerInstitutionContext(this, player));
        if (!result.changed) setCouncilStatus(this, refusalText(result));
        this.render(false);
      }, { capture: true });
    });
    interceptButton(this, player, document.getElementById('add-trade-embargo'), 'change_economic_policy', () => {
      const direction = document.getElementById('trade-rule-direction')?.value || 'trade';
      const good = document.getElementById('trade-rule-good')?.value || '*';
      const country = document.getElementById('trade-rule-country')?.value || '*';
      return setTradeRestriction(player, {
        direction, goods: good === '*' ? null : [good],
        counterparties: country === '*' ? null : [country], allowed: false,
      }, this.regions, this.clock.tickIndex);
    });
    document.querySelectorAll('[data-remove-trade-rule]').forEach((button) => interceptButton(this, player, button, 'change_economic_policy', () =>
      removeTradeRestriction(player, button.dataset.removeTradeRule, this.regions, this.clock.tickIndex)));
  }

  if (this.activeAdvisor === 'steward') {
    interceptRange(this, player, 'mandatory-education-years', 'change_spending', (value) =>
      setMandatoryEducationYears(player, value, this.clock.elapsedDays || 0), 'education-years-label', ' years');
  }

  if (this.activeAdvisor === 'spymaster') {
    interceptButton(this, player, document.getElementById('send-deception-letter'), 'order_intelligence_operation', () => {
      const recipient = this.regions.find((r) => r.id === document.getElementById('deception-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('deception-enemy')?.value);
      if (!recipient || !enemy || recipient.id === enemy.id) return false;
      const months = Math.max(1, Number(document.getElementById('deception-months')?.value) || 3);
      return sendDeceptionJointOperationLetter(player, recipient, enemy, this.regions, this.clock.tickIndex, {
        attackTick: this.clock.tickIndex + Math.round(months * 4.345), secrecy: .12,
      }).sent;
    });
    interceptButton(this, player, document.getElementById('send-forged-letter'), 'order_intelligence_operation', () => {
      const purported = this.regions.find((r) => r.id === document.getElementById('forgery-sender')?.value);
      const recipient = this.regions.find((r) => r.id === document.getElementById('forgery-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('forgery-enemy')?.value);
      if (!purported || !recipient || !enemy || purported.id === recipient.id) return false;
      return sendForgedJointOperationLetter(player, purported, recipient, enemy, this.regions, this.clock.tickIndex, {
        attackTick: this.clock.tickIndex + 13,
      }).sent;
    });
  }

  if (this.activeAdvisor !== 'marshal') return;

  const policyContext = () => playerInstitutionContext(this, player);
  for (const [id, key] of [['defensive-posture', 'defensivePosture'], ['raider-treatment', 'raiderTreatment'], ['naval-priority', 'navalPriority']]) {
    const select = document.getElementById(id);
    if (!select) continue;
    const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
    if (!polity || institutionalActionPrompt(polity, 'change_military_policy').executiveCanActAlone) continue;
    select.addEventListener('change', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const decision = chooseNpcInstitutionalApprovals(polity, 'change_military_policy', policyContext());
      const result = executeGovernmentMilitaryPolicy(player, key, select.value, this.polities, {
        approvals: decision.approvals, registerRefusal: true, currentTick: this.clock.tickIndex, context: policyContext(),
      });
      if (!result.changed) setCouncilStatus(this, `${decision.decisions?.filter((d) => !d.approved).map((d) => title(d.institution)).join(' and ') || 'The required institution'} refused the policy change.`);
      this.render(false);
    }, { capture: true });
  }
  for (const [id, key, labelId] of [['army-permanence', 'armyPermanence', 'army-permanence-label'], ['war-horse-allocation', 'warHorseAllocation', 'war-horse-label']]) {
    const input = document.getElementById(id);
    if (!input) continue;
    const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
    if (!polity || institutionalActionPrompt(polity, 'change_military_policy').executiveCanActAlone) continue;
    input.addEventListener('input', (event) => {
      event.stopImmediatePropagation();
      const out = document.getElementById(labelId); if (out) out.textContent = `${input.value}%`;
    }, { capture: true });
    input.addEventListener('change', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const context = policyContext();
      const decision = chooseNpcInstitutionalApprovals(polity, 'change_military_policy', context);
      const result = executeGovernmentMilitaryPolicy(player, key, Number(input.value) / 100, this.polities, {
        approvals: decision.approvals, registerRefusal: true, currentTick: this.clock.tickIndex, context,
      });
      if (!result.changed) setCouncilStatus(this, `${decision.decisions?.filter((d) => !d.approved).map((d) => title(d.institution)).join(' and ') || 'The required institution'} refused the policy change.`);
      this.render(false);
    }, { capture: true });
  }

  const launch = document.getElementById('launch-campaign');
  if (!launch) return;
  launch.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const targetId = document.getElementById('campaign-target')?.value;
    const objective = document.getElementById('campaign-objective')?.value;
    const share = Number(document.getElementById('campaign-share')?.value || 0) / 100;
    const chosen = this.campaignTargets(player).find((entry) => entry.region.id === targetId);
    if (!chosen) return;
    const polity = polityById(this.polities, player.governance?.sovereignPolityId || player.polityId);
    if (!polity) return;
    const context = campaignInstitutionContext(this, player, chosen.region);
    const prompt = institutionalActionPrompt(polity, 'launch_offensive_war');
    let approvals = [];
    if (!prompt.executiveCanActAlone) {
      const decision = chooseNpcInstitutionalApprovals(polity, 'launch_offensive_war', context);
      approvals = decision.approvals;
      if (!decision.approved) {
        const required = prompt.requiredInstitutions.map(title).join(' and ');
        const status = document.getElementById('campaign-assessment');
        if (status) status.textContent = `${required} refused authorisation for this offensive. The campaign has not begun; repeated institutional conflict can increase political pressure.`;
        const crisis = polity.institutionalCrisis;
        if (crisis) crisis.pressure = Math.min(1, (crisis.pressure || 0) + 0.035);
        return;
      }
    }
    const requested = Math.floor(player.army.personnel * share);
    const result = executeGovernmentCampaign(player, chosen.region, objective, requested, this.clock.tickIndex, {
      campaigns: this.getCampaigns(), regions: this.regions, polities: this.polities, approvals,
      registerRefusal: true, context,
    });
    if (result.campaign) {
      this.addCampaign(result.campaign);
      this.expandedCampaignId = result.campaign.id;
      this.render(false);
    } else {
      const status = document.getElementById('campaign-assessment');
      if (status) status.textContent = 'The government lacks authority to begin this campaign.';
    }
  }, { capture: true });
};
