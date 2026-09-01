import { Clock } from './core/clock.js';
import { EventBus } from './core/eventBus.js';
import { loadWorld } from './world/region.js';
import { loadSeaWorld, linkSeaAdjacency } from './world/seaRegion.js';
import { seedCensus, densityPerKm2 } from './society/census.js';
import { tickEconomy } from './economy/labor.js';
import { tickTrade } from './economy/trade.js';
import { tickDemographics } from './society/demographics.js';
import { tickBanditry } from './military/banditry.js';
import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable } from './military/raiding.js';
import { tickNationAi } from './ai/nationAi.js';
import { skillMultiplier, LEARNABLE_ACTIVITIES } from './technology/learningByDoing.js';
import { MapRenderer } from './ui/mapRenderer.js';
import { FogOfWar } from './core/fogOfWar.js';

const START_YEAR = -1200; // Bronze Age start, mid-collapse-era — tune later
const LAYERS = {
  density: {
    valueFn: (r) => densityPerKm2(r),
    label: 'Population / km²',
    format: (v) => v.toFixed(1),
  },
  stability: {
    valueFn: (r) => r.stability,
    label: 'Stability',
    format: (v) => v.toFixed(2),
    colorLow: '#a4453a',
    colorHigh: '#3a4a3e',
  },
  wealth: {
    valueFn: (r) => r.wallet,
    label: 'Populace wealth',
    format: (v) => v.toFixed(0),
  },
  political: {
    type: 'categorical',
    valueFn: (r) => r.controllingActorId,
    label: 'Controlled by',
  },
};

async function main() {
  const bus = new EventBus();
  const clock = new Clock();
  const regions = await loadWorld();
  seedCensus(regions);
  const seaRegions = await loadSeaWorld();
  linkSeaAdjacency(regions, seaRegions);
  const toolTypes = await (await fetch('data/world/toolTypes.json')).json();

  console.log(
    `Loaded ${regions.length} regions:`,
    regions.map((r) => `${r.name} (pop ${r.population.toLocaleString()})`).join(', ')
  );
  console.log(`Loaded ${seaRegions.length} sea regions:`, seaRegions.map((s) => s.name).join(', '));

  const fogOfWar = new FogOfWar(regions);
  const canvas = document.getElementById('map-canvas');

  let selectedRegion = null;
  let playerRegionId = null;
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const seaRegionsById = new Map(seaRegions.map((s) => [s.id, s]));
  let activeRaids = [];
  const eventQueue = [];

  const map = new MapRenderer(canvas, regions, {
    seaRegions,
    isRegionVisible: (region) => fogOfWar.isVisible(region),
    onSelect: (region) => {
      selectedRegion = region;
      renderRegionControls(region, regions, clock, activeRaids, playerRegionId, fogOfWar);
      updateRegionStats(region, seaRegionsById, fogOfWar, regions);
      document.getElementById('region-sheet').classList.remove('hidden');
    },
  });

  wireLayerToggle(map);
  map.setLayer(LAYERS.density);
  showLegend(map);

  document.getElementById('btn-close-sheet').addEventListener('click', () => {
    document.getElementById('region-sheet').classList.add('hidden');
    selectedRegion = null;
    map.selectedId = null;
    map.draw();
  });

  wireHud(clock);
  wireMenu({
    fogOfWar,
    map,
    getSelectedRegion: () => selectedRegion,
    clearSelection: () => {
      selectedRegion = null;
      map.selectedId = null;
    },
  });

  clock.onTick(() => {
    tickEconomy(regions, seaRegions, toolTypes);
    tickTrade(regions);
    tickDemographics(regions);
    tickBanditry(regions, toolTypes);
    tickNationAi(regions, playerRegionId, activeRaids, clock.tickIndex, toolTypes, Math.random);

    const { remaining, events } = tickRaids(activeRaids, regionsById, clock.tickIndex, toolTypes, Math.random);
    activeRaids = remaining;

    if (events.length > 0) {
      clock.requestAutoPause();
      eventQueue.push(...events);
      showNextEvent(clock, eventQueue);
    }

    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
    map.draw();

    if (selectedRegion && fogOfWar.isVisible(selectedRegion)) {
      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions);
    }
  });

  document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);

  showRegionPicker(regions, (chosen) => {
    playerRegionId = chosen.id;
    fogOfWar.setPlayerRegion(chosen.id);

    document.getElementById('picker-modal').classList.add('hidden');
    selectedRegion = chosen;
    map.selectedId = chosen.id;

    renderRegionControls(chosen, regions, clock, activeRaids, playerRegionId, fogOfWar);
    updateRegionStats(chosen, seaRegionsById, fogOfWar, regions);
    document.getElementById('region-sheet').classList.remove('hidden');

    map.refreshLayer();
    clock.start();
  });

  window.__worldsim = {
    bus,
    clock,
    regions,
    seaRegions,
    activeRaids,
    map,
    fogOfWar,
    setDevMode: (enabled) => setDevMode(enabled),
  };

  function setDevMode(enabled) {
    fogOfWar.setDevMode(enabled);

    const toggle = document.getElementById('toggle-dev-mode');
    if (toggle) toggle.checked = fogOfWar.devMode;

    // If the player was inspecting something that is no longer visible,
    // close the sheet rather than leaving hidden information on screen.
    if (selectedRegion && !fogOfWar.isVisible(selectedRegion)) {
      document.getElementById('region-sheet').classList.add('hidden');
      selectedRegion = null;
      map.selectedId = null;
    }

    map.refreshLayer();
    if (map.layer) showLegend(map);
  }
}

function showRegionPicker(regions, onChosen) {
  document.getElementById('picker-list').innerHTML = regions
    .map((r) => `
      <button class="picker-option" data-id="${r.id}">
        <strong>${r.name}</strong>
        <span>pop ${r.population.toLocaleString()} &middot; land quality ${r.landQuality.toFixed(2)}&times;</span>
      </button>
    `)
    .join('');

  document.querySelectorAll('.picker-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const region = regions.find((r) => r.id === btn.dataset.id);
      if (region) onChosen(region);
    });
  });
}

function wireLayerToggle(map) {
  document.querySelectorAll('.layer-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const alreadyActive = btn.classList.contains('active');
      document.querySelectorAll('.layer-btn').forEach((b) => b.classList.remove('active'));

      if (alreadyActive) {
        map.clearLayer();
        document.getElementById('legend').classList.add('hidden');
      } else {
        map.setLayer(LAYERS[btn.dataset.layer]);
        btn.classList.add('active');
        showLegend(map);
      }
    });
  });
}

function wireHud(clock) {
  const pauseBtn = document.getElementById('btn-pause');

  pauseBtn.addEventListener('click', () => {
    clock.togglePause();
    pauseBtn.textContent = clock.speed === 0 ? '►' : 'II';
  });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed);
      clock.setSpeed(speed);
      document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      pauseBtn.textContent = 'II';
    });
  });
}

function wireMenu({ fogOfWar, map, getSelectedRegion, clearSelection }) {
  const menuModal = document.getElementById('menu-modal');
  const menuButton = document.getElementById('btn-menu');
  const closeButton = document.getElementById('btn-close-menu');
  const toggle = document.getElementById('toggle-dev-mode');

  const closeMenu = () => menuModal.classList.add('hidden');

  menuButton.addEventListener('click', () => {
    toggle.checked = fogOfWar.devMode;
    menuModal.classList.remove('hidden');
  });

  closeButton.addEventListener('click', closeMenu);

  menuModal.addEventListener('click', (event) => {
    if (event.target === menuModal) closeMenu();
  });

  toggle.addEventListener('change', () => {
    fogOfWar.setDevMode(toggle.checked);

    const selected = getSelectedRegion();
    if (selected && !fogOfWar.isVisible(selected)) {
      document.getElementById('region-sheet').classList.add('hidden');
      clearSelection();
      map.selectedId = null;
    }

    map.refreshLayer();
    if (map.layer) {
      const info = map.getLegendInfo();
      if (info) updateLegendFromInfo(info);
    }
  });
}

function updateLegendFromInfo(info) {
  document.getElementById('legend-label').textContent = info.label;

  const gradientEl = document.getElementById('legend-gradient');
  const categoricalEl = document.getElementById('legend-categorical');

  if (info.type === 'categorical') {
    gradientEl.classList.add('hidden');
    categoricalEl.classList.remove('hidden');
    categoricalEl.innerHTML = info.entries
      .map((e) => `<div class="legend-swatch-row"><span class="legend-swatch" style="background:${e.color}"></span>${e.key}</div>`)
      .join('');
  } else {
    categoricalEl.classList.add('hidden');
    gradientEl.classList.remove('hidden');
    document.getElementById('legend-min').textContent = info.min;
    document.getElementById('legend-max').textContent = info.max;
  }

  document.getElementById('legend').classList.remove('hidden');
}

function showLegend(map) {
  const info = map.getLegendInfo();
  if (!info) return;
  updateLegendFromInfo(info);
}

// Built once when the player taps a region — never rebuilt on the periodic
// refresh below, or every keystroke in the input would get wiped mid-edit.
function renderRegionControls(region, regions, clock, activeRaids, playerRegionId, fogOfWar) {
  document.getElementById('region-name').textContent = region.name;

  if (region.controllingActorId !== playerRegionId) {
    const rulerName = fogOfWar.devMode
      ? (regions.find((r) => r.id === region.controllingActorId)?.name || region.controllingActorId)
      : 'another ruler';

    document.getElementById('region-controls').innerHTML = `
      <div class="raid-status">Ruled by ${rulerName} — you can't issue orders here. Annexing it (conquest) would change that.</div>
    `;
    return;
  }

  const targets = regions
    .filter((r) => r.id !== region.id)
    .filter((r) => fogOfWar.isVisible(r))
    .map((r) => ({ region: r, ...canRaid(region, r) }))
    .filter((t) => t.possible);

  const inFlight = activeRaids.filter((r) => r.attackerId === region.id && !r.completed);
  const inFlightLine = inFlight.length
    ? `<div class="raid-status">${inFlight.length} raid(s) currently away (${inFlight.reduce((s, r) => s + r.personnel, 0).toLocaleString()} soldiers)</div>`
    : '';

  document.getElementById('region-controls').innerHTML = `
    <label class="control-row">Target army size
      <input type="number" min="0" step="100" id="input-army" value="${Math.round(region.targetArmySize)}">
    </label>
    <label class="control-row">Target navy size (boats)
      <input type="number" min="0" step="1" id="input-navy" value="${Math.round(region.targetNavySize)}" ${region.isCoastal ? '' : 'disabled title="not a coastal region"'}>
    </label>
    <div class="raid-section">
      ${targets.length === 0
        ? '<div class="raid-status">No visible reachable raid targets (need a land border, or a shared sea plus navy capacity)</div>'
        : `
          <label class="control-row">Raid target
            <select id="raid-target">
              <option value="">— select —</option>
              ${targets.map((t) => `<option value="${t.region.id}" data-sea="${t.viaSea}">${t.region.name}${t.viaSea ? ' (sea)' : ''}</option>`).join('')}
            </select>
          </label>
          <label class="control-row">Send <span id="raid-fraction-label">50%</span> of home army
            <input type="range" id="raid-fraction" min="0" max="100" value="50">
          </label>
          <div id="raid-info" class="raid-status"></div>
          <button id="btn-raid-launch" disabled>Launch Raid</button>
        `}
      ${inFlightLine}
    </div>
  `;

  document.getElementById('input-army').addEventListener('change', (e) => {
    region.targetArmySize = Math.max(0, Number(e.target.value) || 0);
  });

  document.getElementById('input-navy').addEventListener('change', (e) => {
    region.targetNavySize = Math.max(0, Number(e.target.value) || 0);
  });

  if (targets.length === 0) return;

  const targetSelect = document.getElementById('raid-target');
  const fractionSlider = document.getElementById('raid-fraction');
  const launchBtn = document.getElementById('btn-raid-launch');

  const updateRaidInfo = () => {
    const fraction = Number(fractionSlider.value) / 100;
    document.getElementById('raid-fraction-label').textContent = Math.round(fraction * 100) + '%';

    const targetId = targetSelect.value;
    if (!targetId) {
      document.getElementById('raid-info').textContent = '';
      launchBtn.disabled = true;
      return;
    }

    const target = targets.find((t) => t.region.id === targetId);
    let requested = Math.floor(region.army.personnel * fraction);
    let capNote = '';

    if (target.viaSea) {
      const maxSea = maxSeaRaidersAvailable(region);
      if (requested > maxSea) {
        requested = maxSea;
        capNote = ` (capped by navy capacity — ${region.navy.boats.toFixed(0)} boats)`;
      }
    }

    document.getElementById('raid-info').textContent =
      `Sending ${requested.toLocaleString()} of ${Math.round(region.army.personnel).toLocaleString()} home soldiers${capNote}`;
    launchBtn.disabled = requested <= 0;
  };

  targetSelect.addEventListener('change', updateRaidInfo);
  fractionSlider.addEventListener('input', updateRaidInfo);
  updateRaidInfo();

  launchBtn.addEventListener('click', () => {
    const target = targets.find((t) => t.region.id === targetSelect.value);
    if (!target) return;

    const fraction = Number(fractionSlider.value) / 100;
    const requested = Math.floor(region.army.personnel * fraction);
    const raid = launchRaid(region, target.region, requested, target.viaSea, clock.tickIndex);

    if (raid) {
      activeRaids.push(raid);
      renderRegionControls(region, regions, clock, activeRaids, playerRegionId, fogOfWar);
    }
  });
}

function showNextEvent(clock, eventQueue) {
  if (eventQueue.length === 0) return;

  const event = eventQueue.shift();
  const { attackerName, defenderName, outcome, raid } = event;
  const won = outcome.attackerRatio > 0.5;

  const lootText = Object.entries(outcome.looted)
    .map(([k, v]) => `${v.toFixed(0)} ${k}`)
    .join(', ') || 'nothing of note';

  document.getElementById('event-title').textContent = `Raid: ${attackerName} vs ${defenderName}`;
  document.getElementById('event-body').innerHTML = `
    ${attackerName}'s raiders (${raid.personnel.toLocaleString()} strong) reached ${defenderName}.
    ${won ? 'The raid succeeded.' : 'The defenders held them off.'}<br><br>
    Attacker losses: ${outcome.attackerLosses.toLocaleString()}<br>
    Defender losses: ${outcome.defenderLosses.toLocaleString()}<br>
    Looted: ${lootText}${outcome.walletStolen > 0.5 ? `, ${outcome.walletStolen.toFixed(0)} wealth` : ''}<br>
    ${defenderName}'s stability fell ${(outcome.stabilityLoss * 100).toFixed(0)} points.
  `;

  document.getElementById('event-options').innerHTML = '<button id="btn-event-continue">Continue</button>';
  document.getElementById('event-modal').classList.remove('hidden');

  document.getElementById('btn-event-continue').addEventListener('click', () => {
    document.getElementById('event-modal').classList.add('hidden');

    if (eventQueue.length > 0) {
      showNextEvent(clock, eventQueue);
    } else {
      clock.releaseAutoPause();
    }
  });
}

const ACTIVITY_LABELS = {
  farming: 'Farming',
  gathering: 'Gathering',
  shoreFishing: 'Shore fishing',
  boatFishing: 'Boat fishing',
  lumberjack: 'Lumberjack',
  mining: 'Mining',
  smithing: 'Smithing',
  boatmaking: 'Boat-making',
};

function buildResourcesSection(region, seaRegionsById) {
  const depositLines = ['copper', 'tin', 'gold', 'stone']
    .map((key) => {
      const dep = region.deposits[key];
      if (!dep) return '';

      const tierText = dep.tiers
        .map((t) => {
          const locked = t.requiredTechId && !region.unlockedTechIds.has(t.requiredTechId);
          const pct = t.initialStock > 0 ? Math.round((100 * t.remainingStock) / t.initialStock) : 0;
          return `${t.label} ${pct}%${locked ? ' (locked)' : ''}`;
        })
        .join(', ');

      return `<div>${key}: ${tierText}</div>`;
    })
    .join('');

  const forestPct = region.forest.K > 0
    ? Math.round((100 * region.forest.currentStock) / region.forest.K)
    : 0;

  const seaLines = region.adjacentSeaIds
    .map((id) => {
      const sea = seaRegionsById.get(id);
      if (!sea) return '';

      const pct = sea.fish.K > 0
        ? Math.round((100 * sea.fish.currentStock) / sea.fish.K)
        : 0;

      return `<div>${sea.name}: fish stock ${pct}%</div>`;
    })
    .join('');

  return `
    <div>Land quality: ${region.landQuality.toFixed(2)}&times; baseline</div>
    <div>Forest: ${forestPct}% of capacity</div>
    ${depositLines}
    ${seaLines || '<div>No adjacent sea</div>'}
  `;
}

function buildReportSection(region) {
  const r = region.report;
  if (!r || Object.keys(r).length === 0) return '<div>Not yet ticked</div>';

  const lines = [];

  for (const [key, data] of Object.entries(r)) {
    if (!data || data.workers === 0) continue;

    const outputs = Object.entries(data)
      .filter(([k]) => k !== 'workers' && k !== 'seaName')
      .filter(([, v]) => typeof v === 'number' && v > 0.05)
      .map(([k, v]) => `${v.toFixed(k === 'bronze' ? 1 : 0)} ${k}`)
      .join(', ');

    lines.push(
      `<div>${ACTIVITY_LABELS[key] || key}: ${data.workers.toLocaleString()} workers &rarr; ${outputs || 'nothing yet'}</div>`
    );
  }

  return lines.join('') || '<div>Nobody produced anything of note this week</div>';
}

// Refreshed every tick while the sheet is open — read-only, safe to
// innerHTML-replace freely. <details> open/closed state is preserved
// manually across the refresh.
function updateRegionStats(region, seaRegionsById, fogOfWar, regions) {
  const density = densityPerKm2(region).toFixed(1);
  const culture = region.cultureGroups[0];
  const occ = region.occupations;

  const occLine = occ.farmer === undefined
    ? 'not yet ticked'
    : `farmers ${occ.farmer.toLocaleString()} &middot; gatherers ${(occ.gatherer || 0).toLocaleString()} &middot; shore fishers ${occ.shoreFisher || 0} &middot; boat fishers ${occ.boatFisher || 0} &middot; lumberjacks ${occ.lumberjack} &middot; boatmakers ${occ.boatmaker || 0} &middot; miners ${occ.miner} &middot; smiths ${occ.smith} &middot; traders ${occ.trader || 0} &middot; general ${occ.general.toLocaleString()}`;

  const d = region.demographics;
  const demoLine = `${Math.round(d.children).toLocaleString()} children &middot; ${Math.round(d.workingAge).toLocaleString()} working-age &middot; ${Math.round(d.elderly).toLocaleString()} elderly`;
  const banditLine = region.banditPopulation > 10
    ? `${Math.round(region.banditPopulation).toLocaleString()} people turned to banditry`
    : 'none';

  const stock = region.stockpile;
  const stockLine = Object.keys(stock).length
    ? Object.entries(stock)
        .filter(([, v]) => v > 0.05)
        .map(([k, v]) => `${k} ${v.toFixed(k === 'bronze' ? 1 : 0)}`)
        .join(' &middot; ') || 'none yet'
    : 'none yet';

  const ploughs = region.equipment.farmer?.bronze_plough || 0;
  const toolLine = occ.farmer
    ? `${ploughs.toLocaleString()} / ${occ.farmer.toLocaleString()} farmers have a bronze plough (${((Math.min(ploughs, occ.farmer) / occ.farmer) * 100).toFixed(0)}%)`
    : 'n/a';

  const armyEquipped = region.equipment.soldier?.bronze_weapons || 0;
  const militaryLine = `${occ.soldier || 0} soldiers (${Math.min(armyEquipped, occ.soldier || 0).toFixed(0)} equipped) &middot; ${occ.sailor || 0} sailors &middot; ${Math.round(region.navy.boats)} navy boats`;

  const fishingLine = region.adjacentSeaIds.length
    ? `${Math.round(region.fishingBoats)} fishing boats &middot; fishes ${region.adjacentSeaIds.join(', ')}`
    : 'landlocked — no fishing';

  const skillLine = LEARNABLE_ACTIVITIES
    .map((activity) => `${activity} +${((skillMultiplier(region, activity) - 1) * 100).toFixed(0)}%`)
    .join(' &middot; ');

  const visibleNeighbours = region.neighbors
    .map((id) => regions.find((r) => r.id === id))
    .filter(Boolean)
    .filter((neighbour) => fogOfWar.devMode || fogOfWar.isVisible(neighbour))
    .map((neighbour) => neighbour.name);

  const neighbourLine = visibleNeighbours.length
    ? visibleNeighbours.join(', ')
    : 'none known';

  const detailsOpen = {};
  document.querySelectorAll('#region-details details').forEach((d) => {
    detailsOpen[d.id] = d.open;
  });

  document.getElementById('region-details').innerHTML = `
    <div>Population: ${region.population.toLocaleString()} (${density}/km&sup2;)</div>
    <div>Age bands: ${demoLine}</div>
    <div>Stability: ${(region.stability * 100).toFixed(0)}% &middot; Safety: ${(region.safetyRating * 100).toFixed(0)}%</div>
    <div>Banditry: ${banditLine}</div>
    <div>Military: ${militaryLine}</div>
    <div>Fishing: ${fishingLine}</div>
    <div>Skill (learning by doing): ${skillLine}</div>
    <div>Wealth: ${region.wallet.toFixed(0)} populace &middot; ${region.treasury.toFixed(0)} treasury</div>
    <div>Tools: ${toolLine}</div>
    <div>Culture: ${culture.cultureId} &middot; identity strength ${(culture.identityStrength * 100).toFixed(0)}%</div>
    <div>Neighbours: ${neighbourLine}</div>
    <div>Controlled by: ${fogOfWar.devMode ? region.controllingActorId : (region.controllingActorId === region.id ? region.name : 'another ruler')}</div>
    <details id="details-resources"><summary>Resources</summary>${buildResourcesSection(region, seaRegionsById)}</details>
    <details id="details-report"><summary>Economy report (this week)</summary>${buildReportSection(region)}</details>
    <details id="details-occupations"><summary>Working as</summary><div>${occLine}</div></details>
    <details id="details-stockpile"><summary>Stockpile</summary><div>${stockLine}</div></details>
  `;

  Object.entries(detailsOpen).forEach(([id, open]) => {
    const el = document.getElementById(id);
    if (el) el.open = open;
  });
}

main().catch((err) => {
  console.error('Boot failed:', err);
  document.body.innerHTML = `<pre style="color:#e8e1cf;padding:20px;">Failed to load: ${err.message}\n\nIf you opened this file directly (file://), that's why — fetch() of local JSON needs a real server. Run: python3 -m http.server, then open localhost.</pre>`;
});
