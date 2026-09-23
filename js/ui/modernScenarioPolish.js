import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function modernDateFromElapsed(startYear, elapsedDays) {
  const base = new Date(Date.UTC(startYear, 0, 1));
  base.setUTCDate(base.getUTCDate() + Math.max(0, Math.floor(Number(elapsedDays) || 0)));
  return `${base.getUTCDate()} ${MONTHS[base.getUTCMonth()]} ${base.getUTCFullYear()}`;
}

function controlledRegions(sim) {
  const anchorRegion = sim?.fogOfWar?.playerRegionId
    ? sim?.regions?.find?.((region) => region.id === sim.fogOfWar.playerRegionId)
    : null;
  const polityId = anchorRegion?.governance?.sovereignPolityId ||
    anchorRegion?.governance?.localPolityId ||
    anchorRegion?.polityId ||
    sim?.activePlayerPolityId;
  if (!polityId) return [];
  return (sim.regions || []).filter((region) => (
    region.governance?.sovereignPolityId === polityId ||
    region.governance?.localPolityId === polityId ||
    region.polityId === polityId
  ));
}

export function finiteProjectedPoints(projection, regions = []) {
  if (typeof projection !== 'function') return [];
  return regions
    .map((region) => {
      if (!Array.isArray(region?.centroid) || region.centroid.length < 2) return null;
      const longitude = Number(region.centroid[0]);
      const latitude = Number(region.centroid[1]);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
      const point = projection([longitude, latitude]);
      if (!Array.isArray(point) || point.length < 2) return null;
      const x = Number(point[0]);
      const y = Number(point[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    })
    .filter(Boolean);
}

function focusRegions(map, regions, { padding = 46, maxScale = 6 } = {}) {
  if (!map?.projection || !map?._zoom || !map?.canvas || !regions?.length || typeof d3 === 'undefined') return false;
  const points = finiteProjectedPoints(map.projection, regions);
  if (!points.length) return false;
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (points.length === 1) {
    minX -= 28; maxX += 28; minY -= 28; maxY += 28;
  }
  const spanX = Math.max(32, maxX - minX);
  const spanY = Math.max(32, maxY - minY);
  const width = Math.max(1, Number(map.width) - padding * 2);
  const height = Math.max(1, Number(map.height) - padding * 2);
  const scale = Math.max(1, Math.min(maxScale, Math.min(width / spanX, height / spanY) * 0.78));
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  const tx = Number(map.width) / 2 - centreX * scale;
  const ty = Number(map.height) / 2 - centreY * scale;
  if (![scale, centreX, centreY, tx, ty].every(Number.isFinite)) return false;
  const transform = d3.zoomIdentity
    .translate(tx, ty)
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

function refreshModernMap(sim) {
  sim?.map?.refreshLayer?.();
  sim?.map?.draw?.();
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

  // Scenario runtime can switch the map from fogged to globally known after the
  // renderer and its layer cache already exist. Rebuild that cache immediately so
  // the first modern frame is drawable even before the hidden anchor handoff fires.
  refreshModernMap(sim);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    focusRegions(sim.map, controlledRegions(sim));
    refreshModernMap(sim);
  }));
  return true;
}

export function refocusModernPlayerCountry(sim) {
  const focused = focusRegions(sim?.map, controlledRegions(sim));
  refreshModernMap(sim);
  return focused;
}
