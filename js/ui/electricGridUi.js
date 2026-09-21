import {
  CABLE_PROTECTION_POLICIES,
  approveInterconnectorProject,
  disconnectElectricityInterconnector,
  electricityInterconnectorSummary,
  ensureGridInterconnectionState,
  gridConnectionAssessment,
  proposeElectricityInterconnector,
  reconnectElectricityInterconnector,
  repairElectricityInterconnector,
  respondToCableIncident,
  setGridConnectionPolicy,
  setSubseaCableProtectionPolicy,
} from '../economy/electricityInterconnectors.js?v=20260921-grid-links1';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const polityId = (region) => region?.governance?.sovereignPolityId || region?.polityId || region?.controllingActorId || region?.id || null;
const fmt = (value, digits = 0) => Number.isFinite(Number(value)) ? Number(value).toFixed(digits) : '0';

function installStyles() {
  if (document.getElementById('electric-grid-ui-styles')) return;
  const style = document.createElement('style');
  style.id = 'electric-grid-ui-styles';
  style.textContent = `
    .grid-ui { margin-top:12px; padding-top:10px; border-top:1px solid rgba(192,138,78,.35); }
    .grid-ui h3 { margin:0 0 7px; font-size:14px; }
    .grid-ui h4 { margin:10px 0 5px; font-size:12px; color:var(--parchment); }
    .grid-ui .grid-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:5px 8px; font-size:11px; }
    .grid-ui .grid-summary div,.grid-ui .grid-card { padding:6px 7px; border:1px solid rgba(192,138,78,.24); border-radius:8px; background:rgba(19,24,34,.42); }
    .grid-ui .grid-label { color:var(--parchment-dim); font-size:9px; text-transform:uppercase; letter-spacing:.04em; display:block; }
    .grid-ui .grid-controls { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
    .grid-ui select,.grid-ui input,.grid-ui button { min-height:36px; max-width:100%; font:inherit; }
    .grid-ui select,.grid-ui input { width:100%; box-sizing:border-box; background:rgba(15,19,27,.8); color:var(--parchment); border:1px solid var(--bronze-dim); border-radius:7px; padding:6px; }
    .grid-ui button { border:1px solid var(--bronze-dim); border-radius:7px; background:rgba(59,53,43,.76); color:var(--parchment); padding:6px 8px; }
    .grid-ui button:disabled { opacity:.42; }
    .grid-ui .grid-wide { grid-column:1/-1; }
    .grid-ui .grid-muted { color:var(--parchment-dim); font-size:10px; }
    .grid-ui .grid-warning { color:#e1b866; font-size:10px; }
    .grid-ui .grid-danger { color:#e18873; font-size:10px; }
    .grid-ui .grid-actions { display:flex; gap:5px; flex-wrap:wrap; margin-top:6px; }
    .grid-ui .grid-actions button { min-height:32px; flex:1 1 auto; }
    @media (max-width:430px) { .grid-ui .grid-controls { grid-template-columns:1fr; } .grid-ui .grid-wide { grid-column:auto; } }
  `;
  document.head.appendChild(style);
}

function connectedPolities(region, regionsById) {
  const result = new Set();
  for (const link of ensureGridInterconnectionState(region).links || []) {
    if (link.status !== 'active') continue;
    const otherId = link.fromRegionId === region.id ? link.toRegionId : link.fromRegionId;
    const other = regionsById.get(otherId);
    if (other) result.add(polityId(other));
  }
  result.delete(null);
  return [...result];
}

function candidateRegions(region, regions) {
  const neighbors = new Set(region.neighbors || []);
  const seas = new Set(region.adjacentSeaIds || []);
  return regions.filter((other) => {
    if (!other || other.id === region.id) return false;
    const land = neighbors.has(other.id) || (other.neighbors || []).includes(region.id);
    const sea = (other.adjacentSeaIds || []).some((id) => seas.has(id));
    return land || sea;
  });
}

function linkOther(link, region, byId) {
  return byId.get(link.fromRegionId === region.id ? link.toRegionId : link.fromRegionId);
}

function responseLabel(response) {
  return ({
    repair_cable:'Repair cable', increase_monitoring:'Increase monitoring', warn_ship:'Warn vessel',
    escort_away:'Escort away', detain_ship:'Detain vessel', ignore:'Ignore', establish_exclusion_zone:'Exclusion zone',
  })[response] || response.replaceAll('_', ' ');
}

function renderSection(root, region, regions, playerPolityId, onRefresh) {
  const byId = new Map(regions.map((r) => [r.id, r]));
  const state = ensureGridInterconnectionState(region);
  const summary = electricityInterconnectorSummary(region);
  const ownRegion = Boolean(playerPolityId && polityId(region) === playerPolityId);
  const connected = connectedPolities(region, byId);
  const incoming = regions.flatMap((origin) => (ensureGridInterconnectionState(origin).projects || [])
    .filter((project) => project.toRegionId === region.id && project.status === 'awaiting_permission')
    .map((project) => ({ origin, project })));
  const incidents = (state.incidents || []).filter((incident) => !incident.response).slice(-5).reverse();

  root.innerHTML = `
    <div class="grid-ui">
      <h3>Electric grid & cables</h3>
      <div class="grid-summary">
        <div><span class="grid-label">Interconnectors</span>${summary.activeLinks} active</div>
        <div><span class="grid-label">Power capacity</span>${fmt(summary.powerCapacity)} MW-equivalent</div>
        <div><span class="grid-label">Imports / exports</span>${fmt(region.electricity?.imports,1)} / ${fmt(region.electricity?.exports,1)}</div>
        <div><span class="grid-label">Cable losses</span>${fmt(region.electricity?.interconnectorLosses,1)}</div>
      </div>
      ${connected.length ? `<div class="grid-muted" style="margin-top:5px">Directly connected polities: ${connected.map(esc).join(', ')}</div>` : ''}
      ${!ownRegion ? '<div class="grid-muted" style="margin-top:7px">Foreign infrastructure is visible here, but only your own government can change policy or authorise projects.</div>' : ''}
      ${ownRegion ? `
        <h4>Connection policy</h4>
        <div class="grid-controls">
          <label><span class="grid-label">Foreign grids</span><select data-grid-action="foreign-policy"><option value="allow" ${state.policy.allowForeignConnections?'selected':''}>Allow requests</option><option value="deny" ${!state.policy.allowForeignConnections?'selected':''}>Refuse requests</option></select></label>
          <label><span class="grid-label">Subsea protection</span><select data-grid-action="protection">${Object.keys(CABLE_PROTECTION_POLICIES).map((id)=>`<option value="${id}" ${state.policy.protectionPolicy===id?'selected':''}>${esc(id.replaceAll('_',' '))}</option>`).join('')}</select></label>
          <label class="grid-wide"><span class="grid-label">Avoid indirect connection to polity IDs</span><input data-grid-action="avoid" value="${esc((state.policy.avoidIndirectPolityIds||[]).join(', '))}" placeholder="e.g. polity-a, polity-b"></label>
        </div>
        <h4>Build an interconnector</h4>
        <div class="grid-controls">
          <label class="grid-wide"><span class="grid-label">Target region</span><select data-grid-new="target"><option value="">Choose adjacent/coastal region…</option>${candidateRegions(region,regions).map((r)=>`<option value="${esc(r.id)}">${esc(r.name)} · ${esc(polityId(r))}</option>`).join('')}</select></label>
          <label><span class="grid-label">Power capacity</span><input data-grid-new="power" type="number" min="0" step="100" value="2500"></label>
          <label><span class="grid-label">Comms capacity</span><input data-grid-new="comms" type="number" min="0" step="50" value="0"></label>
          <label><span class="grid-label">Financing</span><select data-grid-new="owner"><option value="government">Government</option><option value="private">Private</option></select></label>
          <button data-grid-action="propose">Propose / build</button>
          <div class="grid-wide grid-muted" data-grid-preview>Choose a target to see permission and network exposure.</div>
        </div>
      ` : ''}
      ${ownRegion && incoming.length ? `<h4>Incoming foreign requests</h4>${incoming.map(({origin,project})=>`<div class="grid-card" data-incoming="${esc(project.id)}"><strong>${esc(origin.name)}</strong> → ${esc(region.name)} · ${fmt(project.powerCapacity)} power${project.undersea?' · subsea':''}<div class="grid-muted">Their connected network exposes: ${esc((project.permissionAssessment?.exposedPolityIds||[]).join(', ')||'none known')}</div><div class="grid-actions"><button data-approve="${esc(project.id)}" data-origin="${esc(origin.id)}">Approve</button><button data-reject="${esc(project.id)}" data-origin="${esc(origin.id)}">Reject</button></div></div>`).join('')}` : ''}
      ${state.links.length ? `<h4>Existing links</h4>${state.links.map((link)=>{const other=linkOther(link,region,byId);return `<div class="grid-card"><strong>${esc(other?.name||'Unknown endpoint')}</strong> · ${esc(link.status)}${link.undersea?' · subsea':''}<div class="grid-muted">${fmt(link.powerCapacity)} power · ${fmt(link.communicationsCapacity)} communications · ${fmt((link.condition??1)*100)}% condition</div>${link.lastFlow?.sent?`<div class="grid-muted">Last flow: ${fmt(link.lastFlow.sent,1)} sent → ${fmt(link.lastFlow.delivered,1)} delivered</div>`:''}${link.disconnectReason?`<div class="grid-warning">Disconnected: ${esc(link.disconnectReason)}${link.unwantedPolityIds?.length?` (${esc(link.unwantedPolityIds.join(', '))})`:''}</div>`:''}${ownRegion?`<div class="grid-actions">${link.status==='disconnected'?`<button data-reconnect="${esc(link.id)}">Reconnect</button>`:`<button data-disconnect="${esc(link.id)}">Disconnect</button>`}${(link.condition??1)<.999?`<button data-repair="${esc(link.id)}">Repair</button>`:''}</div>`:''}</div>`;}).join('')}` : ''}
      ${incidents.length ? `<h4>Cable incidents</h4>${incidents.map((incident)=>`<div class="grid-card"><strong>${esc(incident.cause?.replaceAll('_',' ')||'Cable incident')}</strong><div class="${incident.observed?'grid-warning':'grid-muted'}">${incident.observed?'Observed':'Cause not directly observed'} · damage ${fmt((incident.damage||0)*100)}%</div>${ownRegion&&incident.responseOptions?.length?`<div class="grid-actions">${incident.responseOptions.map((response)=>`<button data-incident="${esc(incident.id)}" data-response="${esc(response)}">${esc(responseLabel(response))}</button>`).join('')}</div>`:''}</div>`).join('')}` : ''}
    </div>`;

  if (!ownRegion) return;
  const preview = root.querySelector('[data-grid-preview]');
  const target = root.querySelector('[data-grid-new="target"]');
  const updatePreview = () => {
    const other = byId.get(target?.value);
    if (!other || !preview) return;
    const assessment = gridConnectionAssessment(region, other, regions);
    preview.className = `grid-wide ${assessment.allowed ? 'grid-muted' : 'grid-warning'}`;
    preview.textContent = assessment.allowed
      ? `Permitted. Network exposure: ${(assessment.exposedPolityIds||[]).join(', ') || 'domestic only'}.`
      : `Not currently permitted: ${assessment.reason.replaceAll('_',' ')}${assessment.unwantedPolityIds?.length ? ` (${assessment.unwantedPolityIds.join(', ')})` : ''}.`;
  };
  target?.addEventListener('change', updatePreview);

  root.querySelector('[data-grid-action="foreign-policy"]')?.addEventListener('change', (event) => {
    setGridConnectionPolicy(region, { allowForeignConnections: event.target.value === 'allow' }); onRefresh();
  });
  root.querySelector('[data-grid-action="protection"]')?.addEventListener('change', (event) => {
    setSubseaCableProtectionPolicy(region, event.target.value); onRefresh();
  });
  root.querySelector('[data-grid-action="avoid"]')?.addEventListener('change', (event) => {
    setGridConnectionPolicy(region, { avoidIndirectPolityIds: event.target.value.split(',').map((s)=>s.trim()).filter(Boolean) }); onRefresh();
  });
  root.querySelector('[data-grid-action="propose"]')?.addEventListener('click', () => {
    const other = byId.get(target?.value); if (!other) return;
    const powerCapacity = Number(root.querySelector('[data-grid-new="power"]')?.value) || 0;
    const communicationsCapacity = Number(root.querySelector('[data-grid-new="comms"]')?.value) || 0;
    const ownerType = root.querySelector('[data-grid-new="owner"]')?.value || 'government';
    proposeElectricityInterconnector(region, other, regions, { powerCapacity, communicationsCapacity, ownerType });
    onRefresh();
  });
  for (const button of root.querySelectorAll('[data-approve],[data-reject]')) button.addEventListener('click', () => {
    const origin = byId.get(button.dataset.origin); if (!origin) return;
    approveInterconnectorProject(origin, button.dataset.approve || button.dataset.reject, Boolean(button.dataset.approve)); onRefresh();
  });
  for (const button of root.querySelectorAll('[data-disconnect]')) button.addEventListener('click', () => { disconnectElectricityInterconnector(regions, button.dataset.disconnect, 'player_policy_disconnect'); onRefresh(); });
  for (const button of root.querySelectorAll('[data-reconnect]')) button.addEventListener('click', () => { reconnectElectricityInterconnector(regions, button.dataset.reconnect); onRefresh(); });
  for (const button of root.querySelectorAll('[data-repair]')) button.addEventListener('click', () => { repairElectricityInterconnector(regions, button.dataset.repair, .25); onRefresh(); });
  for (const button of root.querySelectorAll('[data-incident]')) button.addEventListener('click', () => { respondToCableIncident(region, button.dataset.incident, button.dataset.response); if (button.dataset.response === 'repair_cable') repairElectricityInterconnector(regions, state.incidents.find((i)=>i.id===button.dataset.incident)?.linkId, .35); onRefresh(); });
}

export function renderElectricGridControls(region, regions, playerPolityId) {
  installStyles();
  const controls = document.getElementById('region-controls');
  if (!controls || !region || !Array.isArray(regions)) return false;
  let root = controls.querySelector('#electric-grid-controls');
  if (!root) { root = document.createElement('section'); root.id = 'electric-grid-controls'; controls.appendChild(root); }
  const refresh = () => renderSection(root, region, regions, playerPolityId, refresh);
  refresh();
  return true;
}
