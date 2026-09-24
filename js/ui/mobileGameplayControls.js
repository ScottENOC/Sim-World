import {
  CONSTRUCTION_TYPES,
  ensureConstruction,
  operationalInfrastructure,
  startConstruction,
  setConstructionWorkers,
  cancelConstruction,
} from '../economy/construction.js?v=20260905-projects1';
import {
  SHIP_DESIGNS,
  ensureNavalProcurement,
  navalDesignClassOptions,
  preferredWarshipDesign,
} from '../military/fleets.js?v=20260919-naval-light-metals1';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));
const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '0';

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;
}

export function playerControlsRegion(sim, region) {
  if (!sim || !region) return false;
  const player = sim.activePlayerPolityId || sim.fogOfWar?.playerRegionId || null;
  return Boolean(player && (actorId(region) === player || region.id === player));
}

function hasTech(region, id) {
  return Boolean(region?.unlockedTechIds?.has?.(id));
}

function constructionReason(region, type) {
  const state = ensureConstruction(region);
  if (type.requiredTechId && !hasTech(region, type.requiredTechId)) return `Needs ${type.requiredTechId.replaceAll('_', ' ')}`;
  if (type.coastal && !region.isCoastal) return 'Coastal regions only';
  if (type.requiresInfrastructure && !operationalInfrastructure(region, type.requiresInfrastructure)) {
    const name = CONSTRUCTION_TYPES[type.requiresInfrastructure]?.name || type.requiresInfrastructure.replaceAll('_', ' ');
    return `Needs operational ${name}`;
  }
  if (type.requiresDeposit && !region.deposits?.[type.requiresDeposit]) return `Needs local ${type.requiresDeposit.replaceAll('_', ' ')} deposit`;
  if (type.requiresRiver && !(region.hydrology?.riverIds || []).length) return 'Needs a river';
  if (type.requiresCoolingWater && !region.isCoastal && !(region.hydrology?.riverIds || []).length) return 'Needs dependable cooling water';
  if (type.minPopulation && (region.population || 0) < type.minPopulation) return `Needs population ${Math.round(type.minPopulation).toLocaleString()}+`;
  if (type.unique && state.assets.some((asset) => asset.typeId === type.id)) return 'Already built';
  if (state.projects.some((project) => project.typeId === type.id && project.status === 'active')) return 'Already under construction';
  return null;
}

export function constructionAvailability(region) {
  return Object.values(CONSTRUCTION_TYPES).map((type) => ({ type, reason: constructionReason(region, type) }));
}

function materialText(materials = {}) {
  const entries = Object.entries(materials).filter(([, amount]) => Number(amount) > 0);
  return entries.length ? entries.map(([key, amount]) => `${Math.round(amount).toLocaleString()} ${key.replaceAll('_', ' ')}`).join(' · ') : 'No material requirement';
}

function installStyles() {
  if (document.getElementById('mobile-gameplay-control-styles')) return;
  const style = document.createElement('style');
  style.id = 'mobile-gameplay-control-styles';
  style.textContent = `
    #map-focus-actions { display:flex; gap:6px; align-items:center; margin-left:auto; padding-left:8px; }
    #map-focus-actions button { min-height:32px; padding:4px 9px; border-radius:8px; border:1px solid var(--bronze-dim); background:rgba(16,20,28,.86); color:var(--parchment); font-size:11px; }
    #map-focus-actions button.hidden { display:none; }
    #infrastructure-build-modal .modal-card, #naval-procurement-panel { font-size:12px; }
    #infrastructure-build-modal .modal-card { max-width:680px; max-height:88vh; overflow:auto; }
    .mobile-build-summary { margin:8px 0; padding:9px; border:1px solid rgba(255,255,255,.13); border-radius:9px; background:rgba(255,255,255,.025); }
    .mobile-build-grid { display:grid; grid-template-columns:1fr auto; gap:7px 10px; align-items:center; }
    .mobile-build-grid label { min-width:0; }
    .mobile-build-grid select, .mobile-build-grid input { width:100%; max-width:100%; }
    .mobile-build-muted { opacity:.72; }
    .mobile-build-warning { color:#e1b866; }
    .mobile-project-row { margin:7px 0; padding:8px; border:1px solid rgba(255,255,255,.12); border-radius:8px; }
    #naval-procurement-panel { margin:0 0 14px; padding:11px; border:1px solid rgba(192,138,78,.5); border-radius:10px; background:rgba(192,138,78,.06); }
    #naval-procurement-panel h3 { margin:0 0 5px; }
    #naval-procurement-panel .naval-order-row { display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; margin-top:8px; }
    #naval-procurement-panel .naval-order-row button { min-width:42px; min-height:34px; }
    #infrastructure-legend, #electric-grid-map-legend { display:none !important; }
    @media (max-width:520px) {
      #map-focus-actions { gap:4px; padding-left:5px; }
      #map-focus-actions button { min-height:30px; padding:3px 7px; font-size:10px; }
      .mobile-build-grid { grid-template-columns:1fr; }
      #infrastructure-build-modal .modal-card { margin:4vh 8px; max-height:92vh; }
    }
  `;
  document.head.appendChild(style);
}

function selectedRegion(sim) {
  return sim?.regions?.find((region) => region.id === sim?.map?.selectedId) || null;
}

function ensureInfrastructureModal() {
  let modal = document.getElementById('infrastructure-build-modal');
  if (modal) return modal;
  modal = document.createElement('div');
  modal.id = 'infrastructure-build-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-card">
      <button id="btn-close-infrastructure-build" class="menu-close" aria-label="Close">&times;</button>
      <h2 id="infrastructure-build-title">Infrastructure</h2>
      <div id="infrastructure-build-content"></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#btn-close-infrastructure-build')?.addEventListener('click', () => modal.classList.add('hidden'));
  return modal;
}

function renderInfrastructureModal(sim, region) {
  const modal = ensureInfrastructureModal();
  const title = modal.querySelector('#infrastructure-build-title');
  const content = modal.querySelector('#infrastructure-build-content');
  if (!region || !content) return;
  if (title) title.textContent = `Infrastructure · ${region.name}`;
  const state = ensureConstruction(region);
  const controlled = playerControlsRegion(sim, region);
  const active = state.projects.filter((project) => project.status === 'active');
  const assets = state.assets || [];
  const availability = constructionAvailability(region);
  const available = availability.filter((entry) => !entry.reason);
  const locked = availability.filter((entry) => entry.reason);
  const currentProject = active[0] || null;

  content.innerHTML = `
    <div class="mobile-build-summary">
      <strong>Existing infrastructure</strong>
      <div class="mobile-build-muted">${assets.length ? assets.map((asset) => esc(CONSTRUCTION_TYPES[asset.typeId]?.name || asset.typeId)).join(' · ') : 'None recorded in this region.'}</div>
    </div>
    <div class="mobile-build-summary">
      <strong>Construction</strong>
      ${active.length ? active.map((project) => {
        const type = CONSTRUCTION_TYPES[project.typeId];
        const progress = Math.min(100, Math.round((project.workDone || 0) / Math.max(1, project.workRequired || type?.workRequired || 1) * 100));
        return `<div class="mobile-project-row" data-project-id="${project.id}">
          <strong>${esc(type?.name || project.typeId)}</strong> · ${progress}%
          <div class="mobile-build-muted">${Math.round(project.targetWorkers || 0)} target workers${project.stalledReason ? ` · stalled: ${esc(String(project.stalledReason).replaceAll('_', ' '))}` : ''}</div>
          ${controlled ? `<div class="mobile-build-grid"><label>Workers <input data-project-workers type="number" min="${type?.minWorkers || 1}" max="${type?.maxWorkers || 100000}" value="${Math.round(project.targetWorkers || type?.defaultWorkers || 1)}"></label><button data-cancel-project>Cancel</button></div>` : ''}
        </div>`;
      }).join('') : '<div class="mobile-build-muted">No active project.</div>'}
    </div>
    ${controlled ? `<div class="mobile-build-summary">
      <strong>Start a project</strong>
      ${currentProject ? '<div class="mobile-build-warning">This region is already assigning construction labour to a project. Finish or cancel it before starting another.</div>' : `
      <div class="mobile-build-grid">
        <label>Project
          <select id="mobile-construction-type">
            ${available.map(({ type }) => `<option value="${esc(type.id)}">${esc(type.name)}</option>`).join('')}
          </select>
        </label>
        <button id="mobile-start-construction" ${available.length ? '' : 'disabled'}>Build</button>
        <label>Workers <input id="mobile-construction-workers" type="number" min="1" value="${available[0]?.type.defaultWorkers || 50}"></label>
      </div>
      <div id="mobile-construction-detail" class="mobile-build-muted"></div>`}
      ${locked.length ? `<details style="margin-top:9px"><summary>Unavailable projects (${locked.length})</summary>${locked.map(({ type, reason }) => `<div>${esc(type.name)} — <span class="mobile-build-muted">${esc(reason)}</span></div>`).join('')}</details>` : ''}
    </div>` : '<div class="mobile-build-warning">You can inspect this region, but only its controlling polity can commission construction here.</div>'}
  `;

  const refreshDetail = () => {
    const select = content.querySelector('#mobile-construction-type');
    const entry = available.find(({ type }) => type.id === select?.value) || available[0];
    if (!entry) return;
    const workers = content.querySelector('#mobile-construction-workers');
    if (workers && document.activeElement !== workers) workers.value = entry.type.defaultWorkers;
    const detail = content.querySelector('#mobile-construction-detail');
    if (detail) detail.innerHTML = `${esc(entry.type.description || '')}<br><strong>Materials:</strong> ${esc(materialText(entry.type.materials))} · <strong>Work:</strong> ${Math.round(entry.type.workRequired || 0).toLocaleString()} worker-weeks`;
  };
  content.querySelector('#mobile-construction-type')?.addEventListener('change', refreshDetail);
  refreshDetail();

  content.querySelector('#mobile-start-construction')?.addEventListener('click', () => {
    const typeId = content.querySelector('#mobile-construction-type')?.value;
    const workers = Number(content.querySelector('#mobile-construction-workers')?.value) || undefined;
    const project = startConstruction(region, typeId, workers, sim.clock?.elapsedDays || 0);
    if (!project) {
      const detail = content.querySelector('#mobile-construction-detail');
      if (detail) detail.textContent = 'The project could not be started; its requirements may have changed.';
      return;
    }
    renderInfrastructureModal(sim, region);
    sim.map?.draw?.();
  });

  content.querySelectorAll('[data-project-id]').forEach((row) => {
    const projectId = Number(row.dataset.projectId);
    row.querySelector('[data-project-workers]')?.addEventListener('change', (event) => {
      setConstructionWorkers(region, projectId, Number(event.target.value));
      renderInfrastructureModal(sim, region);
    });
    row.querySelector('[data-cancel-project]')?.addEventListener('click', () => {
      cancelConstruction(region, projectId);
      renderInfrastructureModal(sim, region);
    });
  });
  modal.classList.remove('hidden');
}

function availableNavalClasses(region) {
  const ids = new Set(['basic_war_boat']);
  if (hasTech(region, 'advanced_boatbuilding')) ids.add('galley');
  if (hasTech(region, 'ocean_sailing')) ids.add('ocean_sailing_warship');
  if (hasTech(region, 'gunpowder') && hasTech(region, 'ocean_sailing')) {
    ids.add('gunpowder_sailing_warship');
    if (operationalInfrastructure(region, 'shipyard') || operationalInfrastructure(region, 'naval_base')) ids.add('frigate');
    if (operationalInfrastructure(region, 'naval_base')) ids.add('ship_of_line');
  }
  if (hasTech(region, 'marine_steam_engine')) { ids.add('paddle_steam_warship'); ids.add('fleet_tug'); }
  if (hasTech(region, 'screw_propulsion')) ids.add('steam_frigate');
  if (hasTech(region, 'iron_hull_shipbuilding')) ids.add('ironclad');
  if (hasTech(region, 'steel_hull_shipbuilding')) ids.add('steel_warship');
  for (const option of navalDesignClassOptions(region)) ids.add(option.id);
  ids.add(preferredWarshipDesign(region, 0));
  return [...ids].filter((id) => SHIP_DESIGNS[id] && id !== 'advanced_warship')
    .sort((a, b) => (SHIP_DESIGNS[a].tier || 0) - (SHIP_DESIGNS[b].tier || 0));
}

function canOrderWarships(region) {
  if (!region?.isCoastal) return 'Select a coastal region.';
  if (hasTech(region, 'ocean_sailing') && !operationalInfrastructure(region, 'harbour')) return 'Build an operational harbour before ordering ocean-going warships.';
  return null;
}

export function setNavalClassTarget(region, designId, requestedTarget) {
  if (!SHIP_DESIGNS[designId]) return null;
  const procurement = ensureNavalProcurement(region);
  const built = Math.max(0, Number(procurement.built?.[designId]) || 0);
  const target = Math.max(Math.floor(built), Math.round(Number(requestedTarget) || 0));
  procurement.targets[designId] = target;
  if (target <= 0 && built <= 0) delete procurement.targets[designId];
  procurement.lastDecisionTick = globalThis.__worldsim?.clock?.elapsedDays ?? procurement.lastDecisionTick ?? null;
  const totalTarget = Object.values(procurement.targets).reduce((sum, value) => sum + Math.max(0, Math.round(Number(value) || 0)), 0);
  return { target, built, totalTarget };
}

function procurementRegionOptions(sim, preferred = null) {
  const regions = (sim.regions || []).filter((region) => playerControlsRegion(sim, region) && region.isCoastal);
  return regions.sort((a, b) => {
    if (a.id === preferred?.id) return -1;
    if (b.id === preferred?.id) return 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

function renderNavalProcurement(sim, preferredRegion = null) {
  const modal = document.getElementById('fleet-modal');
  const list = document.getElementById('fleet-list');
  if (!modal || !list) return false;
  let panel = document.getElementById('naval-procurement-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'naval-procurement-panel';
    list.before(panel);
  }
  const regions = procurementRegionOptions(sim, preferredRegion || selectedRegion(sim));
  if (!regions.length) {
    panel.innerHTML = '<h3>Build warships</h3><div class="raid-status">You do not control a coastal construction region.</div>';
    return true;
  }
  const remembered = panel.dataset.regionId;
  const region = regions.find((entry) => entry.id === remembered) || regions[0];
  panel.dataset.regionId = region.id;
  const procurement = ensureNavalProcurement(region);
  const classes = availableNavalClasses(region);
  const gate = canOrderWarships(region);
  const rows = classes.map((id) => {
    const spec = SHIP_DESIGNS[id];
    const target = Math.max(0, Math.round(procurement.targets?.[id] || 0));
    const built = Math.max(0, Number(procurement.built?.[id]) || 0);
    const outstanding = Math.max(0, target - built);
    return `<div class="naval-order-row" data-design-id="${id}">
      <div><strong>${esc(spec.label)}</strong><div class="raid-status">Built ${fmt(built, built % 1 ? 1 : 0)} · target ${target}${outstanding > 0 ? ` · ${fmt(outstanding, 1)} remaining` : ''}</div></div>
      <button data-naval-minus ${target <= Math.floor(built) ? 'disabled' : ''} aria-label="Cancel one ${esc(spec.label)} order">−</button>
      <button data-naval-plus ${gate ? 'disabled' : ''} aria-label="Order one ${esc(spec.label)}">+1</button>
    </div>`;
  }).join('');
  panel.innerHTML = `
    <h3>Build warships</h3>
    <div class="raid-status">Orders use the ordinary shipbuilding economy: shipwright labour and class-specific wood, metal, machinery, fuel and other inputs are consumed over time.</div>
    <label class="control-row">Construction region <select id="naval-procurement-region">${regions.map((entry) => `<option value="${esc(entry.id)}" ${entry.id === region.id ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}</select></label>
    ${gate ? `<div class="mobile-build-warning">${esc(gate)}</div>` : ''}
    ${rows || '<div class="raid-status">No warship classes are currently available here.</div>'}
    <div id="naval-procurement-status" class="raid-status"></div>`;

  panel.querySelector('#naval-procurement-region')?.addEventListener('change', (event) => {
    panel.dataset.regionId = event.target.value;
    renderNavalProcurement(sim, regions.find((entry) => entry.id === event.target.value));
  });
  panel.querySelectorAll('[data-design-id]').forEach((row) => {
    const designId = row.dataset.designId;
    row.querySelector('[data-naval-plus]')?.addEventListener('click', () => {
      const current = Math.max(0, Math.round(ensureNavalProcurement(region).targets?.[designId] || 0));
      setNavalClassTarget(region, designId, current + 1);
      renderNavalProcurement(sim, region);
    });
    row.querySelector('[data-naval-minus]')?.addEventListener('click', () => {
      const current = Math.max(0, Math.round(ensureNavalProcurement(region).targets?.[designId] || 0));
      setNavalClassTarget(region, designId, current - 1);
      renderNavalProcurement(sim, region);
    });
  });
  return true;
}

function installFocusActions(sim) {
  const bar = document.getElementById('map-focus-bar');
  if (!bar) return false;
  let actions = document.getElementById('map-focus-actions');
  if (!actions) {
    actions = document.createElement('div');
    actions.id = 'map-focus-actions';
    actions.innerHTML = '<button id="map-focus-build" type="button">Build</button><button id="map-focus-navy" type="button">Navy</button>';
    const close = document.getElementById('map-focus-close');
    bar.insertBefore(actions, close || null);
    actions.querySelector('#map-focus-build')?.addEventListener('click', () => {
      const region = selectedRegion(sim);
      if (region) renderInfrastructureModal(sim, region);
    });
    actions.querySelector('#map-focus-navy')?.addEventListener('click', () => {
      const region = selectedRegion(sim);
      document.getElementById('btn-fleets')?.click();
      requestAnimationFrame(() => renderNavalProcurement(sim, region));
    });
  }
  const refresh = () => {
    const region = selectedRegion(sim);
    const controlled = playerControlsRegion(sim, region);
    actions.querySelector('#map-focus-build')?.classList.toggle('hidden', !controlled);
    actions.querySelector('#map-focus-navy')?.classList.toggle('hidden', !controlled || !region?.isCoastal);
  };
  refresh();
  const name = document.getElementById('map-focus-name');
  if (name) new MutationObserver(refresh).observe(name, { childList: true, characterData: true, subtree: true });
  return true;
}

function copyCustomLegendIntoMain(customId, labelText) {
  const custom = document.getElementById(customId);
  const legend = document.getElementById('legend');
  const label = document.getElementById('legend-label');
  const gradient = document.getElementById('legend-gradient');
  const categorical = document.getElementById('legend-categorical');
  if (!custom || !legend || !categorical) return false;
  if (label) label.textContent = labelText;
  gradient?.classList.add('hidden');
  categorical.classList.remove('hidden');
  categorical.innerHTML = custom.innerHTML;
  legend.classList.add('legend-mode-categorical');
  legend.classList.remove('legend-mode-gradient');
  custom.classList.add('hidden');
  return true;
}

function installLegendIntegration() {
  const group = document.querySelector('.layer-toggle');
  if (!group || group.dataset.mobileLegendIntegration) return;
  group.dataset.mobileLegendIntegration = '1';
  const sync = () => {
    const infra = document.getElementById('layer-infrastructure');
    const grid = document.getElementById('layer-electric-grid');
    if (infra?.classList.contains('active')) copyCustomLegendIntoMain('infrastructure-legend', 'Infrastructure');
    else if (grid?.classList.contains('active')) copyCustomLegendIntoMain('electric-grid-map-legend', 'Grid links');
    document.getElementById('infrastructure-legend')?.classList.add('hidden');
    document.getElementById('electric-grid-map-legend')?.classList.add('hidden');
  };
  group.addEventListener('click', () => requestAnimationFrame(() => requestAnimationFrame(sync)));
  new MutationObserver(sync).observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  sync();
}

function installLegendHeightTracking() {
  const legend = document.getElementById('legend');
  const app = document.getElementById('app');
  if (!legend || !app || legend.dataset.heightTracking) return;
  legend.dataset.heightTracking = '1';
  const update = () => app.style.setProperty('--map-legend-height', `${Math.max(0, legend.getBoundingClientRect().height || 0)}px`);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(legend);
  new MutationObserver(update).observe(legend, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  update();
}

function installFleetProcurementRefresh(sim) {
  const button = document.getElementById('btn-fleets');
  if (button && !button.dataset.procurementRefresh) {
    button.dataset.procurementRefresh = '1';
    button.addEventListener('click', () => requestAnimationFrame(() => renderNavalProcurement(sim, selectedRegion(sim))));
  }
  const modal = document.getElementById('fleet-modal');
  if (modal && !modal.dataset.procurementObserve) {
    modal.dataset.procurementObserve = '1';
    new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) renderNavalProcurement(sim, selectedRegion(sim));
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
}

export function installMobileGameplayControls(sim = globalThis.__worldsim) {
  if (!sim?.map || !Array.isArray(sim.regions)) return false;
  installStyles();
  ensureInfrastructureModal();
  installFocusActions(sim);
  installLegendIntegration();
  installLegendHeightTracking();
  installFleetProcurementRefresh(sim);
  return true;
}
