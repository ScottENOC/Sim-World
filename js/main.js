import { Clock } from './core/clock.js?v=20260904-weather1';
import { EventBus } from './core/eventBus.js?v=20260904-weather1';
import { loadWorld } from './world/region.js?v=20260904-diplomacy1';
import { loadSeaWorld, linkSeaAdjacency } from './world/seaRegion.js?v=20260904-weather1';
import { seedCensus, densityPerKm2 } from './society/census.js?v=20260904-weather1';
import { tickEconomy } from './economy/labor.js?v=20260904-weather1';
import { tickTrade } from './economy/trade.js?v=20260904-diplomacy1';
import { tickStateFinance } from './economy/stateFinance.js?v=20260904-weather1';
import { tickDemographics } from './society/demographics.js?v=20260904-weather1';
import { tickBanditry } from './military/banditry.js?v=20260904-diplomacy1';
import { canRaid, launchRaid, tickRaids, maxSeaRaidersAvailable } from './military/raiding.js?v=20260904-diplomacy1';
import { tickNationAi } from './ai/nationAi.js?v=20260904-diplomacy1';
import { skillMultiplier, LEARNABLE_ACTIVITIES } from './technology/learningByDoing.js?v=20260904-weather1';
import { tickBreakthroughs, IRON_SMELTING_TECH_ID, ADVANCED_BOATBUILDING_TECH_ID } from './technology/breakthroughs.js?v=20260904-weather1';
import { MapRenderer } from './ui/mapRenderer.js?v=20260904-weather1';
import { FogOfWar } from './core/fogOfWar.js?v=20260904-weather1';
import { buildFishingContactPairs, initialiseKnowledge, pruneKnowledge, tickFishingKnowledge, KNOWLEDGE_THRESHOLDS, knowledgeLevel, knowledgeStage, compassDirection } from './core/knowledge.js?v=20260904-weather1';
import { attitudeLabel, attitudeToward, canDiplomaticallyReach, endAgreement, proposeAgreement, tickDiplomacy } from './diplomacy/relations.js?v=20260904-diplomacy1';

const START_YEAR = -1300; // target: roughly eighty prosperous years before a c.1220 BCE collapse
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
  console.log(`Western Europe map loaded: ${regions.length} permanent land regions`);
  seedCensus(regions);
  const seaRegions = await loadSeaWorld();
  linkSeaAdjacency(regions, seaRegions);
  const fishingContactPairs = buildFishingContactPairs(regions, seaRegions);
  initialiseKnowledge(regions);
  const toolTypes = await (await fetch('data/world/toolTypes.json?v=20260904-weather1')).json();

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
  const agreements = [];
  const eventQueue = [];

  const map = new MapRenderer(canvas, regions, {
    seaRegions,
    isRegionVisible: (region) => fogOfWar.isVisible(region),
    isSeaRegionVisible: (sea) => sea.adjacentLand.some((landId) => {
      const land = regionsById.get(landId);
      return land ? fogOfWar.isVisible(land) : false;
    }),
    onSelect: (region) => {
      selectedRegion = region;
      renderRegionControls(region, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
      updateRegionStats(region, seaRegionsById, fogOfWar, regions, playerRegionId);
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
    tickEconomy(regions, seaRegions, toolTypes, Math.random, clock.tickIndex);
    pruneKnowledge(regions, clock.tickIndex);
    tickFishingKnowledge(fishingContactPairs, clock.tickIndex);
    tickTrade(regions, clock.tickIndex);
    tickStateFinance(regions);
    const breakthroughEvents = tickBreakthroughs(regions, clock.tickIndex, Math.random);
    tickDemographics(regions);
    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, clock.tickIndex);
    tickBanditry(regions, toolTypes, agreements);
    tickNationAi(regions, playerRegionId, activeRaids, agreements, clock.tickIndex, toolTypes, Math.random);

    const { remaining, events } = tickRaids(activeRaids, regionsById, clock.tickIndex, toolTypes, Math.random);
    activeRaids = remaining;

    // The player does not get a global news feed. Only raids involving their
    // own region are shown; other AI conflicts remain behind the fog.
    const playerRaidEvents = fogOfWar.devMode
      ? events
      : events.filter((event) =>
        event.raid.attackerId === playerRegionId || event.raid.defenderId === playerRegionId
      );
    const playerEvents = [
      ...breakthroughEvents.filter((event) => event.regionId === playerRegionId),
      ...playerRaidEvents,
      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),
    ];
    if (playerEvents.length > 0) {
      clock.requestAutoPause();
      eventQueue.push(...playerEvents);
      showNextEvent(clock, eventQueue);
    }

    document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);
    map.draw();

    if (selectedRegion && fogOfWar.isVisible(selectedRegion)) {
      updateRegionStats(selectedRegion, seaRegionsById, fogOfWar, regions, playerRegionId);
    }
  });

  document.getElementById('hud-date').textContent = clock.formatDate(START_YEAR);

  showRegionPicker(regions, (chosen) => {
    playerRegionId = chosen.id;
    fogOfWar.setPlayerRegion(chosen.id);

    document.getElementById('picker-modal').classList.add('hidden');
    selectedRegion = chosen;
    map.selectedId = chosen.id;

    renderRegionControls(chosen, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    updateRegionStats(chosen, seaRegionsById, fogOfWar, regions, playerRegionId);
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
    agreements,
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
  const pickerList = document.getElementById('picker-list');
  const pickerTitle = document.getElementById('picker-title');
  const pickerHelp = document.getElementById('picker-help');

  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const alphabetically = (a, b) => collator.compare(a, b);

  // Navigation metadata only: this does not define sovereignty.
  const navigationForRegion = (region) => {
    const sourceGroup = region.feature?.properties?.sourceGroup;
    const name = region.name;

    // Spain's dataset spans two continents.
    if (sourceGroup === 'ESP' && (name === 'Ceuta' || name === 'Melilla')) {
      return { continent: 'Africa', country: 'Spain' };
    }

    const groups = {
      'GBR-ENG': { continent: 'Europe', country: 'England' },
      'GBR-WLS': { continent: 'Europe', country: 'Wales' },
      'GBR-SCT': { continent: 'Europe', country: 'Scotland' },
      'FRA': { continent: 'Europe', country: 'France' },
      'ESP': { continent: 'Europe', country: 'Spain' },
      'PRT': { continent: 'Europe', country: 'Portugal' },
      'IRL': { continent: 'Europe', country: 'Ireland' },
      'GIB': { continent: 'Europe', country: 'Gibraltar' },
      'AND': { continent: 'Europe', country: 'Andorra' },
      'IMN': { continent: 'Europe', country: 'Isle of Man' },
      'JEY': { continent: 'Europe', country: 'Jersey' },
      'GGY': { continent: 'Europe', country: 'Guernsey' },
    };

    return groups[sourceGroup] || { continent: 'Other', country: sourceGroup || 'Other' };
  };

  const entries = regions.map((region) => ({ region, ...navigationForRegion(region) }));

  const resetList = (...nodes) => {
    pickerList.replaceChildren(...nodes);
    pickerList.scrollTop = 0;
  };

  const makeButton = (className, label, detail, onClick) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.innerHTML = detail
      ? `<strong>${label}</strong><span class="picker-count">${detail}</span>`
      : `<strong>${label}</strong>`;
    el.addEventListener('click', onClick);
    return el;
  };

  const makeBackButton = (label, onClick) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'picker-back';
    el.textContent = `← ${label}`;
    el.addEventListener('click', onClick);
    return el;
  };

  const renderContinents = () => {
    pickerTitle.textContent = 'Choose where to begin';
    pickerHelp.textContent = 'Choose a continent.';

    const continents = [...new Set(entries.map((entry) => entry.continent))]
      .sort(alphabetically);

    resetList(...continents.map((continent) => {
      const matches = entries.filter((entry) => entry.continent === continent);
      const countryCount = new Set(matches.map((entry) => entry.country)).size;
      return makeButton(
        'picker-group',
        continent,
        `${countryCount} ${countryCount === 1 ? 'area' : 'areas'} · ${matches.length} regions`,
        () => renderCountries(continent),
      );
    }));
  };

  const renderCountries = (continent) => {
    pickerTitle.textContent = continent;
    pickerHelp.textContent = 'Choose a country or geographic grouping.';

    const countries = [...new Set(
      entries
        .filter((entry) => entry.continent === continent)
        .map((entry) => entry.country)
    )].sort(alphabetically);

    const nodes = [makeBackButton('Continents', renderContinents)];

    for (const country of countries) {
      const matches = entries.filter(
        (entry) => entry.continent === continent && entry.country === country
      );

      nodes.push(makeButton(
        'picker-group',
        country,
        `${matches.length} ${matches.length === 1 ? 'region' : 'regions'}`,
        () => renderRegions(continent, country),
      ));
    }

    resetList(...nodes);
  };

  const renderRegions = (continent, country) => {
    pickerTitle.textContent = country;
    pickerHelp.textContent = `${continent} · choose the region you will govern.`;

    const matches = entries
      .filter((entry) => entry.continent === continent && entry.country === country)
      .map((entry) => entry.region)
      .sort((a, b) => alphabetically(a.name, b.name));

    const nodes = [makeBackButton(continent, () => renderCountries(continent))];

    for (const region of matches) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'picker-option';
      el.dataset.id = region.id;
      el.innerHTML = `
        <strong>${region.name}</strong>
        <span>pop ${region.population.toLocaleString()} &middot; land quality ${region.landQuality.toFixed(2)}&times;</span>
      `;
      el.addEventListener('click', () => onChosen(region));
      nodes.push(el);
    }

    resetList(...nodes);
  };

  // Always start at the top level; only one hierarchy level is rendered at a time.
  renderContinents();
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
  const hud = document.getElementById('hud');
  const halfSpeedBtn = document.getElementById('btn-speed-half');
  const notice = document.getElementById('performance-notice');
  let noticeTimer = null;

  const syncSpeedControls = () => {
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.speed) === clock.speed);
    });
    pauseBtn.textContent = clock.speed === 0 ? '►' : 'II';
  };

  const showPerformanceNotice = ({ previousSpeed, speed, tickDurationMs }) => {
    if (speed === 0.5) {
      halfSpeedBtn.classList.remove('hidden');
      hud.classList.add('performance-limited');
    }
    const measured = Math.max(1, Math.round(tickDurationMs));
    notice.textContent = `A week is taking about ${measured} ms on this device, so ${previousSpeed}x was reduced to ${speed}x. Every week will still be simulated.`;
    notice.classList.remove('hidden');
    if (noticeTimer) clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.add('hidden'), 8000);
  };

  clock.onSpeedChange((detail) => {
    syncSpeedControls();
    if (detail.automatic && detail.reason === 'performance') showPerformanceNotice(detail);
  });

  pauseBtn.addEventListener('click', () => {
    clock.togglePause();
  });

  document.querySelectorAll('.speed-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = Number(btn.dataset.speed);
      clock.setSpeed(speed);
    });
  });

  syncSpeedControls();
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
function renderRegionControls(region, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes) {
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
  const diplomaticTargets = regions
    .filter((r) => r.id !== region.id && fogOfWar.isVisible(r) && canDiplomaticallyReach(region, r));
  const activeAgreements = agreements.filter((a) => a.active && (a.fromId === region.id || a.toId === region.id));
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
    <div class="raid-section diplomacy-section">
      <strong>Relations and agreements</strong>
      ${diplomaticTargets.length === 0
        ? '<div class="raid-status">No known neighbouring cultures to negotiate with.</div>'
        : `<label class="control-row">Neighbour
            <select id="diplomacy-target">
              <option value="">— select —</option>
              ${diplomaticTargets.map((target) => {
                const feeling = attitudeToward(target, region.id);
                return `<option value="${target.id}">${target.name} — ${attitudeLabel(feeling)}</option>`;
              }).join('')}
            </select>
          </label>
          <label class="control-row">Offer or demand
            <select id="diplomacy-action">
              <option value="military_support">Send troops against bandits</option>
              <option value="tribute">Demand weekly tribute</option>
              <option value="resource_access">Claim wood-harvesting rights</option>
            </select>
          </label>
          <label class="control-row" id="support-personnel-row">Troops to send
            <input type="number" min="10" step="10" id="support-personnel" value="${Math.max(10, Math.floor(region.army.personnel * 0.1))}">
          </label>
          <div id="diplomacy-info" class="raid-status"></div>
          <button id="btn-diplomacy-propose" disabled>Make proposal</button>`}
      ${activeAgreements.length === 0 ? '' : `
        <div class="agreement-list">
          ${activeAgreements.map((agreement) => {
            const otherId = agreement.fromId === region.id ? agreement.toId : agreement.fromId;
            const other = regions.find((r) => r.id === otherId);
            const labels = { military_support: 'military support', tribute: 'tribute', resource_access: 'wood access' };
            return `<div class="agreement-row"><span>${labels[agreement.type]} — ${other?.name || otherId}</span><button data-end-agreement="${agreement.id}">End</button></div>`;
          }).join('')}
        </div>`}
    </div>
  `;

  document.getElementById('input-army').addEventListener('change', (e) => {
    region.targetArmySize = Math.max(0, Number(e.target.value) || 0);
  });

  document.getElementById('input-navy').addEventListener('change', (e) => {
    region.targetNavySize = Math.max(0, Number(e.target.value) || 0);
  });

  if (targets.length > 0) {
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
      renderRegionControls(region, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    }
    });
  }

  const diplomacyTarget = document.getElementById('diplomacy-target');
  const diplomacyAction = document.getElementById('diplomacy-action');
  const diplomacyButton = document.getElementById('btn-diplomacy-propose');
  if (diplomacyTarget && diplomacyAction && diplomacyButton) {
    const supportRow = document.getElementById('support-personnel-row');
    const updateDiplomacyInfo = () => {
      supportRow.classList.toggle('hidden', diplomacyAction.value !== 'military_support');
      diplomacyButton.disabled = !diplomacyTarget.value;
      const target = diplomaticTargets.find((r) => r.id === diplomacyTarget.value);
      document.getElementById('diplomacy-info').textContent = target
        ? `${target.name}'s culture is ${attitudeLabel(attitudeToward(target, region.id))} toward yours. Coercive demands require a clear military advantage.`
        : '';
    };
    diplomacyTarget.addEventListener('change', updateDiplomacyInfo);
    diplomacyAction.addEventListener('change', updateDiplomacyInfo);
    updateDiplomacyInfo();

    diplomacyButton.addEventListener('click', () => {
      const target = diplomaticTargets.find((r) => r.id === diplomacyTarget.value);
      if (!target) return;
      const result = proposeAgreement(diplomacyAction.value, region, target, agreements, toolTypes,
        clock.tickIndex, { personnel: Number(document.getElementById('support-personnel')?.value) || 0 });
      document.getElementById('diplomacy-info').textContent = result.accepted
        ? `${target.name} accepted the agreement.`
        : `The proposal failed (${String(result.reason).replaceAll('_', ' ')}).`;
      if (result.accepted) renderRegionControls(region, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    });
  }

  document.querySelectorAll('[data-end-agreement]').forEach((button) => {
    button.addEventListener('click', () => {
      const agreement = agreements.find((candidate) => candidate.id === Number(button.dataset.endAgreement));
      endAgreement(agreement, new Map(regions.map((r) => [r.id, r])), clock.tickIndex);
      renderRegionControls(region, regions, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);
    });
  });
}

function showNextEvent(clock, eventQueue) {
  if (eventQueue.length === 0) return;

  const event = eventQueue.shift();
  if (event.type === 'agreement_ended') {
    document.getElementById('event-title').textContent = 'Agreement ended';
    document.getElementById('event-body').textContent = `The agreement between ${event.fromName} and ${event.toName} has broken down.`;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'iron_smelting_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Iron smelting';
    document.getElementById('event-body').innerHTML = `
      Smiths in ${event.regionName} have learnt to smelt the plentiful local iron ore.<br><br>
      Your workshops can now produce iron and make iron tools. Bronze remains stronger,
      so smiths will use iron only when it is substantially cheaper or bronze is unavailable.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }
  if (event.type === 'advanced_boatbuilding_breakthrough') {
    document.getElementById('event-title').textContent = 'Breakthrough: Advanced boatbuilding';
    document.getElementById('event-body').innerHTML = `
      Shipwrights in ${event.regionName} have learnt to build larger, stronger seagoing vessels.<br><br>
      Advanced boats require wood, pitch, textiles and bronze or iron fittings. They carry more
      cargo and soldiers, travel faster and farther, improve offshore fishing and perform better in war.
    `;
    wireEventContinue(clock, eventQueue);
    return;
  }

  const { attackerName, defenderName, outcome, raid } = event;
  const won = outcome.attackerRatio > 0.5;

  const knowledgeText = outcome.defenderLearnedOrigin
    ? (won
      ? `The raid also gives you some information about where ${attackerName}'s people come from.`
      : `The raid was repelled. Captives, survivors and the wreckage give you much clearer information about where ${attackerName}'s people came from.`)
    : '';

  const lootText = Object.entries(outcome.looted)
    .map(([k, v]) => `${v.toFixed(0)} ${k}`)
    .join(', ') || 'nothing of note';

  document.getElementById('event-title').textContent = `Raid: ${attackerName} vs ${defenderName}`;
  document.getElementById('event-body').innerHTML = `
    ${attackerName}'s raiders (${raid.personnel.toLocaleString()} strong) reached ${defenderName}.
    ${won ? 'The raid succeeded.' : 'The defenders held them off.'}<br><br>
    Attacker losses: ${outcome.attackerLosses.toLocaleString()}<br>
    Defender losses: ${outcome.defenderLosses.toLocaleString()}<br>
    Looted: ${lootText}${outcome.walletStolen > 0.5 ? `, ${outcome.walletStolen.toFixed(0)} household wealth` : ''}${outcome.treasuryStolen > 0.5 ? `, ${outcome.treasuryStolen.toFixed(0)} treasury wealth` : ''}<br>
    ${defenderName}'s stability fell ${(outcome.stabilityLoss * 100).toFixed(0)} points.<br>
    ${knowledgeText}
  `;

  wireEventContinue(clock, eventQueue);
}

function wireEventContinue(clock, eventQueue) {
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

const RESOURCE_LABELS = { ironOre: 'iron ore', advancedNavyBoats: 'advanced navy boats',
  advancedFishingBoats: 'advanced fishing boats', boatLosses: 'boats lost', potteryBroken: 'pots broken',
  horses: 'untrained horses' };
function resourceLabel(key) {
  return RESOURCE_LABELS[key] || key;
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
  materialCrafts: 'Pitch and textiles',
  pottery: 'Pottery',
  horses: 'Horse husbandry',
};

function buildResourcesSection(region, seaRegionsById) {
  const depositLines = ['copper', 'tin', 'ironOre', 'clay', 'gold', 'stone']
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

      return `<div>${key === 'ironOre' ? 'iron ore' : key}: ${tierText}</div>`;
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
    <div>Horses: ${Math.round((region.stockpile.horses || 0) + (region.horseEconomy?.draft || 0) + (region.horseEconomy?.transport || 0) + (region.horseEconomy?.war || 0)).toLocaleString()} herd / ${Math.round(region.horseEconomy?.capacity || 0).toLocaleString()} pasture capacity (${Math.round(region.horseEconomy?.draft || 0)} draught, ${Math.round(region.horseEconomy?.transport || 0)} transport, ${Math.round(region.horseEconomy?.war || 0)} war-trained)</div>
    ${depositLines}
    ${seaLines || '<div>No adjacent sea</div>'}
  `;
}

function buildReportSection(region) {
  const r = region.report;
  if (!r || Object.keys(r).length === 0) return '<div>Not yet ticked</div>';

  const lines = [];

  for (const [key, data] of Object.entries(r)) {
    if (key === 'toolWear') {
      if (data.tools > 0.05) lines.push(`<div>Wear and breakage: ${data.tools.toFixed(1)} tools lost</div>`);
      continue;
    }
    if (key === 'foodPlan') {
      if (data.importDependence > 0.005) {
        lines.push(`<div>Food strategy: plans to import ${(data.importDependence * 100).toFixed(0)}% of need</div>`);
      } else if (data.exportSurplus > 0.005) {
        lines.push(`<div>Food strategy: plans a ${(data.exportSurplus * 100).toFixed(0)}% export surplus</div>`);
      }
      continue;
    }
    if (key === 'foodStorage') {
      lines.push(`<div>Food storage: ${Math.round(data.potteryCoverage * 100)}% pottery coverage &middot; ${data.weeks.toFixed(1)} weeks capacity &middot; ${(data.spoilage * 100).toFixed(1)}% weekly spoilage</div>`);
      continue;
    }
    if (key === 'weather') {
      lines.push(`<div>Growing conditions: ${data.condition} &middot; season ${(data.seasonalMultiplier * 100).toFixed(0)}% &middot; weather ${(data.weatherMultiplier * 100).toFixed(0)}% &middot; combined farming potential ${(data.seasonalMultiplier * data.weatherMultiplier * 100).toFixed(0)}%</div>`);
      continue;
    }
    if (key === 'maintenance') {
      const losses = [];
      if (data.boatLosses > 0.01) losses.push(`${data.boatLosses.toFixed(2)} boats worn out`);
      if (data.potteryBroken > 0.1) losses.push(`${data.potteryBroken.toFixed(0)} pots broken`);
      if (losses.length) lines.push(`<div>Wear and breakage: ${losses.join(' &middot; ')}</div>`);
      continue;
    }
    if (key === 'stateFinance') {
      const payroll = data.payrollDue > 0
        ? `${(data.payRatio * 100).toFixed(0)}% payroll funded`
        : 'no military payroll';
      lines.push(`<div>State finance: ${data.revenue.toFixed(1)} revenue &middot; ${payroll} &middot; ${(data.readiness * 100).toFixed(0)}% military readiness &middot; ${(data.stateCapacity * 100).toFixed(0)}% administrative capacity${data.procurementSpent > 0.05 ? ` &middot; ${data.procurementSpent.toFixed(1)} arms spending` : ''}${data.deserters > 0.5 ? ` &middot; ${data.deserters.toFixed(0)} deserters` : ''}</div>`);
      continue;
    }
    if (key === 'horses') {
      lines.push(`<div>Horse husbandry: ${data.herd.toFixed(0)} horses / ${data.capacity.toFixed(0)} pasture capacity &middot; ${data.draft.toFixed(0)} draught &middot; ${data.transport.toFixed(0)} transport &middot; ${data.war.toFixed(0)} war-trained &middot; ${data.workers.toFixed(0)} breeders/trainers${data.births > 0.05 ? ` &middot; ${data.births.toFixed(1)} births` : ''}${data.deaths > 0.05 ? ` &middot; ${data.deaths.toFixed(1)} deaths` : ''}</div>`);
      continue;
    }
    if (key === 'banditry') {
      const outcomes = [];
      if (data.reintegrated > 0.5) outcomes.push(`${data.reintegrated.toFixed(0)} returned to civilian life`);
      if (data.dispersed > 0.5) outcomes.push(`${data.dispersed.toFixed(0)} dispersed`);
      if (data.starved > 0.5) outcomes.push(`${data.starved.toFixed(0)} starved`);
      if (data.foodLooted > 0.5) outcomes.push(`${data.foodLooted.toFixed(0)} food looted`);
      if (outcomes.length) lines.push(`<div>Banditry: ${outcomes.join(' &middot; ')}</div>`);
      continue;
    }
    if (!data || data.workers === 0) continue;

    const outputs = Object.entries(data)
      .filter(([k]) => k !== 'workers' && k !== 'seaName' && k !== 'advancedShare' && k !== 'ironReadiness' && k !== 'seasonalMultiplier' && k !== 'weatherMultiplier')
      .filter(([, v]) => typeof v === 'number' && v > 0.05)
      .map(([k, v]) => `${v.toFixed(k === 'bronze' || k === 'iron' ? 1 : 0)} ${resourceLabel(k)}`)
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
function buildContactsSection(region, regions, playerRegionId, fogOfWar) {
  const observer = regions.find((r) => r.id === playerRegionId) || region;
  if (!observer?.knowledge) return '';

  const contacts = [...observer.knowledge.entries()]
    .filter(([id, level]) => id !== observer.id && level >= KNOWLEDGE_THRESHOLDS.NAME)
    .map(([id, level]) => {
      const other = regions.find((r) => r.id === id);
      if (!other) return '';
      const stage = knowledgeStage(observer, other);
      const direction = level >= KNOWLEDGE_THRESHOLDS.DIRECTION
        ? ` — ${compassDirection(observer, other)}`
        : '';
      const stageLabel = {
        name: 'name known',
        direction: 'rough location known',
        map: 'mapped',
        resources: 'resources partly known',
        economy: 'economy partly known',
        population: 'population known',
        detailed: 'detailed knowledge',
      }[stage] || stage;
      return `<div>${other.name}${direction} — ${stageLabel}</div>`;
    })
    .filter(Boolean);

  if (contacts.length === 0) return '<details id="details-contacts"><summary>Known contacts</summary><div>No known foreign countries</div></details>';
  return `<details id="details-contacts"><summary>Known contacts</summary>${contacts.join('')}</details>`;
}

function updateRegionStats(region, seaRegionsById, fogOfWar, regions, playerRegionId) {
  const observer = regions.find((r) => r.id === playerRegionId) || region;
  const familiarity = fogOfWar.devMode || observer.id === region.id ? 1 : knowledgeLevel(observer, region);
  const knowsResources = familiarity >= KNOWLEDGE_THRESHOLDS.RESOURCES;
  const knowsEconomy = familiarity >= KNOWLEDGE_THRESHOLDS.ECONOMY;
  const knowsPopulation = familiarity >= KNOWLEDGE_THRESHOLDS.POPULATION;
  const knowsDetailed = familiarity >= KNOWLEDGE_THRESHOLDS.DETAILED;
  const directionLine = observer.id !== region.id && familiarity >= KNOWLEDGE_THRESHOLDS.DIRECTION
    ? `Rough location: ${compassDirection(observer, region)}`
    : '';

  const density = densityPerKm2(region).toFixed(1);
  const culture = region.cultureGroups[0];
  const occ = region.occupations;

  const occLine = occ.farmer === undefined
    ? 'not yet ticked'
    : `farmers ${occ.farmer.toLocaleString()} &middot; gatherers ${(occ.gatherer || 0).toLocaleString()} &middot; shore fishers ${occ.shoreFisher || 0} &middot; boat fishers ${occ.boatFisher || 0} &middot; horse breeders ${occ.horseBreeder || 0} &middot; horse trainers ${occ.horseTrainer || 0} &middot; lumberjacks ${occ.lumberjack} &middot; boatmakers ${occ.boatmaker || 0} &middot; potters ${occ.potter || 0} &middot; textile workers ${occ.textileWorker || 0} &middot; pitch makers ${occ.pitchMaker || 0} &middot; miners ${occ.miner} &middot; smiths ${occ.smith} &middot; traders ${occ.trader || 0} &middot; general ${occ.general.toLocaleString()}`;

  const d = region.demographics;
  const demoLine = `${Math.round(d.children).toLocaleString()} children &middot; ${Math.round(d.workingAge).toLocaleString()} working-age &middot; ${Math.round(d.elderly).toLocaleString()} elderly`;
  const banditLine = region.banditPopulation > 10
    ? `${Math.round(region.banditPopulation).toLocaleString()} people turned to banditry`
    : 'none';

  const stock = region.stockpile;
  const stockLine = Object.keys(stock).length
    ? Object.entries(stock)
        .filter(([, v]) => v > 0.05)
        .map(([k, v]) => `${resourceLabel(k)} ${v.toFixed(k === 'bronze' || k === 'iron' ? 1 : 0)}`)
        .join(' &middot; ') || 'none yet'
    : 'none yet';

  const bronzePloughs = region.equipment.farmer?.bronze_plough || 0;
  const ironPloughs = region.equipment.farmer?.iron_plough || 0;
  const ploughs = bronzePloughs + ironPloughs;
  const farmersSupported = ploughs * 10;
  const toolLine = occ.farmer
    ? `${ploughs.toLocaleString()} plough teams support ${Math.min(farmersSupported, occ.farmer).toLocaleString()} / ${occ.farmer.toLocaleString()} farmers (${bronzePloughs.toLocaleString()} bronze, ${ironPloughs.toLocaleString()} iron; ${((Math.min(farmersSupported, occ.farmer) / occ.farmer) * 100).toFixed(0)}%)`
    : 'n/a';

  const bronzeArms = region.equipment.soldier?.bronze_weapons || 0;
  const ironArms = region.equipment.soldier?.iron_weapons || 0;
  const armyEquipped = bronzeArms + ironArms;
  const militaryLine = `${occ.soldier || 0} soldiers (${Math.min(armyEquipped * 2, occ.soldier || 0).toFixed(0)} equipped by ${armyEquipped.toFixed(0)} weapon sets: ${bronzeArms.toFixed(0)} bronze, ${ironArms.toFixed(0)} iron) &middot; ${Math.round(region.horseEconomy?.war || 0)} war horses &middot; ${occ.sailor || 0} sailors &middot; ${Math.round(region.navy.boats)} navy boats (${Math.round(region.navy.advancedBoats || 0)} advanced)`;

  const fishingLine = region.adjacentSeaIds.length
    ? `${Math.round(region.fishingBoats)} fishing boats (${Math.round(region.advancedFishingBoats || 0)} advanced) &middot; fishes ${region.adjacentSeaIds.join(', ')}`
    : 'landlocked — no fishing';

  const tradeEconomy = region.tradeEconomy || {};
  const creditLine = (tradeEconomy.debt || 0) > 0.05 || (tradeEconomy.creditLimit || 0) > 0.05
    ? ` &middot; debt ${(tradeEconomy.debt || 0).toFixed(0)} / ${(tradeEconomy.creditLimit || 0).toFixed(0)} limit`
    : '';
  const foodDependence = region.report?.foodPlan?.importDependence || 0;
  const tradeLine = `Recent exports ${(tradeEconomy.exportIncomeEma || 0).toFixed(0)}/week &middot; food imports ${(tradeEconomy.foodImportEma || 0).toFixed(0)} rations/week${foodDependence > 0.005 ? ` &middot; planned food dependence ${(foodDependence * 100).toFixed(0)}%` : ''}`;
  const militaryFinance = region.militaryFinance || {};
  const financeLine = `Revenue ${(militaryFinance.revenueEma || 0).toFixed(1)}/week &middot; administration ${((militaryFinance.stateCapacity ?? 1) * 100).toFixed(0)}% &middot; payroll ${((militaryFinance.payRatio ?? 1) * 100).toFixed(0)}% &middot; readiness ${((militaryFinance.readiness ?? 1) * 100).toFixed(0)}% &middot; funded force cap ${Number.isFinite(militaryFinance.fundedPersonnelCap) ? Math.round(militaryFinance.fundedPersonnelCap).toLocaleString() : 'unlimited'}${militaryFinance.arrearsWeeks > 0 ? ` &middot; ${militaryFinance.arrearsWeeks} weeks arrears` : ''}`;

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
    <div>${knowsPopulation ? `Population: ${region.population.toLocaleString()} (${density}/km&sup2;)` : 'Population: unknown'}</div>
    <div>${knowsPopulation ? `Age bands: ${demoLine}` : 'Age bands: unknown'}</div>
    ${directionLine ? `<div>${directionLine}</div>` : ''}
    <div>${knowsEconomy ? `Stability: ${(region.stability * 100).toFixed(0)}% &middot; Safety: ${(region.safetyRating * 100).toFixed(0)}%` : 'Political/economic condition: unknown'}</div>
    ${knowsDetailed ? `<div>Banditry: ${banditLine}</div><div>Military: ${militaryLine}</div>` : '<div>Military strength: unknown</div>'}
    ${knowsResources ? `<div>Fishing: ${fishingLine}</div>` : '<div>Fishing activity: unknown</div>'}
    ${knowsDetailed ? `<div>Skill (learning by doing): ${skillLine}</div>` : ''}
    ${knowsDetailed ? `<div>Iron smelting: ${region.unlockedTechIds.has(IRON_SMELTING_TECH_ID) ? `discovered &middot; industry ${(region.ironWorkingReadiness * 100).toFixed(0)}% established` : 'not yet discovered'}</div>` : ''}
    ${knowsDetailed ? `<div>Advanced boatbuilding: ${region.unlockedTechIds.has(ADVANCED_BOATBUILDING_TECH_ID) ? 'discovered' : 'not yet discovered'}</div>` : ''}
    ${knowsEconomy ? `<div>Wealth: ${region.wallet.toFixed(0)} populace &middot; ${region.treasury.toFixed(0)} treasury${creditLine}</div><div>State: ${financeLine}</div><div>Trade: ${tradeLine}</div>` : '<div>Wealth: unknown</div>'}
    ${knowsDetailed ? `<div>Tools: ${toolLine}</div><div>Culture: ${culture.cultureId} &middot; identity strength ${(culture.identityStrength * 100).toFixed(0)}%</div>` : ''}
    <div>Neighbours: ${neighbourLine}</div>
    <div>Controlled by: ${fogOfWar.devMode ? region.controllingActorId : (region.controllingActorId === region.id ? region.name : 'another ruler')}</div>
    ${buildContactsSection(region, regions, playerRegionId, fogOfWar)}
    ${knowsResources ? `<details id="details-resources"><summary>Resources</summary>${buildResourcesSection(region, seaRegionsById)}</details>` : '<div>Resources: only broad rumours</div>'}
    ${knowsEconomy ? `<details id="details-report"><summary>Economy report (this week)</summary>${buildReportSection(region)}</details><details id="details-occupations"><summary>Working as</summary><div>${occLine}</div></details><details id="details-stockpile"><summary>Stockpile</summary><div>${stockLine}</div></details>` : '<div>Economic activity: little known</div>'}
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
