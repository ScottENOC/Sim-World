function waitForWorldsim(callback, attempts = 0) {
  if (window.__worldsim?.fleetApi) return callback(window.__worldsim);
  if (attempts < 100) setTimeout(() => waitForWorldsim(callback, attempts + 1), 100);
}

const pct = (v) => `${Math.round(Math.max(0, Math.min(1, Number(v) || 0)) * 100)}%`;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function actorId(region) {
  return region?.governance?.sovereignPolityId || region?.controllingActorId || region?.id || null;
}

function actorName(world, id) {
  const region = world.regions.find((r) => actorId(r) === id);
  return region?.governance?.sovereignPolityName || region?.name || id || 'Unknown';
}

function shipText(fleet) {
  const counts = {};
  for (const ship of fleet.ships || []) {
    const label = ship.classLabel || ship.designId?.replaceAll('_', ' ') || 'ship';
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts).map(([label, count]) => `${count} ${label}${count === 1 ? '' : 's'}`).join(', ') || 'No ships';
}

function visibleActors(world, ownerActorId) {
  const found = new Map();
  for (const region of world.regions) {
    const id = actorId(region);
    if (!id || id === ownerActorId || found.has(id)) continue;
    if (world.fogOfWar?.devMode || world.fogOfWar?.isVisible?.(region)) found.set(id, actorName(world, id));
  }
  return [...found.entries()].sort((a, b) => a[1].localeCompare(b[1]));
}

function possibleDockRegions(world, fleet) {
  return world.regions.filter((region) => region.isCoastal && (world.fogOfWar?.devMode || world.fogOfWar?.isVisible?.(region)));
}

function targetRegionsInSea(world, fleet) {
  const sea = world.seaRegions.find((s) => s.id === fleet.seaRegionId);
  const ids = new Set(sea?.adjacentLand || []);
  return world.regions.filter((region) => ids.has(region.id) && actorId(region) !== fleet.ownerActorId);
}

function addFleetShell() {
  const controls = document.getElementById('hud-controls');
  if (!controls || document.getElementById('btn-fleets')) return;
  const button = document.createElement('button');
  button.id = 'btn-fleets';
  button.className = 'hud-btn';
  button.textContent = 'Fleets';
  button.setAttribute('aria-label', 'Manage fleets');
  controls.prepend(button);

  const modal = document.createElement('div');
  modal.id = 'fleet-modal';
  modal.className = 'modal hidden';
  modal.innerHTML = `
    <div class="modal-card" style="max-width:760px;max-height:88vh;overflow:auto">
      <button id="btn-close-fleets" class="menu-close" aria-label="Close">&times;</button>
      <h2>Fleets</h2>
      <p style="opacity:.8">Ships are persistent. Fleets at sea consume supplies and wear down; home ports repair them, while allied ports can usually sell food and provide shore leave but only minor maintenance.</p>
      <div id="fleet-list"></div>
    </div>`;
  document.body.appendChild(modal);
  button.addEventListener('click', () => {
    modal.classList.remove('hidden');
    renderFleetList();
  });
  modal.querySelector('#btn-close-fleets').addEventListener('click', () => modal.classList.add('hidden'));
}

function renderFleetList() {
  const world = window.__worldsim;
  const list = document.getElementById('fleet-list');
  if (!world || !list) return;
  const fleets = world.fleets.filter((fleet) => fleet.ownerActorId === world.activePlayerPolityId);
  if (!fleets.length) {
    list.innerHTML = '<div class="raid-status">You have no war fleet.</div>';
    return;
  }
  const regionsById = new Map(world.regions.map((r) => [r.id, r]));
  const seasById = new Map(world.seaRegions.map((s) => [s.id, s]));

  list.innerHTML = fleets.map((fleet) => {
    const location = fleet.locationType === 'port'
      ? `In port at ${regionsById.get(fleet.portRegionId)?.name || fleet.portRegionId}`
      : `At sea in ${seasById.get(fleet.seaRegionId)?.name || fleet.seaRegionId}`;
    const deployOptions = fleet.locationType === 'port'
      ? world.seaRegions.map((sea) => `<option value="${esc(sea.id)}">${esc(sea.name)}</option>`).join('') : '';
    const dockOptions = fleet.locationType === 'sea'
      ? possibleDockRegions(world, fleet).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('') : '';
    const targetOptions = fleet.locationType === 'sea'
      ? targetRegionsInSea(world, fleet).map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('') : '';
    const falseFlagOptions = visibleActors(world, fleet.ownerActorId).map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join('');
    return `
      <section class="raid-section" data-fleet-card="${esc(fleet.id)}" style="margin:12px 0;padding:12px;border:1px solid rgba(255,255,255,.16);border-radius:10px">
        <strong>${esc(fleet.name)}</strong><br>
        <div class="raid-status">${esc(shipText(fleet))}<br>${esc(location)}<br>
          Supply ${pct(fleet.supply)} · condition ${pct(fleet.condition)} · fatigue ${pct(fleet.fatigue)} · morale ${pct(fleet.morale)}</div>
        ${fleet.locationType === 'port' ? `
          <label class="control-row">Deploy to sea <select data-deploy-sea>${deployOptions || '<option value="">No adjacent sea</option>'}</select></label>
          <button data-deploy>Deploy</button>` : `
          <label class="control-row">Dock at port <select data-dock-port>${dockOptions}</select></label>
          <button data-dock>Request docking</button>`}
        <label class="control-row">Mission
          <select data-mission>
            ${['patrol','intercept','blockade','port_assault','raid_shipping','escort','hide','return_refit'].map((m) => `<option value="${m}" ${fleet.mission === m ? 'selected' : ''}>${m.replaceAll('_',' ')}</option>`).join('')}
          </select>
        </label>
        ${fleet.locationType === 'sea' ? `<label class="control-row">Mission target (for blockade/port assault)
          <select data-mission-target><option value="">— none —</option>${targetOptions}</select></label>` : ''}
        <label class="control-row">Displayed flag
          <select data-flag-mode>
            <option value="own" ${fleet.flag?.mode === 'own' ? 'selected' : ''}>Own flag</option>
            <option value="none" ${fleet.flag?.mode === 'none' ? 'selected' : ''}>No flag</option>
            <option value="false" ${fleet.flag?.mode === 'false' ? 'selected' : ''}>False flag</option>
          </select>
        </label>
        <label class="control-row">False flag identity
          <select data-false-actor><option value="">— choose known polity —</option>${falseFlagOptions}</select>
        </label>
        <button data-apply-orders>Apply orders</button>
        <div data-fleet-status class="raid-status"></div>
      </section>`;
  }).join('');

  list.querySelectorAll('[data-fleet-card]').forEach((card) => {
    const fleet = fleets.find((f) => f.id === card.dataset.fleetCard);
    const status = card.querySelector('[data-fleet-status]');
    card.querySelector('[data-deploy]')?.addEventListener('click', () => {
      const seaId = card.querySelector('[data-deploy-sea]')?.value;
      const result = world.fleetApi.orderFleetToSea(fleet, seaId, regionsById, seasById, 'patrol');
      status.textContent = result.ordered ? `Fleet sailing via ${result.route.length} sea region(s).` : `Could not sail there (${String(result.reason).replaceAll('_',' ')}).`;
      if (result.ordered) renderFleetList();
    });
    card.querySelector('[data-dock]')?.addEventListener('click', () => {
      const portId = card.querySelector('[data-dock-port]')?.value;
      const result = world.fleetApi.dockFleet(fleet, portId, regionsById, world.agreements);
      status.textContent = result.docked
        ? `Docked (${result.access}). ${result.access === 'ally' ? 'The ally can sell supplies and provide shore leave, but serious repairs remain unavailable.' : ''}`
        : `Docking refused (${String(result.reason).replaceAll('_',' ')}).`;
      if (result.docked) renderFleetList();
    });
    card.querySelector('[data-apply-orders]')?.addEventListener('click', () => {
      const mission = card.querySelector('[data-mission]')?.value;
      const targetId = card.querySelector('[data-mission-target]')?.value || null;
      world.fleetApi.setFleetMission(fleet, mission, { targetId });
      const mode = card.querySelector('[data-flag-mode]')?.value;
      const falseActor = card.querySelector('[data-false-actor]')?.value || null;
      const flagResult = world.fleetApi.setFleetFlag(fleet, mode, falseActor, regionsById);
      status.textContent = flagResult.changed || mode === fleet.flag?.mode
        ? 'Orders updated.'
        : `Mission updated; flag order failed (${String(flagResult.reason).replaceAll('_',' ')}).`;
      renderFleetList();
    });
  });
}

waitForWorldsim(() => addFleetShell());
