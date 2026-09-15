import {
  INFRASTRUCTURE_OWNERSHIP,
  buildInfrastructureIndex,
  infrastructureConditionClass,
  infrastructureDetail,
  infrastructureOwnershipClass,
  infrastructureSummary,
} from './infrastructureMapView.js?v=20260915-infra-map1';

const STATUS_COLOURS = Object.freeze({
  operational: '#d9ded8',
  construction: '#e1b866',
  damaged: '#d98555',
  crippled: '#c9564d',
  destroyed: '#5e6066',
});

function installStyles() {
  if (document.getElementById('infrastructure-map-styles')) return;
  const style = document.createElement('style');
  style.id = 'infrastructure-map-styles';
  style.textContent = `
    #infrastructure-detail-card {
      position:absolute; z-index:18; left:12px; right:12px;
      bottom:calc(12px + env(safe-area-inset-bottom));
      max-width:560px; margin:0 auto; padding:12px 14px 14px;
      border:1px solid var(--bronze-dim); border-radius:12px;
      background:rgba(19,24,34,.96); box-shadow:0 7px 24px rgba(0,0,0,.35);
      color:var(--parchment); font-size:12px; line-height:1.35;
    }
    #infrastructure-detail-card.hidden { display:none; }
    #infrastructure-detail-card h3 { margin:0 38px 2px 0; font-size:16px; }
    #infrastructure-detail-card .infra-sub { color:var(--parchment-dim); margin-bottom:9px; }
    #infrastructure-detail-card .infra-grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 14px; }
    #infrastructure-detail-card .infra-grid div { min-width:0; }
    #infrastructure-detail-card .infra-label { display:block; color:var(--parchment-dim); font-size:10px; text-transform:uppercase; letter-spacing:.04em; }
    #infrastructure-detail-card .infra-value { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    #infrastructure-detail-close { position:absolute; right:8px; top:8px; width:34px; height:34px; border-radius:50%; border:1px solid var(--bronze-dim); background:rgba(16,20,28,.84); color:var(--parchment); font-size:20px; }
    #infrastructure-legend { position:absolute; z-index:12; left:12px; top:88px; padding:7px 9px; border-radius:9px; background:rgba(19,24,34,.88); border:1px solid rgba(192,138,78,.45); color:var(--parchment-dim); font-size:10px; line-height:1.45; pointer-events:none; }
    #infrastructure-legend.hidden { display:none; }
    #infrastructure-legend i { display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:5px; }
    @media (max-width:520px) {
      #infrastructure-detail-card { left:8px; right:8px; bottom:calc(8px + env(safe-area-inset-bottom)); }
      #infrastructure-detail-card .infra-grid { grid-template-columns:1fr 1fr; gap:6px 10px; }
      #infrastructure-legend { top:82px; left:8px; }
    }
  `;
  document.head.appendChild(style);
}

function ensureCard() {
  let card = document.getElementById('infrastructure-detail-card');
  if (card) return card;
  card = document.createElement('section');
  card.id = 'infrastructure-detail-card';
  card.className = 'hidden';
  card.setAttribute('aria-live', 'polite');
  card.innerHTML = '<button id="infrastructure-detail-close" aria-label="Close infrastructure details">×</button><div id="infrastructure-detail-content"></div>';
  document.getElementById('app')?.appendChild(card);
  card.querySelector('#infrastructure-detail-close')?.addEventListener('click', () => card.classList.add('hidden'));
  return card;
}

function ensureLegend() {
  let legend = document.getElementById('infrastructure-legend');
  if (legend) return legend;
  legend = document.createElement('div');
  legend.id = 'infrastructure-legend';
  legend.className = 'hidden';
  legend.innerHTML = Object.values(INFRASTRUCTURE_OWNERSHIP)
    .map((entry) => `<div><i style="background:${entry.colour}"></i>${entry.label}</div>`)
    .join('') + '<div>○ building · orange/red = degraded</div>';
  document.getElementById('app')?.appendChild(legend);
  return legend;
}

function setCardDetail(entry, sim) {
  const card = ensureCard();
  const detail = infrastructureDetail(entry, sim);
  const status = detail.conditionClass === 'construction'
    ? `${Math.round(detail.progress * 100)}% built`
    : `${detail.conditionClass} · ${Math.round(detail.condition * 100)}% condition`;
  const capacity = `${Math.round(detail.effectiveCapacity * 100)}%`;
  const concession = detail.concessionYearsRemaining > 0 ? `${detail.concessionYearsRemaining.toFixed(1)} years remaining` : 'None';
  const maintenance = detail.maintenanceRatio == null ? '—' : `${Math.round(detail.maintenanceRatio * 100)}%`;
  const operation = detail.operatingRatio == null ? '—' : `${Math.round(detail.operatingRatio * 100)}%`;
  card.querySelector('#infrastructure-detail-content').innerHTML = `
    <h3>${detail.name}</h3>
    <div class="infra-sub">${detail.regionName} · ${detail.ownershipLabel}</div>
    <div class="infra-grid">
      <div><span class="infra-label">Owner</span><span class="infra-value">${detail.owner}</span></div>
      <div><span class="infra-label">Operator</span><span class="infra-value">${detail.operator}</span></div>
      <div><span class="infra-label">Financier</span><span class="infra-value">${detail.financier}</span></div>
      <div><span class="infra-label">Builder</span><span class="infra-value">${detail.builder}</span></div>
      <div><span class="infra-label">Status</span><span class="infra-value">${status}</span></div>
      <div><span class="infra-label">Effective capacity</span><span class="infra-value">${capacity}</span></div>
      <div><span class="infra-label">Concession</span><span class="infra-value">${concession}</span></div>
      <div><span class="infra-label">Maintenance / inputs</span><span class="infra-value">${maintenance} / ${operation}</span></div>
      ${detail.recentDamage ? `<div style="grid-column:1/-1"><span class="infra-label">Recent damage</span><span class="infra-value">${detail.recentDamage}</span></div>` : ''}
    </div>`;
  card.classList.remove('hidden');
}

function screenPoint(map, projected) {
  return {
    x: projected[0] * map.transform.k + map.transform.x,
    y: projected[1] * map.transform.k + map.transform.y,
  };
}

function projectedOffset(index, count, radius) {
  if (count <= 1) return [0, 0];
  const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

function installRendererExtension(sim) {
  const map = sim?.map;
  if (!map || map._infrastructureOverlayInstalled) return;
  map._infrastructureOverlayInstalled = true;
  map._infrastructureHitTargets = [];
  const originalDraw = map.draw.bind(map);
  map.draw = (...args) => {
    const result = originalDraw(...args);
    if (map.layer?.visualOverlay === 'infrastructure' && !map._isInteracting) drawInfrastructureOverlay(sim);
    return result;
  };

  map.canvas.addEventListener('click', (event) => {
    if (map.layer?.visualOverlay !== 'infrastructure') return;
    const rect = map.canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = (map._infrastructureHitTargets || []).find((target) => Math.hypot(target.x - x, target.y - y) <= target.radius);
    if (!hit) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    setCardDetail(hit.entry, sim);
  }, true);
}

function drawRailLine(ctx, map, entry, colour) {
  const a = map.projection(entry.region?.centroid);
  const b = map.projection(entry.otherRegion?.centroid);
  if (!a || !b) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.globalAlpha = infrastructureConditionClass(entry.asset) === 'construction' ? 0.45 : 0.72;
  ctx.lineWidth = Math.max(0.7, 1.6 / map.transform.k);
  if (infrastructureConditionClass(entry.asset) === 'construction') ctx.setLineDash([4 / map.transform.k, 3 / map.transform.k]);
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
  ctx.restore();
}

function drawInfrastructureOverlay(sim) {
  const map = sim.map;
  const ctx = map.ctx;
  const index = buildInfrastructureIndex(sim);
  const detailed = map.transform.k >= 2.8;
  const drawnRailways = new Set();
  const hitTargets = [];

  ctx.save();
  ctx.translate(map.transform.x, map.transform.y);
  ctx.scale(map.transform.k, map.transform.k);
  const unit = 1 / map.transform.k;

  if (detailed) {
    for (const entries of index.values()) {
      for (const entry of entries) {
        if (entry.kind !== 'railway' || drawnRailways.has(entry.asset.id)) continue;
        if (!entry.otherRegion || !map.isRegionVisible(entry.region) || !map.isRegionVisible(entry.otherRegion)) continue;
        drawnRailways.add(entry.asset.id);
        drawRailLine(ctx, map, entry, INFRASTRUCTURE_OWNERSHIP[infrastructureOwnershipClass(entry.asset)].colour);
      }
    }
  }

  for (const region of sim.regions || []) {
    if (!map.isRegionVisible(region) || !map._regionOnScreen(region, 90)) continue;
    const entries = index.get(region.id) || [];
    if (!entries.length) continue;
    const centre = map.projection(region.centroid);
    if (!centre) continue;

    if (!detailed) {
      const summary = infrastructureSummary(entries);
      const radius = Math.min(6.5, 2.8 + Math.log2(summary.total + 1)) * unit;
      ctx.fillStyle = summary.foreign > summary.total / 2 ? INFRASTRUCTURE_OWNERSHIP.foreign_owned.colour : INFRASTRUCTURE_OWNERSHIP.domestic_state.colour;
      ctx.strokeStyle = summary.degraded > 0 ? STATUS_COLOURS.damaged : summary.construction > 0 ? STATUS_COLOURS.construction : '#f1e3bd';
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.4 * unit;
      ctx.beginPath();
      ctx.arc(centre[0], centre[1], radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      continue;
    }

    const visibleEntries = entries.slice(0, 10);
    visibleEntries.forEach((entry, i) => {
      const ownership = infrastructureOwnershipClass(entry.asset);
      const condition = infrastructureConditionClass(entry.asset);
      const offset = projectedOffset(i, visibleEntries.length, 13 * unit);
      const x = centre[0] + offset[0];
      const y = centre[1] + offset[1];
      const radius = 4.2 * unit;
      ctx.fillStyle = INFRASTRUCTURE_OWNERSHIP[ownership].colour;
      ctx.strokeStyle = STATUS_COLOURS[condition];
      ctx.globalAlpha = condition === 'destroyed' ? 0.45 : 0.96;
      ctx.lineWidth = (condition === 'damaged' || condition === 'crippled' ? 2 : 1.2) * unit;
      if (condition === 'construction') {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      const point = screenPoint(map, [x, y]);
      hitTargets.push({ x: point.x, y: point.y, radius: 18, entry });
    });
  }
  ctx.restore();
  map._infrastructureHitTargets = hitTargets;
}

function installButton(sim) {
  const group = document.querySelector('.layer-toggle');
  if (!group || document.getElementById('layer-infrastructure')) return;
  const button = document.createElement('button');
  button.id = 'layer-infrastructure';
  button.type = 'button';
  button.textContent = 'Infra';
  button.title = 'Infrastructure ownership, concessions, construction and damage';
  group.appendChild(button);
  const legend = ensureLegend();

  button.addEventListener('click', () => {
    group.querySelectorAll('button').forEach((candidate) => candidate.classList.toggle('active', candidate === button));
    sim.map.setLayer({
      type: 'gradient',
      label: 'Infrastructure',
      valueFn: (region) => region?.corporateInfrastructure?.assets?.length || 0,
      colorLow: '#2c3433',
      colorHigh: '#756344',
      format: (value) => `${Math.round(value)} assets`,
      visualOverlay: 'infrastructure',
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

export function installInfrastructureMapUi(sim) {
  if (!sim?.map || !Array.isArray(sim?.regions)) return false;
  installStyles();
  ensureCard();
  ensureLegend();
  installRendererExtension(sim);
  installButton(sim);
  return true;
}
