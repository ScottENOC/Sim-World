import {
  buildElectricGridMapIndex,
  electricGridOverlaySummary,
} from './electricGridMapView.js?v=20260921-grid-map1';

const POWER_COLOUR = '#6fcdf2';
const COMMS_COLOUR = '#91d8af';
const CONSTRUCTION_COLOUR = '#e1b866';
const DEGRADED_COLOUR = '#e1a45e';
const OFFLINE_COLOUR = '#d9675b';
const DISCONNECTED_COLOUR = '#777d84';
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '0';

function installStyles() {
  if (document.getElementById('electric-grid-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'electric-grid-map-styles';
  style.textContent = `
    #electric-grid-map-legend {
      position:absolute; z-index:12; left:12px; top:88px; padding:7px 9px;
      border-radius:9px; background:rgba(19,24,34,.9); border:1px solid rgba(192,138,78,.45);
      color:var(--parchment-dim); font-size:10px; line-height:1.5; pointer-events:none;
    }
    #electric-grid-map-legend.hidden { display:none; }
    #electric-grid-map-legend .grid-legend-line { display:inline-block; width:24px; margin-right:6px; vertical-align:middle; border-top:3px solid ${POWER_COLOUR}; }
    #electric-grid-map-legend .grid-legend-line.subsea { border-top-style:dashed; }
    #electric-grid-map-legend .grid-legend-line.comms { border-top:2px dotted ${COMMS_COLOUR}; }
    #electric-grid-map-legend .grid-legend-line.damaged { border-top-color:${OFFLINE_COLOUR}; }
    #electric-grid-map-detail {
      position:absolute; z-index:19; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom));
      max-width:570px; margin:0 auto; padding:12px 14px 14px; border:1px solid var(--bronze-dim);
      border-radius:12px; background:rgba(19,24,34,.97); box-shadow:0 7px 24px rgba(0,0,0,.36);
      color:var(--parchment); font-size:12px; line-height:1.35;
    }
    #electric-grid-map-detail.hidden { display:none; }
    #electric-grid-map-detail h3 { margin:0 40px 2px 0; font-size:16px; }
    #electric-grid-map-detail .grid-map-sub { color:var(--parchment-dim); margin-bottom:9px; }
    #electric-grid-map-detail .grid-map-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; }
    #electric-grid-map-detail .grid-map-label { display:block; color:var(--parchment-dim); font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
    #electric-grid-map-detail .grid-map-value { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #electric-grid-map-detail .grid-map-alert { grid-column:1/-1; padding-top:4px; color:#e1b866; }
    #electric-grid-map-detail-close { position:absolute; right:8px; top:8px; width:34px; height:34px; border-radius:50%; border:1px solid var(--bronze-dim); background:rgba(16,20,28,.84); color:var(--parchment); font-size:20px; }
    @media (max-width:520px) {
      #electric-grid-map-detail { left:8px; right:8px; bottom:calc(8px + env(safe-area-inset-bottom)); }
      #electric-grid-map-legend { top:82px; left:8px; }
    }
  `;
  document.head.appendChild(style);
}

function ensureLegend() {
  let legend = document.getElementById('electric-grid-map-legend');
  if (legend) return legend;
  legend = document.createElement('div');
  legend.id = 'electric-grid-map-legend';
  legend.className = 'hidden';
  legend.innerHTML = `
    <div><i class="grid-legend-line"></i>Land power</div>
    <div><i class="grid-legend-line subsea"></i>Subsea power</div>
    <div><i class="grid-legend-line comms"></i>Communications</div>
    <div><i class="grid-legend-line damaged"></i>Damaged / offline</div>
    <div>Line weight/brightness = capacity & utilisation · arrow = last flow</div>`;
  document.getElementById('app')?.appendChild(legend);
  return legend;
}

function ensureCard() {
  let card = document.getElementById('electric-grid-map-detail');
  if (card) return card;
  card = document.createElement('section');
  card.id = 'electric-grid-map-detail';
  card.className = 'hidden';
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<button id="electric-grid-map-detail-close" aria-label="Close grid link details">×</button><div id="electric-grid-map-detail-content"></div>';
  document.getElementById('app')?.appendChild(card);
  card.querySelector('#electric-grid-map-detail-close')?.addEventListener('click', () => card.classList.add('hidden'));
  return card;
}

function recentIncident(entry, sim) {
  const ids = [entry.fromRegionId, entry.toRegionId];
  const incidents = [];
  for (const region of sim.regions || []) {
    if (!ids.includes(region.id)) continue;
    for (const incident of region.gridInterconnection?.incidents || []) {
      if (incident.linkId === entry.id) incidents.push(incident);
    }
  }
  const unique = new Map(incidents.map((incident) => [incident.id, incident]));
  return [...unique.values()].at(-1) || null;
}

function showDetail(entry, sim) {
  const card = ensureCard();
  const content = card.querySelector('#electric-grid-map-detail-content');
  if (entry.kind === 'project') {
    content.innerHTML = `
      <h3>${esc(entry.fromName)} → ${esc(entry.toName)}</h3>
      <div class="grid-map-sub">Interconnector under construction · ${entry.undersea ? 'subsea cable' : 'land transmission'}</div>
      <div class="grid-map-grid">
        <div><span class="grid-map-label">Owner</span><span class="grid-map-value">${esc(entry.ownerType)}</span></div>
        <div><span class="grid-map-label">Progress</span><span class="grid-map-value">${fmt(entry.progress * 100)}%</span></div>
        <div><span class="grid-map-label">Power capacity</span><span class="grid-map-value">${fmt(entry.powerCapacity)} MW-eq</span></div>
        <div><span class="grid-map-label">Communications</span><span class="grid-map-value">${fmt(entry.communicationsCapacity)} capacity</span></div>
      </div>`;
    card.classList.remove('hidden');
    return;
  }

  const incident = recentIncident(entry, sim);
  const flow = entry.flowDirection
    ? `${esc(entry.flowDirection.fromRegionId)} → ${esc(entry.flowDirection.toRegionId)} · ${fmt(entry.flow, 1)} sent / ${fmt(entry.delivered, 1)} delivered`
    : 'No recent transfer';
  const exposure = entry.unwantedPolityIds?.length ? `Indirect exposure conflict: ${entry.unwantedPolityIds.map(esc).join(', ')}` : '';
  content.innerHTML = `
    <h3>${esc(entry.fromName)} ↔ ${esc(entry.toName)}</h3>
    <div class="grid-map-sub">${entry.undersea ? 'Subsea cable' : 'Land transmission'} · ${entry.international ? 'international' : 'domestic'} · ${esc(entry.ownerType)} owned</div>
    <div class="grid-map-grid">
      <div><span class="grid-map-label">Status</span><span class="grid-map-value">${esc(entry.conditionClass)} · ${fmt(entry.condition * 100)}% condition</span></div>
      <div><span class="grid-map-label">Power capacity</span><span class="grid-map-value">${fmt(entry.powerCapacity)} MW-eq (${fmt(entry.effectivePowerCapacity)} effective)</span></div>
      <div><span class="grid-map-label">Utilisation</span><span class="grid-map-value">${fmt(entry.utilisation * 100)}%</span></div>
      <div><span class="grid-map-label">Communications</span><span class="grid-map-value">${fmt(entry.communicationsCapacity)} capacity</span></div>
      <div style="grid-column:1/-1"><span class="grid-map-label">Last power flow</span><span class="grid-map-value">${flow}</span></div>
      ${entry.losses > 0 ? `<div><span class="grid-map-label">Losses</span><span class="grid-map-value">${fmt(entry.losses, 1)}</span></div>` : ''}
      ${entry.disconnectReason ? `<div class="grid-map-alert">Disconnected: ${esc(entry.disconnectReason.replaceAll('_', ' '))}</div>` : ''}
      ${exposure ? `<div class="grid-map-alert">${exposure}</div>` : ''}
      ${entry.lastDamage ? `<div class="grid-map-alert">Recent damage: ${esc((entry.lastDamage.cause || 'unknown').replaceAll('_', ' '))} · ${fmt((entry.lastDamage.damage || 0) * 100)}%</div>` : ''}
      ${incident ? `<div class="grid-map-alert">Latest cable incident: ${esc((incident.cause || incident.type || 'unknown').replaceAll('_', ' '))} · ${incident.observed ? 'observed' : 'not directly observed'}${incident.response ? ` · response: ${esc(incident.response.replaceAll('_', ' '))}` : ''}</div>` : ''}
    </div>`;
  card.classList.remove('hidden');
}

function screenPoint(map, projected) {
  return {
    x: projected[0] * map.transform.k + map.transform.x,
    y: projected[1] * map.transform.k + map.transform.y,
  };
}

function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function lineColour(entry, type) {
  if (entry.kind === 'project') return CONSTRUCTION_COLOUR;
  if (entry.conditionClass === 'offline') return OFFLINE_COLOUR;
  if (entry.conditionClass === 'disconnected') return DISCONNECTED_COLOUR;
  if (entry.conditionClass === 'degraded') return DEGRADED_COLOUR;
  return type === 'communications' ? COMMS_COLOUR : POWER_COLOUR;
}

function powerWidth(entry, map) {
  const capacity = Math.max(0, Number(entry.powerCapacity) || 0);
  const widthPx = Math.min(6, 1.4 + Math.log10(capacity + 1) * 0.75);
  return widthPx / map.transform.k;
}

function routeGeometry(map, entry, from, to) {
  const a = map.projection(from.centroid);
  const b = map.projection(to.centroid);
  if (!a || !b) return null;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const length = Math.max(1e-9, Math.hypot(dx, dy));
  const curve = entry.undersea ? Math.min(18 / map.transform.k, length * 0.12) : 0;
  const mid = [(a[0] + b[0]) / 2 - (dy / length) * curve, (a[1] + b[1]) / 2 + (dx / length) * curve];
  return { a, b, mid, dx, dy, length };
}

function strokeRoute(ctx, geometry, entry, map, type, offsetPx = 0) {
  const unit = 1 / map.transform.k;
  const perpendicular = geometry.length > 0 ? [-geometry.dy / geometry.length, geometry.dx / geometry.length] : [0, 0];
  const offset = offsetPx * unit;
  const ax = geometry.a[0] + perpendicular[0] * offset;
  const ay = geometry.a[1] + perpendicular[1] * offset;
  const bx = geometry.b[0] + perpendicular[0] * offset;
  const by = geometry.b[1] + perpendicular[1] * offset;
  const mx = geometry.mid[0] + perpendicular[0] * offset;
  const my = geometry.mid[1] + perpendicular[1] * offset;

  ctx.save();
  ctx.strokeStyle = lineColour(entry, type);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const utilisationBoost = entry.kind === 'link' ? 0.7 + entry.utilisation * 0.3 : 0.72;
  ctx.globalAlpha = entry.conditionClass === 'disconnected' ? 0.48 : utilisationBoost;
  ctx.lineWidth = type === 'power' ? powerWidth(entry, map) : 1.6 * unit;
  if (entry.kind === 'project') ctx.setLineDash([3.5 * unit, 3.5 * unit]);
  else if (type === 'communications') ctx.setLineDash([1.2 * unit, 3.0 * unit]);
  else if (entry.undersea) ctx.setLineDash([6 * unit, 4 * unit]);
  else if (entry.conditionClass === 'disconnected') ctx.setLineDash([5 * unit, 4 * unit]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (entry.undersea) ctx.quadraticCurveTo(mx, my, bx, by);
  else ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.restore();
}

function drawFlowArrow(ctx, map, entry, geometry) {
  if (entry.kind !== 'link' || !entry.flowDirection || entry.utilisation <= 0.01 || entry.conditionClass === 'offline' || entry.conditionClass === 'disconnected') return;
  const forward = entry.flowDirection.fromRegionId === entry.fromRegionId;
  const start = forward ? geometry.a : geometry.b;
  const end = forward ? geometry.b : geometry.a;
  const x = (start[0] + end[0]) / 2;
  const y = (start[1] + end[1]) / 2;
  const angle = Math.atan2(end[1] - start[1], end[0] - start[0]);
  const size = 5.5 / map.transform.k;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = POWER_COLOUR;
  ctx.globalAlpha = 0.75 + entry.utilisation * 0.25;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.7, size * 0.62);
  ctx.lineTo(-size * 0.7, -size * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function shouldDrawEntry(map, entry, from, to) {
  if (!map.isRegionVisible(from) || !map.isRegionVisible(to)) return false;
  if (typeof map._regionOnScreen !== 'function') return true;
  return map._regionOnScreen(from, 120) || map._regionOnScreen(to, 120);
}

function drawElectricGridOverlay(sim) {
  const map = sim.map;
  const ctx = map.ctx;
  const index = buildElectricGridMapIndex(sim.regions || []);
  const entries = [...index.projects, ...index.links];
  const hitTargets = [];

  ctx.save();
  ctx.translate(map.transform.x, map.transform.y);
  ctx.scale(map.transform.k, map.transform.k);

  for (const entry of entries) {
    const from = index.regionsById.get(entry.fromRegionId);
    const to = index.regionsById.get(entry.toRegionId);
    if (!from || !to || !shouldDrawEntry(map, entry, from, to)) continue;
    const geometry = routeGeometry(map, entry, from, to);
    if (!geometry) continue;
    const hasPower = entry.powerCapacity > 0;
    const hasComms = entry.communicationsCapacity > 0;
    if (hasPower) strokeRoute(ctx, geometry, entry, map, 'power', hasComms ? -1.8 : 0);
    if (hasComms) strokeRoute(ctx, geometry, entry, map, 'communications', hasPower ? 2.4 : 0);
    if (hasPower) drawFlowArrow(ctx, map, entry, geometry);

    const a = screenPoint(map, geometry.a);
    const b = screenPoint(map, geometry.b);
    hitTargets.push({ entry, ax:a.x, ay:a.y, bx:b.x, by:b.y, radius:Math.max(12, Math.min(22, 10 + Math.log10(Math.max(1, entry.powerCapacity)) * 2)) });
  }

  ctx.restore();
  map._electricGridHitTargets = hitTargets;
}

function installRendererExtension(sim) {
  const map = sim?.map;
  if (!map || map._electricGridOverlayInstalled) return;
  map._electricGridOverlayInstalled = true;
  map._electricGridHitTargets = [];
  const originalDraw = map.draw.bind(map);
  map.draw = (...args) => {
    const result = originalDraw(...args);
    if (map.layer?.visualOverlay === 'electric-grid' && !map._isInteracting) drawElectricGridOverlay(sim);
    return result;
  };

  map.canvas.addEventListener('click', (event) => {
    if (map.layer?.visualOverlay !== 'electric-grid') return;
    const rect = map.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = (map._electricGridHitTargets || []).find((target) => pointSegmentDistance(x, y, target.ax, target.ay, target.bx, target.by) <= target.radius);
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showDetail(hit.entry, sim);
  }, true);
}

function installButton(sim) {
  const group = document.querySelector('.layer-toggle');
  if (!group || document.getElementById('layer-electric-grid')) return;
  const button = document.createElement('button');
  button.id = 'layer-electric-grid';
  button.type = 'button';
  button.textContent = 'Grid';
  button.title = 'Electricity transmission, subsea cables, communications and current power flows';
  group.appendChild(button);
  const legend = ensureLegend();

  button.addEventListener('click', () => {
    group.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    sim.map.setLayer({
      type: 'gradient',
      label: 'Grid capacity',
      valueFn: (region) => electricGridOverlaySummary(region).powerCapacity,
      colorLow: '#222e35',
      colorHigh: '#537f91',
      format: (value) => `${Math.round(value)} MW-eq effective`,
      visualOverlay: 'electric-grid',
    });
    legend.classList.remove('hidden');
    sim.map._requestDraw?.();
  });

  group.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement && event.target !== button) {
      button.classList.remove('active');
      legend.classList.add('hidden');
      ensureCard().classList.add('hidden');
    }
  }, true);
}

export function installElectricGridMapUi(sim) {
  if (!sim?.map || !Array.isArray(sim?.regions)) return false;
  installStyles();
  ensureLegend();
  ensureCard();
  installRendererExtension(sim);
  installButton(sim);
  return true;
}
