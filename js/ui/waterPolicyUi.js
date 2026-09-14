import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { ensureRegionalHydrology, setWaterOperatingPriority, setWaterPolicy } from '../world/hydrology.js?v=20260914-water2';

const pct = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const flow = (value) => Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '—';

function hasWaterManagement(player) {
  return player?.unlockedTechIds?.has?.('water_management') ||
    (player?.construction?.assets || []).some((asset) => ['irrigation','canal','river_weir','reservoir_dam'].includes(asset.typeId) && (asset.condition ?? 1) > 0.2);
}

function waterSection(player) {
  if (!hasWaterManagement(player)) return '';
  const h = ensureRegionalHydrology(player);
  const p = player.waterPolicy || {};
  const report = h.report || {};
  const priority = p.operatingPriority || 'balanced';
  const reservoir = (player.construction?.assets || []).some((asset) => ['river_weir','reservoir_dam'].includes(asset.typeId) && (asset.condition ?? 1) > 0.2);
  return `<section class="advisor-section"><h3>River and water management</h3>
    <div class="advisor-report-row"><span>Surface inflow / outflow</span><strong>${flow(report.surfaceInflow)} / ${flow(report.surfaceOutflow)}</strong></div>
    <div class="advisor-report-row"><span>Surface water withdrawn</span><strong>${flow(report.surfaceWithdrawal)}</strong></div>
    <div class="advisor-report-row"><span>River-water health risk</span><strong>${pct(report.waterHealthRisk)}</strong></div>
    <label class="advisor-field"><span>Irrigation and diversion intensity</span><select data-water-withdrawal>
      <option value="0.2" ${(p.surfaceWithdrawalIntensity ?? 0.5) < 0.35 ? 'selected' : ''}>Conservative</option>
      <option value="0.5" ${(p.surfaceWithdrawalIntensity ?? 0.5) >= 0.35 && (p.surfaceWithdrawalIntensity ?? 0.5) < 0.75 ? 'selected' : ''}>Moderate</option>
      <option value="1" ${(p.surfaceWithdrawalIntensity ?? 0.5) >= 0.75 ? 'selected' : ''}>Maximise local withdrawals</option>
    </select></label>
    ${reservoir ? `<label class="advisor-field"><span>Reservoir operating priority</span><select data-water-priority>
      <option value="balanced" ${priority === 'balanced' ? 'selected' : ''}>Balanced river management</option>
      <option value="irrigation" ${priority === 'irrigation' ? 'selected' : ''}>Irrigation security</option>
      <option value="flood_control" ${priority === 'flood_control' ? 'selected' : ''}>Flood control</option>
      <option value="downstream" ${priority === 'downstream' ? 'selected' : ''}>Protect downstream flow</option>
      <option value="hydropower" ${priority === 'hydropower' ? 'selected' : ''}>Hydropower / steady releases</option>
    </select></label>` : ''}
    <p class="advisor-note">Reservoirs change when water arrives downstream as well as how much arrives. Withdrawing or polluting water can damage downstream health, navigation and diplomacy once the consequences are understood.</p>
  </section>`;
}

if (!AdvisorCouncil.prototype.__waterPolicyPatched) {
  AdvisorCouncil.prototype.__waterPolicyPatched = true;
  const originalRenderSteward = AdvisorCouncil.prototype.renderSteward;
  AdvisorCouncil.prototype.renderSteward = function renderStewardWithWater(player) {
    return originalRenderSteward.call(this, player) + waterSection(player);
  };

  const originalWireCurrent = AdvisorCouncil.prototype.wireCurrent;
  AdvisorCouncil.prototype.wireCurrent = function wireCurrentWithWater(player) {
    const result = originalWireCurrent.call(this, player);
    const withdrawal = document.querySelector('[data-water-withdrawal]');
    if (withdrawal) withdrawal.addEventListener('change', () => {
      setWaterPolicy(player, { surfaceWithdrawalIntensity: Number(withdrawal.value) });
      this.render(false);
    });
    const priority = document.querySelector('[data-water-priority]');
    if (priority) priority.addEventListener('change', () => {
      setWaterOperatingPriority(player, priority.value);
      this.render(false);
    });
    return result;
  };
}
