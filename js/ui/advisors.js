import { canRaid, launchRaid, maxSeaRaidersAvailable } from '../military/raiding.js?v=20260904-policy1';
import { attitudeLabel, attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { governanceLabel } from '../politics/polities.js?v=20260904-kingdom1';
import { ensureMilitaryPolicy, mobilisedArmyTarget, setMilitaryPolicy } from '../military/policies.js?v=20260904-policy1';

const ADVISORS = [
  { id: 'marshal', icon: '\u2694', name: 'Marshal', brief: 'Forces & raids' },
  { id: 'treasurer', icon: '\u25c8', name: 'Treasurer', brief: 'Coin & trade' },
  { id: 'steward', icon: '\u2692', name: 'Steward', brief: 'People & stores' },
  { id: 'envoy', icon: '\u2691', name: 'Envoy', brief: 'Foreign relations' },
  { id: 'chancellor', icon: '\u265c', name: 'Chancellor', brief: 'Realm & rule' },
  { id: 'spymaster', icon: '\u25c9', name: 'Spymaster', brief: 'Knowledge' },
];

const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const row = (label, value, tone = '') => `<div class="advisor-report-row ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
const section = (title, body) => `<section class="advisor-section"><h3>${title}</h3>${body}</section>`;

export class AdvisorCouncil {
  constructor({ regions, polities, fogOfWar, clock, getPlayerRegionId, getActiveRaids, addRaid, openRegion }) {
    this.regions = regions;
    this.polities = polities;
    this.fogOfWar = fogOfWar;
    this.clock = clock;
    this.getPlayerRegionId = getPlayerRegionId;
    this.getActiveRaids = getActiveRaids;
    this.addRaid = addRaid;
    this.openRegion = openRegion;
    this.activeAdvisor = 'marshal';
    this.panel = document.getElementById('council-panel');
    this.content = document.getElementById('advisor-content');
    this.tabs = document.getElementById('advisor-tabs');
    this.wire();
  }

  get player() { return this.regions.find((r) => r.id === this.getPlayerRegionId()); }

  wire() {
    this.tabs.innerHTML = ADVISORS.map((advisor) => `
      <button class="advisor-tab" data-advisor="${advisor.id}" aria-label="${advisor.name}: ${advisor.brief}">
        <span>${advisor.icon}</span><small>${advisor.name}</small>
      </button>`).join('');
    this.tabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-advisor]');
      if (!button) return;
      this.activeAdvisor = button.dataset.advisor;
      this.render();
    });
    document.getElementById('btn-council').addEventListener('click', () => this.open());
    document.getElementById('btn-close-council').addEventListener('click', () => this.close());
  }

  open(advisor = this.activeAdvisor) {
    if (!this.player) return;
    this.activeAdvisor = advisor;
    this.panel.classList.remove('hidden');
    document.getElementById('region-sheet').classList.add('hidden');
    this.render();
  }

  close() { this.panel.classList.add('hidden'); }

  refresh() {
    // Do not rebuild an order form beneath the player's finger. Reports can
    // refresh live; the Marshal refreshes when opened or after issuing orders.
    if (!this.panel.classList.contains('hidden') && this.activeAdvisor !== 'marshal') this.render(false);
  }

  render(resetScroll = true) {
    const player = this.player;
    if (!player) return;
    this.tabs.querySelectorAll('[data-advisor]').forEach((button) => {
      const active = button.dataset.advisor === this.activeAdvisor;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    const advisor = ADVISORS.find((entry) => entry.id === this.activeAdvisor);
    document.getElementById('council-title').textContent = `${advisor.name} — ${advisor.brief}`;
    const renderers = {
      marshal: () => this.renderMarshal(player), treasurer: () => this.renderTreasurer(player),
      steward: () => this.renderSteward(player), envoy: () => this.renderEnvoy(player),
      chancellor: () => this.renderChancellor(player), spymaster: () => this.renderSpymaster(player),
    };
    this.content.innerHTML = renderers[this.activeAdvisor]();
    this.wireCurrent(player);
    if (resetScroll) this.content.scrollTop = 0;
  }

  renderMarshal(player) {
    const targets = this.raidTargets(player);
    const away = this.getActiveRaids().filter((raid) => raid.attackerId === player.id && !raid.completed);
    const finance = player.militaryFinance || {};
    const policy = ensureMilitaryPolicy(player);
    return `
      <p class="advisor-voice">“I will keep the fighting strength of the realm before you, and speak plainly about what we can afford.”</p>
      ${section('Military report',
        row('Army at home', number(player.army.personnel)) +
        row('Army away', number(player.army.away)) +
        row('Mobilised target', number(mobilisedArmyTarget(player))) +
        row('Navy', `${number(player.navy.boats)} boats · ${number(player.navy.personnel)} sailors`) +
        row('Readiness', percent(finance.readiness ?? 1), (finance.readiness ?? 1) < .7 ? 'warning' : '') +
        row('Sustainable force', Number.isFinite(finance.fundedPersonnelCap) ? number(finance.fundedPersonnelCap) : 'Unknown') +
        row('Active expeditions', number(away.length)))}
      ${section('Standing orders', `
        <label class="advisor-field"><span>Full army establishment</span><input id="council-army-target" type="number" min="0" step="100" value="${Math.round(player.targetArmySize)}"></label>
        <label class="advisor-field"><span>Target navy size</span><input id="council-navy-target" type="number" min="0" step="1" value="${Math.round(player.targetNavySize)}" ${player.isCoastal ? '' : 'disabled'}></label>
        <label class="advisor-field advisor-slider"><span>Army permanence <b id="army-permanence-label">${Math.round(policy.armyPermanence * 100)}%</b></span><input id="army-permanence" type="range" min="0" max="100" value="${Math.round(policy.armyPermanence * 100)}"></label>
        <p class="advisor-note">Low permanence leaves most troops in civilian work until danger rises. A standing force is readier and more cohesive, but remains on the payroll.</p>
        <label class="advisor-field"><span>Defensive posture</span><select id="defensive-posture">
          <option value="settlements" ${policy.defensivePosture === 'settlements' ? 'selected' : ''}>Protect settlements</option>
          <option value="trade_routes" ${policy.defensivePosture === 'trade_routes' ? 'selected' : ''}>Protect trade routes</option>
          <option value="borders" ${policy.defensivePosture === 'borders' ? 'selected' : ''}>Guard borders</option>
        </select></label>
        <label class="advisor-field"><span>Captured raiders</span><select id="raider-treatment">
          <option value="reintegrate" ${policy.raiderTreatment === 'reintegrate' ? 'selected' : ''}>Offer reintegration</option>
          <option value="recruit" ${policy.raiderTreatment === 'recruit' ? 'selected' : ''}>Recruit into army</option>
          <option value="punish" ${policy.raiderTreatment === 'punish' ? 'selected' : ''}>Punish harshly</option>
        </select></label>
        <label class="advisor-field"><span>Naval priority</span><select id="naval-priority" ${player.isCoastal ? '' : 'disabled'}>
          <option value="fisheries" ${policy.navalPriority === 'fisheries' ? 'selected' : ''}>Protect fisheries</option>
          <option value="trade" ${policy.navalPriority === 'trade' ? 'selected' : ''}>Escort trade</option>
          <option value="war" ${policy.navalPriority === 'war' ? 'selected' : ''}>Prepare for war</option>
        </select></label>
        <label class="advisor-field advisor-slider"><span>War-horse allocation <b id="war-horse-label">${Math.round(policy.warHorseAllocation * 100)}%</b></span><input id="war-horse-allocation" type="range" min="0" max="100" value="${Math.round(policy.warHorseAllocation * 100)}"></label>
        <p class="advisor-note">Military priority draws scarce trained horses away from plough teams and merchant transport.</p>`)}
      ${section('Order a raid', targets.length ? `
        <label class="advisor-field"><span>Target</span><select id="council-raid-target"><option value="">Choose a known target</option>${targets.map((target) => `<option value="${target.region.id}">${target.region.name}${target.viaSea ? ' · by sea' : ''}</option>`).join('')}</select></label>
        <label class="advisor-field advisor-slider"><span>Commit <b id="council-raid-share-label">50%</b></span><input id="council-raid-share" type="range" min="0" max="100" value="50"></label>
        <div id="council-raid-assessment" class="advisor-note">Choose a target for the Marshal's assessment.</div>
        <button id="council-launch-raid" class="advisor-order danger" disabled>Launch raid</button>` : '<p class="advisor-note">There are no visible targets we can currently reach.</p>')}`;
  }

  raidTargets(player) {
    return this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region))
      .map((region) => ({ region, ...canRaid(player, region, this.regions, this.polities) }))
      .filter((entry) => entry.possible);
  }

  renderTreasurer(player) {
    const finance = player.militaryFinance || {};
    const trade = player.tradeEconomy || {};
    const revenue = (finance.weeklyTaxRevenue || 0) + (finance.weeklyTradeDuties || 0);
    return `<p class="advisor-voice">“Coin is stored labour, Majesty. I count where it comes from, and which promises are consuming it.”</p>
      ${section('Treasury', row('Treasury', number(player.treasury)) + row('Household wealth', number(player.wallet)) + row('Revenue this week', revenue.toFixed(1)) + row('Military payroll paid', percent(finance.payRatio ?? 1), (finance.payRatio ?? 1) < .9 ? 'warning' : '') + row('Administration capacity', percent(finance.stateCapacity ?? 1)))}
      ${section('Trade', row('Exports this week', number(trade.weeklyExports)) + row('Imports this week', number(trade.weeklyImports)) + row('Trade debt', `${number(trade.debt)} / ${number(trade.creditLimit)}`) + row('Known partners', number(player.tradePartnerIds?.size)))}`;
  }

  renderSteward(player) {
    const food = (player.stockpile.food || 0);
    return `<p class="advisor-voice">“The realm is more than its warriors. These are the people, harvests and dangers that will still matter next winter.”</p>
      ${section('Realm at home', row('Population', number(player.population)) + row('Stability', percent(player.stability), player.stability < .6 ? 'warning' : '') + row('Safety', percent(player.safetyRating), player.safetyRating < .6 ? 'warning' : '') + row('Bandits', number(player.banditPopulation), player.banditPopulation > 50 ? 'warning' : '') + row('Food stores', number(food)))}
      ${section('This season', row('Weather', player.weather?.condition || 'normal') + row('Crop yield effect', percent(player.weather?.yieldMultiplier ?? 1)) + row('Food import dependence', percent(player.foodImportDependence || player.report?.foodPlan?.importDependence || 0)))}`;
  }

  renderEnvoy(player) {
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    return `<p class="advisor-voice">“Foreign rulers hear our words through their own fears. I can tell you how they presently receive us.”</p>
      ${section('Known neighbours', contacts.length ? `<div class="advisor-list">${contacts.map((region) => `<button data-open-region="${region.id}"><span>${region.name}</span><small>${attitudeLabel(attitudeToward(region, player.id))} · inspect</small></button>`).join('')}</div>` : '<p class="advisor-note">We know of no foreign courts yet.</p>')}
      <p class="advisor-note">Treaties, demands and offers are made while inspecting a foreign region. The Envoy keeps this audience focused on comparison and advice.</p>`;
  }

  renderChancellor(player) {
    const polityId = player.governance?.sovereignPolityId;
    const subjects = this.regions.filter((region) => region.id !== player.id && region.governance?.sovereignPolityId === polityId);
    return `<p class="advisor-voice">“Conquest is a moment; government is the work that follows. I report where your commands truly carry.”</p>
      ${section('The realm', row('Seat of rule', player.name) + row('Government', governanceLabel(player)) + row('Subject regions', number(subjects.length)))}
      ${section('Subjects', subjects.length ? `<div class="advisor-list">${subjects.map((region) => `<button data-open-region="${region.id}"><span>${region.name}</span><small>${governanceLabel(region)} · control ${percent(region.governance.administrativeControl)}</small></button>`).join('')}</div>` : '<p class="advisor-note">No other region presently acknowledges your rule.</p>')}`;
  }

  renderSpymaster(player) {
    const observations = player.knowledge?.observations || [];
    const subjects = new Set(observations.map((item) => item.subjectId));
    const newest = [...observations].sort((a, b) => (b.receivedAt ?? b.observedAt ?? -1) - (a.receivedAt ?? a.observedAt ?? -1)).slice(0, 8);
    return `<p class="advisor-voice">“I separate what we have seen from what travellers merely repeat. Old knowledge is a dangerous comfort.”</p>
      ${section('Intelligence ledger', row('Known foreign peoples', number(subjects.size)) + row('Current reports', number(observations.length)) + row('Direct contacts', number(player.knowledge?.directContactIds?.size)))}
      ${section('Recent reports', newest.length ? `<div class="intelligence-list">${newest.map((report) => { const subject = this.regions.find((r) => r.id === report.subjectId); const age = Number.isFinite(report.receivedAt) ? Math.max(0, this.clock.tickIndex - report.receivedAt) : null; return `<div><strong>${subject?.name || 'Unknown people'}</strong><span>${String(report.topic).replaceAll('_', ' ')} · ${String(report.source).replaceAll('_', ' ')}${age === null ? '' : ` · ${age}w old`}</span></div>`; }).join('')}</div>` : '<p class="advisor-note">No reports have reached the court.</p>')}`;
  }

  wireCurrent(player) {
    document.querySelectorAll('#advisor-content [data-open-region]').forEach((button) => button.addEventListener('click', () => {
      this.close(); this.openRegion(button.dataset.openRegion);
    }));
    if (this.activeAdvisor !== 'marshal') return;
    const army = document.getElementById('council-army-target');
    const navy = document.getElementById('council-navy-target');
    army?.addEventListener('change', () => { player.targetArmySize = Math.max(0, Number(army.value) || 0); });
    navy?.addEventListener('change', () => { player.targetNavySize = Math.max(0, Number(navy.value) || 0); });
    const permanence = document.getElementById('army-permanence');
    const horseAllocation = document.getElementById('war-horse-allocation');
    permanence?.addEventListener('input', () => {
      setMilitaryPolicy(player, 'armyPermanence', Number(permanence.value) / 100);
      document.getElementById('army-permanence-label').textContent = `${permanence.value}%`;
    });
    horseAllocation?.addEventListener('input', () => {
      setMilitaryPolicy(player, 'warHorseAllocation', Number(horseAllocation.value) / 100);
      document.getElementById('war-horse-label').textContent = `${horseAllocation.value}%`;
    });
    for (const [id, key] of [['defensive-posture', 'defensivePosture'], ['raider-treatment', 'raiderTreatment'], ['naval-priority', 'navalPriority']]) {
      document.getElementById(id)?.addEventListener('change', (event) => setMilitaryPolicy(player, key, event.target.value));
    }
    const target = document.getElementById('council-raid-target');
    const share = document.getElementById('council-raid-share');
    const launch = document.getElementById('council-launch-raid');
    if (!target || !share || !launch) return;
    const assess = () => {
      const chosen = this.raidTargets(player).find((entry) => entry.region.id === target.value);
      const fraction = Number(share.value) / 100;
      document.getElementById('council-raid-share-label').textContent = `${Math.round(fraction * 100)}%`;
      if (!chosen) { launch.disabled = true; return; }
      let troops = Math.floor(player.army.personnel * fraction);
      let note = '';
      if (chosen.viaSea && troops > maxSeaRaidersAvailable(player)) {
        troops = maxSeaRaidersAvailable(player); note = ' Navy transport limits the expedition.';
      }
      document.getElementById('council-raid-assessment').textContent = `${number(troops)} soldiers will march on ${chosen.region.name}.${note}`;
      launch.disabled = troops <= 0;
    };
    target.addEventListener('change', assess); share.addEventListener('input', assess);
    launch.addEventListener('click', () => {
      const chosen = this.raidTargets(player).find((entry) => entry.region.id === target.value);
      if (!chosen) return;
      const requested = Math.floor(player.army.personnel * Number(share.value) / 100);
      const raid = launchRaid(player, chosen.region, requested, chosen.viaSea, this.clock.tickIndex, { regions: this.regions, polities: this.polities });
      if (raid) { this.addRaid(raid); this.render(false); }
    });
  }
}
