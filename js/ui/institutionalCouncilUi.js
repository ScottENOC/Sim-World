import { AdvisorCouncil } from './advisors.js?v=20260916-institution-ui1';
import { polityById } from '../politics/polities.js?v=20260916-institution-ui1';
import { GOVERNMENT_POWERS, describeGovernmentInstitutions } from '../politics/institutionalPowers.js?v=20260916-institution-ui1';
import { chooseNpcInstitutionalApprovals, institutionalActionPrompt } from '../politics/institutionalActions.js?v=20260916-institution-ui1';
import { executeGovernmentCampaign } from '../politics/governmentActionExecution.js?v=20260916-institution-ui1';
import { institutionalStatusForRegion, resolvePlayerInstitutionalDemand } from '../politics/institutionalIntegration.js?v=20260916-institution-ui1';

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

function campaignInstitutionContext(council, player, target) {
  const status = institutionalStatusForRegion(player, council.polities, council.regions);
  const fiscal = player.militaryFinance || {};
  const threat = Math.min(1, (player.militaryThreat?.recentRaids || 0) / 4);
  return {
    ...(status?.context || {}),
    wellbeing: player.popularWellbeing || {},
    threat,
    defensive: false,
    hostility: Math.max(0, -(Number(player.relations?.[target.id]) || 0)),
    fiscalStress: Math.max(0, Math.min(1, 1 - (Number(fiscal.readiness) || 1))),
  };
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

  if (this.activeAdvisor !== 'marshal') return;
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
