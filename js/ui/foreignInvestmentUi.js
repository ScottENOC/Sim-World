import { CORPORATE_INFRASTRUCTURE_TYPES, ensureCorporateInfrastructure, resolveCorporateInfrastructureOffer } from '../economy/corporateInfrastructure.js';
import { FOREIGN_INVESTMENT_POLICIES, ensureInvestmentPolicy, setForeignInvestmentPolicy } from '../economy/infrastructureInvestment.js';

const POLICY_LABELS = Object.freeze({
  [FOREIGN_INVESTMENT_POLICIES.OPEN]: 'Open',
  [FOREIGN_INVESTMENT_POLICIES.SCREENED]: 'Screened',
  [FOREIGN_INVESTMENT_POLICIES.PARTNERS]: 'Allies & partners only',
  [FOREIGN_INVESTMENT_POLICIES.DOMESTIC_PREFERENCE]: 'Domestic preference',
  [FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY]: 'Domestic only',
});

const POLICY_HELP = Object.freeze({
  [FOREIGN_INVESTMENT_POLICIES.OPEN]: 'Foreign firms may invest unless relations are exceptionally hostile.',
  [FOREIGN_INVESTMENT_POLICIES.SCREENED]: 'Foreign proposals are screened out when relations are poor.',
  [FOREIGN_INVESTMENT_POLICIES.PARTNERS]: 'Only recognised partners may invest.',
  [FOREIGN_INVESTMENT_POLICIES.DOMESTIC_PREFERENCE]: 'Foreign investment remains possible, but domestic firms should be preferred as the economy develops.',
  [FOREIGN_INVESTMENT_POLICIES.DOMESTIC_ONLY]: 'Foreign firms are excluded. Development depends on domestic capital and expertise.',
});

const pct = (value) => `${Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100)}%`;
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
const typeName = (type) => CORPORATE_INFRASTRUCTURE_TYPES[type]?.name || String(type || 'Infrastructure').replaceAll('_', ' ');

function polityId(region) {
  return region?.governance?.sovereignPolityId || region?.polityId || null;
}

function playerState(sim) {
  const id = sim?.activePlayerPolityId;
  const polity = sim?.polities?.find((entry) => entry.id === id) || null;
  const territories = sim?.regions?.filter((region) => polityId(region) === id) || [];
  return { id, polity, territories };
}

function regionById(sim, id) {
  return sim?.regions?.find((region) => region.id === id) || null;
}

function polityName(sim, id) {
  const polity = sim?.polities?.find((entry) => entry.id === id);
  if (polity?.name) return polity.name;
  const seat = sim?.regions?.find((region) => polityId(region) === id);
  return seat?.name || id || 'Unknown polity';
}

function firmLabel(sim, offer) {
  const source = regionById(sim, offer.investorRegionId);
  const firm = source?.corporateCapital?.firms?.find((entry) => entry.id === offer.firmId);
  const sector = String(firm?.sector || 'infrastructure').replaceAll('_', ' ');
  return `${source?.name || polityName(sim, offer.investorPolityId)} ${sector} company`;
}

function policyOptions(selected) {
  return Object.values(FOREIGN_INVESTMENT_POLICIES)
    .map((value) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${POLICY_LABELS[value]}</option>`)
    .join('');
}

function offerCard(sim, offer) {
  const host = regionById(sim, offer.hostRegionId);
  const materials = Object.entries(offer.materials || {})
    .map(([resource, amount]) => `${fmt(amount)} ${resource.replaceAll('_', ' ')}`)
    .join(' · ');
  const learning = String(offer.breakthrough || '').replaceAll('_', ' ');
  const risk = Number.isFinite(offer.risk) ? pct(offer.risk) : 'unknown';
  return `<article class="advisor-note investment-offer-card" data-investment-offer-card="${offer.id}">
    <strong>${firmLabel(sim, offer)} proposes a ${typeName(offer.type).toLowerCase()} in ${host?.name || 'the realm'}.</strong><br>
    ${offer.concessionYears}-year foreign concession · investor finances ${fmt(offer.investorCapitalContribution)} capital · host capital ${fmt(offer.hostCapitalContribution)}<br>
    Construction: about ${fmt(offer.constructionYears, 1)} years · materials ${materials || 'not specified'}<br>
    Expected operating revenue: ${fmt(offer.annualRevenue, 1)}/year · investor risk assessment ${risk}<br>
    <small>Ownership and operation remain with ${polityName(sim, offer.investorPolityId)} during the concession. Local work creates exposure to ${learning || 'foreign engineering methods'}, but does not instantly grant the underlying technology.</small>
    <div class="investment-offer-actions">
      <button class="advisor-order" data-investment-accept="${offer.id}" data-host-region="${offer.hostRegionId}">Accept concession</button>
      <button class="advisor-order danger" data-investment-reject="${offer.id}" data-host-region="${offer.hostRegionId}">Reject</button>
    </div>
  </article>`;
}

function assetCard(sim, region, asset) {
  const owner = polityName(sim, asset.ownerPolityId);
  const operator = polityName(sim, asset.operatorPolityId);
  const financier = polityName(sim, asset.financedByPolityId || asset.ownerPolityId);
  const builder = polityName(sim, asset.builtByPolityId || asset.technologySourcePolityId || asset.ownerPolityId);
  const condition = pct(asset.condition ?? 1);
  const capacity = pct(asset.effectiveCapacity ?? (asset.status === 'construction' ? asset.progress || 0 : 1));
  const concession = asset.foreignOwner && asset.concessionYearsRemaining > 0 ? `${Math.round(asset.concessionYearsRemaining)} years remaining` : 'No active foreign concession';
  return `<div class="advisor-note investment-asset-card">
    <strong>${typeName(asset.type)} · ${region.name}</strong><br>
    ${String(asset.status || 'operational').replaceAll('_', ' ')} · condition ${condition} · effective capacity ${capacity}<br>
    Owner: ${owner} · operator: ${operator}<br>
    Financed by: ${financier} · built with expertise from: ${builder}<br>
    <small>${concession}${asset.ownerFirmId ? ` · corporate asset ${asset.ownerFirmId}` : ''}</small>
  </div>`;
}

function renderPanel(sim, panel) {
  const { polity, territories } = playerState(sim);
  if (!polity) {
    panel.innerHTML = '<h3>Foreign investment</h3><p class="advisor-note">No player government is active.</p>';
    return;
  }
  const policy = ensureInvestmentPolicy(polity);
  const proposals = territories.flatMap((region) => ensureCorporateInfrastructure(region).proposals)
    .filter((proposal) => proposal.status === 'pending')
    .sort((a, b) => (a.createdTick || 0) - (b.createdTick || 0));
  const assets = territories.flatMap((region) => ensureCorporateInfrastructure(region).assets.map((asset) => ({ region, asset })))
    .filter(({ asset }) => asset.status !== 'destroyed')
    .sort((a, b) => Number(b.asset.foreignOwner) - Number(a.asset.foreignOwner) || a.region.name.localeCompare(b.region.name));

  panel.innerHTML = `
    <h3>Foreign investment & infrastructure</h3>
    <p class="advisor-voice">“Foreign capital can start works our own firms cannot yet attempt. The price may be decades of foreign ownership, exported profits and dependence on engineers we do not command.”</p>
    <label class="advisor-field"><span>Ordinary commercial investment</span><select data-investment-policy="general">${policyOptions(policy.general)}</select></label>
    <p class="advisor-note">${POLICY_HELP[policy.general]}</p>
    <label class="advisor-field"><span>Strategic infrastructure</span><select data-investment-policy="strategic">${policyOptions(policy.strategic)}</select></label>
    <p class="advisor-note">${POLICY_HELP[policy.strategic]}</p>
    <div class="advisor-report-row"><span>Investor confidence in our government</span><strong>${pct(polity.investmentReputation ?? 1)}</strong></div>
    <div class="advisor-report-row ${(polity.expropriationMemory || 0) > .2 ? 'warning' : ''}"><span>Expropriation memory</span><strong>${pct(polity.expropriationMemory || 0)}</strong></div>
    <p class="advisor-note">Closing the market does not create an abstract penalty. It simply removes foreign capital and expertise from the projects available to the realm; domestic firms can still build when they have the money and know-how.</p>
    <h3>Offers awaiting decision</h3>
    ${proposals.length ? proposals.map((offer) => offerCard(sim, offer)).join('') : '<p class="advisor-note">No foreign corporation is presently asking for a concession.</p>'}
    <h3>Major corporate infrastructure</h3>
    ${assets.length ? assets.map(({ region, asset }) => assetCard(sim, region, asset)).join('') : '<p class="advisor-note">No major corporate infrastructure has been recorded in the realm.</p>'}
  `;

  panel.querySelectorAll('[data-investment-policy]').forEach((select) => select.addEventListener('change', () => {
    const key = select.dataset.investmentPolicy;
    setForeignInvestmentPolicy(polity, { [key]: select.value });
    renderPanel(sim, panel);
  }));
  panel.querySelectorAll('[data-investment-accept]').forEach((button) => button.addEventListener('click', () => {
    const hostRegion = regionById(sim, button.dataset.hostRegion);
    if (!hostRegion) return;
    resolveCorporateInfrastructureOffer({ offerId: button.dataset.investmentAccept, hostRegion, hostPolity: polity, regions: sim.regions, polities: sim.polities, choice: 'accept', currentTick: sim.clock?.tickIndex || 0 });
    renderPanel(sim, panel);
  }));
  panel.querySelectorAll('[data-investment-reject]').forEach((button) => button.addEventListener('click', () => {
    const hostRegion = regionById(sim, button.dataset.hostRegion);
    if (!hostRegion) return;
    resolveCorporateInfrastructureOffer({ offerId: button.dataset.investmentReject, hostRegion, hostPolity: polity, regions: sim.regions, polities: sim.polities, choice: 'reject', currentTick: sim.clock?.tickIndex || 0 });
    renderPanel(sim, panel);
  }));
}

function maybeMount(sim) {
  const content = document.getElementById('advisor-content');
  const treasurer = document.querySelector('[data-advisor="treasurer"]');
  if (!content || !treasurer?.classList.contains('active')) return;
  let panel = document.getElementById('foreign-investment-advisor-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'foreign-investment-advisor-panel';
    panel.className = 'advisor-section foreign-investment-advisor-panel';
    content.appendChild(panel);
  }
  renderPanel(sim, panel);
}

export function installForeignInvestmentUi(sim = window.__worldsim) {
  const content = document.getElementById('advisor-content');
  if (!sim || !content || content.dataset.foreignInvestmentUiInstalled === 'true') return false;
  content.dataset.foreignInvestmentUiInstalled = 'true';
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; maybeMount(sim); });
  };
  new MutationObserver(schedule).observe(content, { childList: true, subtree: false });
  document.getElementById('advisor-tabs')?.addEventListener('click', schedule);
  document.getElementById('btn-council')?.addEventListener('click', schedule);
  schedule();
  return true;
}

if (typeof window !== 'undefined' && window.__worldsim) installForeignInvestmentUi(window.__worldsim);
