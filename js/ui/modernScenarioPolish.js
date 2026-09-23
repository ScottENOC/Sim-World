import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function modernDateFromElapsed(startYear, elapsedDays) {
  const base = new Date(Date.UTC(startYear, 0, 1));
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.floor(Number(elapsedDays) || 0)));
  return `${base.getUTCDate()} ${MONTHS[base.getUTCMonth()]} ${base.getUTCFullYear()}`;
}

function controlledRegions(sim) {
  const polityId = sim?.activePlayerPolityId;
  if (!polityId) return [];
  return (sim.regions || []).filter((region) => (
    region.governance?.sovereignPolityId === polityId ||
    region.governance?.localPolityId === polityId ||
    region.polityId === polityId
  ));
}

function focusRegions(map, regions, { padding = 46, maxScale = 6 } = {}) {
  if (!map?.projection || !map?._zoom || !map?.canvas || !regions?.length || typeof d3 === 'undefined') return false;
  const points = regions.map((region) => map.projection(region.centroid)).filter(Boolean);
  if (!points.length) return false;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (points.length === 1) {
    minX -= 28; maxX += 28; minY -= 28; maxY += 28;
  }
  const spanX = Math.max(32, maxX - minX);
  const spanY = Math.max(32, maxY - minY);
  const width = Math.max(1, map.width - padding * 2);
  const height = Math.max(1, map.height - padding * 2);
  const scale = Math.max(1, Math.min(maxScale, Math.min(width / spanX, height / spanY) * 0.78));
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const transform = d3.zoomIdentity
    .translate(map.width / 2 - centreX * scale, map.height / 2 - centreY * scale)
    .scale(scale);
  d3.select(map.canvas).call(map._zoom.transform, transform);
  return true;
}

function installHomeButton(sim) {
  const controls = document.getElementById('hud-controls');
  if (!controls || document.getElementById('btn-home-country')) return;
  const button = document.createElement('button');
  button.id = 'btn-home-country';
  button.className = 'hud-btn';
  button.type = 'button';
  button.textContent = '⌂';
  button.setAttribute('aria-label', 'Return to your country');
  button.title = 'Return to your country';
  button.addEventListener('click', () => focusRegions(sim.map, controlledRegions(sim)));
  controls.insertBefore(button, controls.firstChild);
}

export function applyModernScenarioPolish(sim) {
  const scenario = currentScenario();
  if (scenario?.rulesProfile !== 'modern-crisis' || !sim?.clock) return false;
  if (!sim.clock.__modernDateFormatInstalled) {
    sim.clock.__modernDateFormatInstalled = true;
    sim.clock.formatDate = () => modernDateFromElapsed(Number(scenario.startYear) || 2027, sim.clock.elapsedDays);
  }
  const date = document.getElementById('hud-date');
  if (date) date.textContent = sim.clock.formatDate();
  installHomeButton(sim);
  requestAnimationFrame(() => requestAnimationFrame(() => focusRegions(sim.map, controlledRegions(sim))));
  return true;
}

export function refocusModernPlayerCountry(sim) {
  return focusRegions(sim?.map, controlledRegions(sim));
}
