import { canRaid, launchRaid, maxSeaRaidersAvailable } from '../military/raiding.js?v=20260905-projects1';
import { attitudeLabel, attitudeToward } from '../diplomacy/relations.js?v=20260904-save1';
import { governanceLabel } from '../politics/polities.js?v=20260904-kingdom1';
import { ensureMilitaryPolicy, mobilisedArmyTarget, setMilitaryPolicy } from '../military/policies.js?v=20260904-policy1';
import { CAMPAIGN_OBJECTIVES, canCampaign, launchCampaign, massMobiliseDefender, requestCampaignWithdrawal } from '../military/campaigns.js?v=20260905-projects1';
import { availableConstructionTypes, cancelConstruction, CONSTRUCTION_TYPES, constructionEstimate,
  ensureConstruction, setConstructionWorkers, startConstruction, startRepair } from '../economy/construction.js?v=20260905-projects1';
import { CATAPULT_TECH_ID, ensureSiegeEquipment, setSiegeTarget, siegeCount, siegeTrainCount } from '../military/siegeEquipment.js?v=20260905-projects1';
import { dominantReligion, establishReligiousCentre, forkReligion, influenceReligiousLeader,
  religionById, setReligiousTolerance, setStateReligion } from '../society/religion.js?v=20260905-religion1';
import { TRADE_GOODS } from '../economy/tradeGoods.js?v=20260905-goods2';
import { activeTradeRestrictions, removeTradeRestriction, setTradeRestriction, tradeActorId } from '../economy/tradePolicy.js?v=20260905-policy1';
import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';
import { DIPLOMAT_AUTHORITY, dispatchDiplomat, diplomatsFor, recallDiplomat, setDiplomatAuthority } from '../diplomacy/diplomats.js?v=20260909-diplomats1';
import { ensureCounterIntelligence, setCounterIntelligencePolicy } from '../diplomacy/counterIntelligence.js?v=20260909-counterintel1';
import { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter } from '../diplomacy/couriers.js?v=20260909-counterintel1';
import { upcomingPlayerJointOperations } from '../military/playerJointOperationAdvisor.js?v=20260909-joint-player1';

const ADVISORS = [
  { id: 'marshal', icon: '\u2694', name: 'Marshal', brief: 'Forces & raids' },
  { id: 'treasurer', icon: '\u25c8', name: 'Treasurer', brief: 'Coin & trade' },
  { id: 'steward', icon: '\u2692', name: 'Steward', brief: 'People & stores' },
  { id: 'envoy', icon: '\u2691', name: 'Envoy', brief: 'Foreign relations' },
  { id: 'chancellor', icon: '\u265c', name: 'Chancellor', brief: 'Realm & rule' },
  { id: 'priest', icon: '\u2600', name: 'High Priest', brief: 'Faith & authority' },
  { id: 'spymaster', icon: '\u25c9', name: 'Spymaster', brief: 'Knowledge' },
];

const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const row = (label, value, tone = '') => `<div class="advisor-report-row ${tone}"><span>${label}</span><strong>${value}</strong></div>`;
const section = (title, body) => `<section class="advisor-section"><h3>${title}</h3>${body}</section>`;

export class AdvisorCouncil {
  constructor({ regions, polities, religiousWorld, fogOfWar, clock, getPlayerRegionId, getActiveRaids, addRaid,
    getCampaigns, addCampaign, getAgreements = () => [], openRegion }) {
    this.regions = regions;
    this.polities = polities;
    this.religiousWorld = religiousWorld;
    this.fogOfWar = fogOfWar;
    this.clock = clock;
    this.getPlayerRegionId = getPlayerRegionId;
    this.getActiveRaids = getActiveRaids;
    this.addRaid = addRaid;
    this.getCampaigns = getCampaigns;
    this.addCampaign = addCampaign;
    this.getAgreements = getAgreements;
    this.openRegion = openRegion;
    this.expandedCampaignId = null;
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

  openCampaign(campaignId) {
    this.expandedCampaignId = Number(campaignId);
    this.open('marshal');
  }

  close() { this.panel.classList.add('hidden'); }

  refresh() {
    if (this.panel.classList.contains('hidden')) return;
    const active = document.activeElement;
    if (this.content.contains(active) &&
      (active.tagName === 'INPUT' || active.tagName === 'SELECT')) return;
    this.render(false);
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
      priest: () => this.renderPriest(player),
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
    const playerPolityId = player.governance?.sovereignPolityId;
    const campaigns = this.getCampaigns().filter((campaign) => {
      const attacker = this.regions.find((region) => region.id === campaign.attackerId);
      const defender = this.regions.find((region) => region.id === campaign.defenderId);
      return attacker?.governance?.sovereignPolityId === playerPolityId ||
        defender?.governance?.sovereignPolityId === playerPolityId;
    });
    const campaignTargets = this.campaignTargets(player);
    const siege = ensureSiegeEquipment(player);
    const jointPlans = upcomingPlayerJointOperations(player, this.getAgreements(), Math.floor((this.clock.elapsedDays || 0) / 7));
    return `
      <p class="advisor-voice">“I will keep the fighting strength of the realm before you, and speak plainly about what we can afford.”</p>
      ${section('Military report',
        row('Army at home', number(player.army.personnel)) +
        row('Army away', number(player.army.away)) +
        row('Mobilised target', number(mobilisedArmyTarget(player))) +
        row('Navy', `${number(player.navy.boats)} boats · ${number(player.navy.personnel)} sailors`) +
        row('Readiness', percent(finance.readiness ?? 1), (finance.readiness ?? 1) < .7 ? 'warning' : '') +
        row('Sustainable force', Number.isFinite(finance.fundedPersonnelCap) ? number(finance.fundedPersonnelCap) : 'Unknown') +
        row('Active expeditions', number(away.length + campaigns.filter((campaign) => campaign.attackerId === player.id).length)))}
      ${section('Active conflicts', campaigns.length
        ? campaigns.map((campaign) => this.renderCampaignCard(campaign, player)).join('')
        : '<p class="advisor-note">The realm is not fighting a sustained campaign.</p>')}
      ${jointPlans.length ? section('Agreed joint operations', jointPlans.map(({ plan, weeksUntilAttack, preparation }) => {
        const allyId = plan.proposerRegionId === player.id ? plan.partnerRegionId : plan.proposerRegionId;
        const ally = this.regions.find((region) => region.id === allyId);
        const enemy = this.regions.find((region) => region.id === plan.enemyRegionId);
        return `<div class="advisor-note"><strong>${enemy?.name || 'Joint attack'}</strong> with ${ally?.name || 'ally'} · ${weeksUntilAttack > 0 ? `${weeksUntilAttack} weeks to agreed attack` : 'attack date reached'}<br>` +
          `Mobilised: ${preparation.mobilised ? 'yes' : 'not confirmed'} · staged: ${preparation.staged ? 'yes' : 'not confirmed'}</div>`;
      }).join('')) : ''}
      ${(player.unlockedTechIds.has('hill_forts') && !(player.infrastructure?.hillForts > 0))
        ? section('Marshal\'s recommendation', '<p class="advisor-note">A hill fort would strengthen the defender\'s home advantage in a sustained campaign.</p><button class="advisor-order" data-open-construction>Ask the Steward to build it</button>') : ''}
      ${section('Siege equipment', player.unlockedTechIds.has('hill_forts') ? `
        ${row('Rams at home', `${number(siegeCount(player, 'ram'))} · ${number(siege.inventory.ram.bronze)} bronze / ${number(siege.inventory.ram.iron)} iron`)}
        <label class="advisor-field"><span>Target battering rams</span><input id="target-rams" type="number" min="0" step="1" value="${siege.targets.ram}"></label>
        ${player.unlockedTechIds.has(CATAPULT_TECH_ID) ? `
          ${row('Catapults at home', `${number(siegeCount(player, 'catapult'))} · ${number(siege.inventory.catapult.bronze)} bronze / ${number(siege.inventory.catapult.iron)} iron`)}
          <label class="advisor-field"><span>Target catapults</span><input id="target-catapults" type="number" min="0" step="1" value="${siege.targets.catapult}"></label>`
          : '<p class="advisor-note">Catapults require a later torsion-artillery breakthrough. Experience building rams, mature metalwork and contact with knowledgeable neighbours make discovery possible.</p>'}
        <p class="advisor-note">Engineers use wood and metal through military procurement. Bronze equipment is more effective. A sustained campaign takes up to one engine per 100 troops; raids always leave every engine at home.</p>
        ${siege.lastWeek?.stalledReason ? `<p class="advisor-note">Production stalled: ${siege.lastWeek.stalledReason}.</p>` : ''}`
        : '<p class="advisor-note">We do not yet understand fortified warfare well enough to build siege engines.</p>')}
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
      ${section('Begin a campaign', campaignTargets.length ? `
        <label class="advisor-field"><span>Target region</span><select id="campaign-target"><option value="">Choose a known target</option>${campaignTargets.map((target) => `<option value="${target.region.id}">${target.region.name}${target.viaSea ? ' · overseas' : ''}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Objective</span><select id="campaign-objective">
          <option value="subjugation">Force surrender and loyalty</option>
          <option value="punitive">Inflict damage, then leave</option>
          <option value="devastation">Destroy the region</option>
        </select></label>
        <label class="advisor-field advisor-slider"><span>Commit <b id="campaign-share-label">60%</b> of the home army</span><input id="campaign-share" type="range" min="10" max="100" value="60"></label>
        <div id="campaign-assessment" class="advisor-note">Select a target for a supply and access assessment.</div>
        <button id="launch-campaign" class="advisor-order danger" disabled>Begin campaign</button>`
        : '<p class="advisor-note">No known region can presently be invaded. Overseas campaigns need transport capacity assigned to war.</p>')}
      ${section('Order a raid', targets.length ? `
        <label class="advisor-field"><span>Target</span><select id="council-raid-target"><option value="">Choose a known target</option>${targets.map((target) => `<option value="${target.region.id}">${target.region.name}${target.viaSea ? ' · by sea' : ''}</option>`).join('')}</select></label>
        <label class="advisor-field advisor-slider"><span>Commit <b id="council-raid-share-label">50%</b></span><input id="council-raid-share" type="range" min="0" max="100" value="50"></label>
        <div id="council-raid-assessment" class="advisor-note">Choose a target for the Marshal's assessment.</div>
        <button id="council-launch-raid" class="advisor-order danger" disabled>Launch raid</button>` : '<p class="advisor-note">There are no visible targets we can currently reach.</p>')}`;
  }

  campaignTargets(player) {
    return this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region))
      .map((region) => ({ region, ...canCampaign(player, region, this.getCampaigns(), this.regions, this.polities) }))
      .filter((entry) => entry.possible);
  }

  renderCampaignCard(campaign, player) {
    const attacker = this.regions.find((region) => region.id === campaign.attackerId);
    const defender = this.regions.find((region) => region.id === campaign.defenderId);
    const expanded = this.expandedCampaignId === campaign.id;
    const last = campaign.lastWeek;
    const objective = CAMPAIGN_OBJECTIVES[campaign.objective]?.label || campaign.objective;
    return `<article class="conflict-card">
      <button class="conflict-pressure" data-campaign-toggle="${campaign.id}">
        <span><strong>${attacker?.name || 'Unknown'} → ${defender?.name || 'Unknown'}</strong><small>${objective} · ${campaign.stage.replaceAll('_', ' ')}</small></span>
        <b>${Math.round(campaign.pressure * 100)}%</b>
        <i><span style="width:${Math.round(campaign.pressure * 100)}%"></span></i>
      </button>
      ${expanded ? `<div class="conflict-detail">
        ${row('Attacking force', number(campaign.personnel))}
        ${row('Emergency militia', number(campaign.militia))}
        ${row('Attacker morale', percent(campaign.attackerMorale), campaign.attackerMorale < .35 ? 'warning' : '')}
        ${row('Defender morale', percent(campaign.defenderMorale), campaign.defenderMorale < .35 ? 'warning' : '')}
        ${row('Supply', percent(campaign.supply), campaign.supply < .4 ? 'warning' : '')}
        ${row('Economic damage', percent(campaign.damage))}
        ${row('Siege train', `${number(siegeTrainCount(campaign.siegeEquipment))} engines`)}
        ${last ? `<p class="advisor-note">Last week: ${number(last.attackerLosses)} attacker and ${number(last.defenderLosses + last.militiaLosses)} defender losses. Relative field strength ${last.strengthRatio.toFixed(2)}×.</p>` : ''}
        ${campaign.attackerId === player.id && campaign.phase !== 'returning' ? `<button class="advisor-order" data-withdraw-campaign="${campaign.id}">Order withdrawal</button>` : ''}
        ${campaign.defenderId === player.id && campaign.phase === 'engaged' && campaign.militia <= 0 ? `<button class="advisor-order danger" data-mobilise-campaign="${campaign.id}">Mass mobilisation</button><p class="advisor-note">Call roughly 15% of available working adults into an inefficient emergency militia. Production will fall sharply until the campaign ends.</p>` : ''}
      </div>` : ''}
    </article>`;
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
    const restrictions = activeTradeRestrictions(player);
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    const actors = [...new Map(contacts.map((region) => [tradeActorId(region), region])).values()];
    const goods = Object.entries(TRADE_GOODS);
    const transit = transitPolicySummary(player, this.regions);
    const ruleLabel = (rule) => {
      const direction = rule.direction === 'trade' ? 'All trade' : rule.direction === 'import' ? 'Imports' : 'Exports';
      const goodText = rule.goods?.length ? rule.goods.map((id) => TRADE_GOODS[id]?.label || id).join(', ') : 'all goods';
      const partnerText = rule.counterparties?.length ? rule.counterparties.map((id) => actors.find((r) => tradeActorId(r) === id)?.name || id).join(', ') : 'all countries';
      return `${direction}: ${goodText} · ${partnerText}`;
    };
    return `<p class="advisor-voice">“Coin is stored labour, Majesty. I count where it comes from, and which promises are consuming it.”</p>
      ${section('Treasury', row('Treasury', number(player.treasury)) + row('Household wealth', number(player.wallet)) + row('Revenue this week', revenue.toFixed(1)) + row('Military payroll paid', percent(finance.payRatio ?? 1), (finance.payRatio ?? 1) < .9 ? 'warning' : '') + row('Administration capacity', percent(finance.stateCapacity ?? 1)))}
      ${section('Trade', row('Exports this week', number(trade.weeklyExports)) + row('Imports this week', number(trade.weeklyImports)) + row('Trade debt', `${number(trade.debt)} / ${number(trade.creditLimit)}`) + row('Known partners', number(player.tradePartnerIds?.size)))}
      ${section('Transit tolls', `
        ${row('Toll revenue this tick', (transit.tollRevenueThisTick || 0).toFixed(1))}
        <label class="advisor-field advisor-slider"><span>Road transit toll <b id="road-toll-label">${Math.round((transit.roadPolicy.rate || 0) * 100)}%</b></span><input id="road-toll-rate" type="range" min="0" max="20" value="${Math.round((transit.roadPolicy.rate || 0) * 100)}"></label>
        <label class="advisor-field"><span>Military-support allies</span><select id="road-allies-free"><option value="yes" ${transit.roadPolicy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value="no" ${transit.roadPolicy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>
        <p class="advisor-note">Road tolls apply only to merchants crossing an intermediate region with an operational road network. Repeated tolling creates bounded resentment based on the burden; it does not subtract relations forever.</p>
        ${transit.nearby.length ? transit.nearby.map((entry) => `<div class="advisor-report-row"><span>${entry.label}</span><strong>${entry.controlledByUs ? `control ${percent(entry.control)}` : 'not under our effective control'}</strong></div>
          <label class="advisor-field advisor-slider"><span>${entry.label} toll <b id="cp-toll-label-${entry.id}">${Math.round((entry.policy.rate || 0) * 100)}%</b></span><input data-cp-toll="${entry.id}" type="range" min="0" max="20" value="${Math.round((entry.policy.rate || 0) * 100)}" ${entry.controlledByUs ? '' : 'disabled'}></label>
          <label class="advisor-field"><span>${entry.label}: military-support allies</span><select data-cp-allies="${entry.id}" ${entry.controlledByUs ? '' : 'disabled'}><option value="yes" ${entry.policy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value="no" ${entry.policy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>
          <label class="advisor-field"><span>${entry.label}: passage policy</span><select data-cp-access="${entry.id}" ${entry.controlledByUs ? '' : 'disabled'}><option value="open" ${entry.policy.access === 'open' ? 'selected' : ''}>Open passage</option><option value="hostile" ${entry.policy.access === 'hostile' ? 'selected' : ''}>Interdict hostile traffic</option><option value="closed" ${entry.policy.access === 'closed' ? 'selected' : ''}>Attempt closure</option></select></label>`).join('') : '<p class="advisor-note">This region is not close enough to a major mapped maritime chokepoint to enforce passage tolls.</p>'}`)}
      ${section('Trade restrictions', `
        <p class="advisor-note">Imports are open by default. Civilian exports are open by default; military goods are closed by default. Embargoes can cover imports, exports or both. The diplomatic reaction depends on how much the restriction is expected to hurt the other realm.</p>
        <label class="advisor-field"><span>Direction</span><select id="trade-rule-direction"><option value="trade">All trade</option><option value="export">Exports only</option><option value="import">Imports only</option></select></label>
        <label class="advisor-field"><span>Goods</span><select id="trade-rule-good"><option value="*">All goods</option>${goods.map(([id, good]) => `<option value="${id}">${good.label}${good.strategic ? ' · military' : ''}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Country</span><select id="trade-rule-country"><option value="*">All countries</option>${actors.map((region) => `<option value="${tradeActorId(region)}">${region.name}</option>`).join('')}</select></label>
        <button id="add-trade-embargo" class="advisor-order danger">Prohibit trade</button>
        ${restrictions.length ? `<div class="advisor-list">${restrictions.map((rule) => `<button data-remove-trade-rule="${rule.id}"><span>${ruleLabel(rule)}</span><small>Lift restriction</small></button>`).join('')}</div>` : '<p class="advisor-note">No additional embargoes are in force.</p>'}
        <p class="advisor-note">For a list of goods or countries, add several specific rules. The underlying policy supports grouped lists as well; this phone-first control avoids awkward multi-select gestures.</p>`)}
      ${section('Later institutions', '<p class="advisor-note">The same policy engine already carries a tariff-rate field, but tariffs are not active in Bronze Age play. A later state can use this layer for customs duties without replacing the embargo system.</p>')}`;
  }

  renderSteward(player) {
    const food = (player.stockpile.food || 0);
    const construction = ensureConstruction(player);
    const active = construction.projects.find((project) => project.status === 'active');
    const type = active ? CONSTRUCTION_TYPES[active.typeId] : null;
    const requiredWork = active && type ? (active.workRequired || type.workRequired) : 0;
    const requiredMaterials = active && type ? (active.materialsRequired || type.materials) : {};
    const progress = active && type ? active.workDone / requiredWork : 0;
    const available = availableConstructionTypes(player);
    return `<p class="advisor-voice">“The realm is more than its warriors. These are the people, harvests and dangers that will still matter next winter.”</p>
      ${section('Realm at home', row('Population', number(player.population)) + row('Stability', percent(player.stability), player.stability < .6 ? 'warning' : '') + row('Safety', percent(player.safetyRating), player.safetyRating < .6 ? 'warning' : '') + row('Bandits', number(player.banditPopulation), player.banditPopulation > 50 ? 'warning' : '') + row('Food stores', number(food)))}
      ${section('This season', row('Weather', player.weather?.condition || 'normal') + row('Crop yield effect', percent(player.weather?.yieldMultiplier ?? 1)) + row('Food import dependence', percent(player.foodImportDependence || player.report?.foodPlan?.importDependence || 0)))}
      ${section('Construction', active && type ? `
        <div class="construction-project"><strong>${active.kind === 'repair' ? `Repair ${type.name}` : type.name}</strong><span>${Math.round(progress * 100)}%</span>
          <div class="construction-progress"><i style="width:${Math.round(progress * 100)}%"></i></div></div>
        ${row('Work completed', `${number(active.workDone)} / ${number(requiredWork)} worker-weeks`)}
        ${row('Builders this week', number(active.workersThisWeek))}
        ${Object.entries(requiredMaterials).map(([resource, required]) => row(`${resource.charAt(0).toUpperCase()}${resource.slice(1)} used`, `${number(active.materialsUsed[resource])} / ${number(required)}`)).join('')}
        <label class="advisor-field advisor-slider"><span>Assigned builders <b id="builder-count-label">${number(active.targetWorkers)}</b></span><input id="construction-workers" data-project-id="${active.id}" type="range" min="${type.minWorkers}" max="${type.maxWorkers}" step="5" value="${active.targetWorkers}"></label>
        <p class="advisor-note">${active.stalledReason || `${Math.ceil((requiredWork - active.workDone) / Math.max(1, active.targetWorkers))} weeks remaining at the ordered workforce, if coin and materials remain available.`}</p>
        <button class="advisor-order danger" data-cancel-project="${active.id}">Cancel project</button>`
        : available.length ? `
          <label class="advisor-field"><span>Project</span><select id="construction-type">${available.map((item) => `<option value="${item.id}">${item.name}</option>`).join('')}</select></label>
          <label class="advisor-field advisor-slider"><span>Assigned builders <b id="new-builder-count-label">100</b></span><input id="new-construction-workers" type="range" min="25" max="400" step="5" value="100"></label>
          <div id="construction-estimate" class="advisor-note"></div>
          <button id="start-construction" class="advisor-order">Commission project</button>`
        : '<p class="advisor-note">No known project is available. New forms of construction emerge through need, accumulated skill and contact with other builders.</p>')}
      ${construction.assets.length ? section('Infrastructure condition', construction.assets.map((asset) => {
        const assetType = CONSTRUCTION_TYPES[asset.typeId];
        const condition = Math.round((asset.condition || 0) * 100);
        return `<div class="advisor-report-row ${condition < 50 ? 'warning' : ''}"><span>${assetType?.name || asset.typeId}</span><strong>${condition}% · ${condition <= 20 ? 'disabled' : asset.maintenanceRatio < .95 ? 'under-maintained' : 'operational'}</strong></div>${condition < 100 && !active ? `<button class="advisor-order" data-repair-asset="${asset.id}">Repair ${assetType?.name || 'infrastructure'}</button>` : ''}`;
      }).join('') + '<p class="advisor-note">Maintenance is paid automatically. If labour, materials or treasury funds are unavailable, condition and benefits decline.</p>') : ''}`;
  }

  renderEnvoy(player) {
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    const diplomats = diplomatsFor(player);
    const authorityLabel = { observe: 'Observe only', negotiate: 'Negotiate minor agreements', military: 'Military negotiations', plenipotentiary: 'Broad plenipotentiary authority' };
    return `<p class="advisor-voice">“A letter carries your words. An envoy can carry judgement as well — if you choose how much authority to trust them with.”</p>
      ${section('Diplomatic service', diplomats.map((diplomat) => {
        const host = this.regions.find((region) => region.id === diplomat.postedRegionId);
        return `<div class="advisor-note"><strong>${diplomat.name}</strong> · ${diplomat.status.replaceAll('_',' ')}${host ? ` at ${host.name}` : ''}<br>
          Authority: ${authorityLabel[diplomat.authority] || diplomat.authority} · local familiarity ${percent(diplomat.localFamiliarity || 0)}${diplomat.compromised ? ' · reliability questioned' : ''}</div>
          <label class="advisor-field"><span>Delegated authority</span><select data-diplomat-authority="${diplomat.id}">
            ${Object.values(DIPLOMAT_AUTHORITY).map((authority) => `<option value="${authority}" ${diplomat.authority === authority ? 'selected' : ''}>${authorityLabel[authority]}</option>`).join('')}
          </select></label>
          ${['military','plenipotentiary'].includes(diplomat.authority) ? `<label class="advisor-field advisor-slider"><span>Maximum military commitment <b>${Math.round((diplomat.maxMilitaryCommitmentFraction || .2) * 100)}%</b></span><input data-diplomat-military-cap="${diplomat.id}" type="range" min="5" max="80" value="${Math.round((diplomat.maxMilitaryCommitmentFraction || .2) * 100)}"></label>` : ''}
          ${diplomat.status === 'home' && contacts.length ? `<label class="advisor-field"><span>Post to court</span><select data-diplomat-target="${diplomat.id}"><option value="">Choose court</option>${contacts.map((region) => `<option value="${region.id}">${region.name}</option>`).join('')}</select></label><button class="advisor-order" data-dispatch-diplomat="${diplomat.id}">Dispatch envoy</button>` : ''}
          ${diplomat.status === 'posted' ? `<button class="advisor-order" data-recall-diplomat="${diplomat.id}">Recall envoy</button>` : ''}`;
      }).join(''))}
      ${section('Known neighbours', contacts.length ? `<div class="advisor-list">${contacts.map((region) => `<button data-open-region="${region.id}"><span>${region.name}</span><small>${attitudeLabel(attitudeToward(region, player.id))} · inspect</small></button>`).join('')}</div>` : '<p class="advisor-note">We know of no foreign courts yet.</p>')}
      <p class="advisor-note">A resident envoy slowly learns the court and can report visible preparations. Delegated authority can speed agreements because the envoy may answer on the spot, but a ruler who grants it is accepting the risk of judgement, delay and disloyalty.</p>`;
  }

  renderPriest(player) {
    const state = player.religion;
    const entries = Object.entries(state?.shares || {}).sort((a, b) => b[1] - a[1]);
    const dominant = dominantReligion(player, this.religiousWorld);
    const official = religionById(this.religiousWorld, state?.stateReligionId);
    const leaderFaith = official?.leader ? official : dominant?.leader ? dominant : null;
    const directive = leaderFaith?.leader && this.religiousWorld.directives.find((item) =>
      item.id === leaderFaith.leader.currentDirectiveId && item.expiresTick > this.clock.tickIndex);
    const families = [...new Map(this.religiousWorld.religions.filter((religion) => religion.active &&
      religion.familyId !== leaderFaith?.familyId).map((religion) => [religion.familyId,
      religionById(this.religiousWorld, religion.familyId) || religion])).values()];
    const beliefRows = entries.map(([id, share]) => {
      const religion = religionById(this.religiousWorld, id);
      const parent = religion?.parentId ? religionById(this.religiousWorld, religion.parentId) : null;
      return row(`${religion?.name || id}${parent ? ` · branch of ${parent.name}` : ''}`, percent(share),
        id === state.stateReligionId ? 'warning' : '');
    }).join('');
    return `<p class="advisor-voice">“Belief crosses borders with merchants and refugees. A crown may guide it, Majesty, but cannot command every conscience.”</p>
      ${section('Beliefs of the realm', (beliefRows || '<p class="advisor-note">No organised tradition has been recorded.</p>') +
        row('Religious unrest', percent(state?.unrest || 0), (state?.unrest || 0) > .1 ? 'warning' : ''))}
      ${section('Crown and faith', `
        <label class="advisor-field"><span>State religion</span><select id="state-religion"><option value="none">No state religion</option>${entries.filter(([, share]) => share >= .05).map(([id]) => `<option value="${id}" ${id === state?.stateReligionId ? 'selected' : ''}>${religionById(this.religiousWorld, id)?.name || id}</option>`).join('')}</select></label>
        <label class="advisor-field advisor-slider"><span>Religious tolerance <b id="religious-tolerance-label">${percent(state?.tolerance ?? .65)}</b></span><input id="religious-tolerance" type="range" min="0" max="100" value="${Math.round((state?.tolerance ?? .65) * 100)}"></label>
        <p class="advisor-note">An official faith spreads faster. Low tolerance accelerates pressure to conform but creates more minority unrest.</p>
        ${dominant ? `<button class="advisor-order" id="fork-religion">Sponsor a new branch (25 coin)</button>` : ''}
        ${dominant && !dominant.adminCentreRegionId ? `<button class="advisor-order" id="religious-centre">Endow a religious centre</button><p class="advisor-note">Requires 5,000 local followers, 40 coin, 500 stone, 350 wood and 100 pottery.</p>` : ''}`)}
      ${section('Religious authority', leaderFaith?.leader ? `
        ${row('Religious leader', leaderFaith.leader.name)}
        ${row('Holy city', this.regions.find((region) => region.id === leaderFaith.holyCityRegionId)?.name || 'Unknown')}
        ${row('Administrative centre', this.regions.find((region) => region.id === leaderFaith.adminCentreRegionId)?.name || 'None')}
        ${row('Leader opinion of us', percent(((leaderFaith.leader.opinionOfRegions[player.id] || 0) + 1) / 2))}
        ${row('Current direction', directive ? `${directive.type === 'holy_war' ? 'Holy war against' : 'Peace with'} ${religionById(this.religiousWorld, directive.targetFamilyId)?.name || 'a rival faith'}` : 'No current direction')}
        ${families.length ? `<label class="advisor-field"><span>Faith to address</span><select id="religious-target-family">${families.map((religion) => `<option value="${religion.familyId}">${religion.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Gift and patronage</span><input id="religious-influence-spend" type="number" min="5" max="${Math.floor(player.treasury || 0)}" value="10"></label>
        <button class="advisor-order" data-religious-influence="peace">Urge peace</button>
        <button class="advisor-order danger" data-religious-influence="holy_war">Urge holy war</button>
        ${state?.lastInfluenceResult ? `<p class="advisor-note">${state.lastInfluenceResult}</p>` : ''}` : ''}`
        : '<p class="advisor-note">This tradition has no central institution or recognised leader. Its holy city can endow one once the faith is sufficiently established.</p>')}`;
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
    const newest = [...observations].sort((a, b) => (b.receivedAt ?? b.observedAt ?? -1) - (a.receivedAt ?? a.observedAt ?? -1)).slice(0, 6);
    const diplomaticIntel = [...(player.diplomaticIntelligence || [])].sort((a,b) => (b.learnedTick || 0) - (a.learnedTick || 0)).slice(0, 8);
    const ci = ensureCounterIntelligence(player);
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    return `<p class="advisor-voice">“A seal proves less than people think. We judge the messenger, the hand, the route, the motive — and whether the story fits what else we know.”</p>
      ${section('Counter-intelligence', `
        <label class="advisor-field advisor-slider"><span>Credential security <b id="ci-credentials-label">${Math.round(ci.credentialSecurity * 100)}%</b></span><input id="ci-credentials" type="range" min="0" max="100" value="${Math.round(ci.credentialSecurity * 100)}"></label>
        <label class="advisor-field advisor-slider"><span>Codes and challenge phrases <b id="ci-codes-label">${Math.round(ci.codePractice * 100)}%</b></span><input id="ci-codes" type="range" min="0" max="100" value="${Math.round(ci.codePractice * 100)}"></label>
        <label class="advisor-field advisor-slider"><span>Verification caution <b id="ci-caution-label">${Math.round(ci.verificationCaution * 100)}%</b></span><input id="ci-caution" type="range" min="0" max="100" value="${Math.round(ci.verificationCaution * 100)}"></label>
        <p class="advisor-note">Stronger authentication makes forged letters harder to pass. Excessive caution can also delay or cast doubt on genuine messages. A genuine letter can still contain a lie.</p>`)}
      ${section('Diplomatic intelligence', diplomaticIntel.length ? `<div class="intelligence-list">${diplomaticIntel.map((entry) => {
        const confidence = Number.isFinite(entry.confidence) ? ` · ${Math.round(entry.confidence * 100)}% confidence` : '';
        return `<div><strong>${String(entry.type || 'report').replaceAll('_',' ')}</strong><span>${entry.hostRegionId ? `${this.regions.find((r) => r.id === entry.hostRegionId)?.name || entry.hostRegionId} · ` : ''}${entry.authenticityVerdict ? `${entry.authenticityVerdict.replaceAll('_',' ')} · ` : ''}${entry.learnedTick != null ? `${Math.max(0, this.clock.tickIndex - entry.learnedTick)}w old` : 'undated'}${confidence}</span></div>`;
      }).join('')}</div>` : '<p class="advisor-note">No diplomatic intelligence has reached the court.</p>')}
      ${contacts.length >= 2 ? section('Deception operations', `
        <p class="advisor-note">A false plan can be a genuine letter with false content, or a forged letter pretending to come from someone else. The first is easier to authenticate and harder to disprove; the second risks exposing the forgery.</p>
        <label class="advisor-field"><span>Send false plan to</span><select id="deception-recipient"><option value="">Choose recipient</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>False target</span><select id="deception-enemy"><option value="">Choose alleged target</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>False attack in</span><input id="deception-months" type="number" min="1" max="60" value="3"> months</label>
        <button id="send-deception-letter" class="advisor-order">Send genuine false plan</button>
        <hr>
        <label class="advisor-field"><span>Forge as if sent by</span><select id="forgery-sender"><option value="">Choose purported sender</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Deliver forgery to</span><select id="forgery-recipient"><option value="">Choose recipient</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Claim they will attack</span><select id="forgery-enemy"><option value="">Choose alleged target</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <button id="send-forged-letter" class="advisor-order danger">Attempt forged letter</button>
        <div id="deception-status" class="advisor-note"></div>`): ''}
      ${section('Evidence ledger', row('Known foreign peoples', number(subjects.size)) + row('Current reports', number(observations.length)) + row('Direct contacts', number(player.knowledge?.directContactIds?.size)))}
      ${section('Recent ordinary reports', newest.length ? `<div class="intelligence-list">${newest.map((report) => { const subject = this.regions.find((r) => r.id === report.subjectId); const age = Number.isFinite(report.receivedAt) ? Math.max(0, this.clock.tickIndex - report.receivedAt) : null; return `<div><strong>${subject?.name || 'Unknown people'}</strong><span>${String(report.topic).replaceAll('_', ' ')} · ${String(report.source).replaceAll('_', ' ')}${age === null ? '' : ` · ${age}w old`}</span></div>`; }).join('')}</div>` : '<p class="advisor-note">No reports have reached the court.</p>')}`;
  }

  wireCurrent(player) {
    document.querySelectorAll('#advisor-content [data-open-region]').forEach((button) => button.addEventListener('click', () => {
      this.close(); this.openRegion(button.dataset.openRegion);
    }));
    document.querySelector('[data-open-construction]')?.addEventListener('click', () => {
      this.activeAdvisor = 'steward'; this.render();
    });
    const roadToll = document.getElementById('road-toll-rate');
    const roadAllies = document.getElementById('road-allies-free');
    const updateRoadToll = () => {
      if (!roadToll) return;
      setRoadTollPolicy(player, { rate: Number(roadToll.value) / 100, alliesFree: roadAllies?.value !== 'no' });
      const label = document.getElementById('road-toll-label'); if (label) label.textContent = `${roadToll.value}%`;
    };
    roadToll?.addEventListener('input', updateRoadToll); roadAllies?.addEventListener('change', updateRoadToll);
    document.querySelectorAll('[data-cp-toll]').forEach((input) => input.addEventListener('input', () => {
      const id = input.dataset.cpToll;
      const allies = document.querySelector(`[data-cp-allies="${id}"]`);
      const access = document.querySelector(`[data-cp-access="${id}"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input.value) / 100, alliesFree: allies?.value !== 'no', access: access?.value || 'open' });
      const label = document.getElementById(`cp-toll-label-${id}`); if (label) label.textContent = `${input.value}%`;
    }));
    document.querySelectorAll('[data-cp-allies]').forEach((select) => select.addEventListener('change', () => {
      const id = select.dataset.cpAllies;
      const input = document.querySelector(`[data-cp-toll="${id}"]`);
      const access = document.querySelector(`[data-cp-access="${id}"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: select.value !== 'no', access: access?.value || 'open' });
    }));
    document.querySelectorAll('[data-cp-access]').forEach((select) => select.addEventListener('change', () => {
      const id = select.dataset.cpAccess;
      const input = document.querySelector(`[data-cp-toll="${id}"]`);
      const allies = document.querySelector(`[data-cp-allies="${id}"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: allies?.value !== 'no', access: select.value });
    }));
    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
      const direction = document.getElementById('trade-rule-direction')?.value || 'trade';
      const good = document.getElementById('trade-rule-good')?.value || '*';
      const country = document.getElementById('trade-rule-country')?.value || '*';
      setTradeRestriction(player, {
        direction, goods: good === '*' ? null : [good],
        counterparties: country === '*' ? null : [country], allowed: false,
      }, this.regions, this.clock.tickIndex);
      this.render(false);
    });
    document.querySelectorAll('[data-remove-trade-rule]').forEach((button) => button.addEventListener('click', () => {
      removeTradeRestriction(player, button.dataset.removeTradeRule, this.regions, this.clock.tickIndex);
      this.render(false);
    }));
    const activeWorkers = document.getElementById('construction-workers');
    activeWorkers?.addEventListener('input', () => {
      setConstructionWorkers(player, activeWorkers.dataset.projectId, activeWorkers.value);
      document.getElementById('builder-count-label').textContent = number(activeWorkers.value);
    });
    document.querySelector('[data-cancel-project]')?.addEventListener('click', (event) => {
      if (window.confirm('Cancel this project? Materials and wages already spent will not be recovered.')) {
        cancelConstruction(player, event.currentTarget.dataset.cancelProject); this.render(false);
      }
    });
    document.querySelectorAll('[data-repair-asset]').forEach((button) => button.addEventListener('click', () => {
      if (startRepair(player, button.dataset.repairAsset, 50, this.clock.tickIndex)) this.render(false);
    }));
    document.getElementById('state-religion')?.addEventListener('change', (event) => {
      setStateReligion(player, event.target.value, this.religiousWorld); this.render(false);
    });
    const tolerance = document.getElementById('religious-tolerance');
    tolerance?.addEventListener('input', () => {
      setReligiousTolerance(player, Number(tolerance.value) / 100, this.religiousWorld);
      document.getElementById('religious-tolerance-label').textContent = `${tolerance.value}%`;
    });
    document.getElementById('fork-religion')?.addEventListener('click', () => {
      const name = window.prompt('Name the new religious branch:', `${player.name} Reform`);
      if (name && forkReligion(player, this.religiousWorld, this.clock.tickIndex, name.slice(0, 60))) this.render(false);
    });
    document.getElementById('religious-centre')?.addEventListener('click', () => {
      const religion = dominantReligion(player, this.religiousWorld);
      if (religion && establishReligiousCentre(player, this.religiousWorld, religion.id)) this.render(false);
    });
    document.querySelectorAll('[data-religious-influence]').forEach((button) => button.addEventListener('click', () => {
      const religion = religionById(this.religiousWorld, player.religion.stateReligionId) || dominantReligion(player, this.religiousWorld);
      const family = document.getElementById('religious-target-family')?.value;
      const spend = document.getElementById('religious-influence-spend')?.value;
      if (religion) {
        const result = influenceReligiousLeader(player, this.religiousWorld, religion.id,
          button.dataset.religiousInfluence, family, spend, this.clock.tickIndex);
        player.religion.lastInfluenceResult = result.accepted
          ? 'The religious leader has adopted your proposed direction.'
          : 'Your gifts were accepted, but the religious leader was not persuaded.';
      }
      this.render(false);
    }));
    const newType = document.getElementById('construction-type');
    const newWorkers = document.getElementById('new-construction-workers');
    const startProject = document.getElementById('start-construction');
    if (newType && newWorkers && startProject) {
      const assess = () => {
        const type = CONSTRUCTION_TYPES[newType.value];
        newWorkers.min = type.minWorkers; newWorkers.max = type.maxWorkers;
        const estimate = constructionEstimate(player, type.id, newWorkers.value);
        document.getElementById('new-builder-count-label').textContent = number(estimate.workers);
        const materials = Object.entries(estimate.materials).map(([resource, amount]) => `${number(amount)} ${resource}`).join(' · ');
        document.getElementById('construction-estimate').textContent = `${type.description} ${estimate.weeks} weeks · ${materials} · about ${estimate.totalCost.toFixed(1)} coin at current prices (${estimate.wages.toFixed(1)} wages, ${estimate.supplies.toFixed(1)} supplies). Doubling labour halves time only between ${type.minWorkers} and ${type.maxWorkers} builders.`;
      };
      newType.addEventListener('change', assess); newWorkers.addEventListener('input', assess); assess();
      startProject.addEventListener('click', () => {
        if (startConstruction(player, newType.value, newWorkers.value, this.clock.tickIndex)) this.render(false);
      });
    }
    const ramTarget = document.getElementById('target-rams');
    const catapultTarget = document.getElementById('target-catapults');
    ramTarget?.addEventListener('change', () => setSiegeTarget(player, 'ram', ramTarget.value));
    catapultTarget?.addEventListener('change', () => setSiegeTarget(player, 'catapult', catapultTarget.value));
    document.querySelectorAll('[data-diplomat-authority]').forEach((select) => select.addEventListener('change', () => {
      const diplomatId = select.dataset.diplomatAuthority;
      const cap = document.querySelector(`[data-diplomat-military-cap="${diplomatId}"]`);
      setDiplomatAuthority(player, diplomatId, select.value, { maxMilitaryCommitmentFraction: Number(cap?.value || 20) / 100 });
      this.render(false);
    }));
    document.querySelectorAll('[data-diplomat-military-cap]').forEach((input) => input.addEventListener('change', () => {
      const diplomat = diplomatsFor(player).find((d) => d.id === input.dataset.diplomatMilitaryCap);
      if (diplomat) setDiplomatAuthority(player, diplomat.id, diplomat.authority, { maxMilitaryCommitmentFraction: Number(input.value) / 100 });
      this.render(false);
    }));
    document.querySelectorAll('[data-dispatch-diplomat]').forEach((button) => button.addEventListener('click', () => {
      const targetId = document.querySelector(`[data-diplomat-target="${button.dataset.dispatchDiplomat}"]`)?.value;
      const target = this.regions.find((region) => region.id === targetId);
      if (target) dispatchDiplomat(player, target, this.regions, button.dataset.dispatchDiplomat, this.clock.tickIndex);
      this.render(false);
    }));
    document.querySelectorAll('[data-recall-diplomat]').forEach((button) => button.addEventListener('click', () => {
      recallDiplomat(player, button.dataset.recallDiplomat, this.regions, this.clock.tickIndex);
      this.render(false);
    }));
    const updateCi = () => {
      const credentials = document.getElementById('ci-credentials');
      const codes = document.getElementById('ci-codes');
      const caution = document.getElementById('ci-caution');
      if (!credentials || !codes || !caution) return;
      setCounterIntelligencePolicy(player, { credentialSecurity: Number(credentials.value) / 100, codePractice: Number(codes.value) / 100, verificationCaution: Number(caution.value) / 100 });
      document.getElementById('ci-credentials-label').textContent = `${credentials.value}%`;
      document.getElementById('ci-codes-label').textContent = `${codes.value}%`;
      document.getElementById('ci-caution-label').textContent = `${caution.value}%`;
    };
    ['ci-credentials','ci-codes','ci-caution'].forEach((id) => document.getElementById(id)?.addEventListener('input', updateCi));
    document.getElementById('send-deception-letter')?.addEventListener('click', () => {
      const recipient = this.regions.find((r) => r.id === document.getElementById('deception-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('deception-enemy')?.value);
      const status = document.getElementById('deception-status');
      if (!recipient || !enemy || recipient.id === enemy.id) { if (status) status.textContent = 'Choose two different foreign courts.'; return; }
      const months = Math.max(1, Number(document.getElementById('deception-months')?.value) || 3);
      const result = sendDeceptionJointOperationLetter(player, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + Math.round(months * 4.345), secrecy: .12 });
      if (status) status.textContent = result.sent ? 'False operational letter dispatched with genuine credentials.' : `Could not send (${result.reason}).`;
    });
    document.getElementById('send-forged-letter')?.addEventListener('click', () => {
      const purported = this.regions.find((r) => r.id === document.getElementById('forgery-sender')?.value);
      const recipient = this.regions.find((r) => r.id === document.getElementById('forgery-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('forgery-enemy')?.value);
      const status = document.getElementById('deception-status');
      if (!purported || !recipient || !enemy || purported.id === recipient.id) { if (status) status.textContent = 'Choose a purported sender, a different recipient and an alleged target.'; return; }
      const result = sendForgedJointOperationLetter(player, purported, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + 13 });
      if (status) status.textContent = result.sent ? 'Forged letter dispatched. Whether it survives scrutiny is unknown.' : `Could not send (${result.reason}).`;
    });
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
    document.querySelectorAll('[data-campaign-toggle]').forEach((button) => button.addEventListener('click', () => {
      const id = Number(button.dataset.campaignToggle);
      this.expandedCampaignId = this.expandedCampaignId === id ? null : id;
      this.render(false);
    }));
    document.querySelectorAll('[data-withdraw-campaign]').forEach((button) => button.addEventListener('click', () => {
      const campaign = this.getCampaigns().find((item) => item.id === Number(button.dataset.withdrawCampaign));
      requestCampaignWithdrawal(campaign); this.render(false);
    }));
    document.querySelectorAll('[data-mobilise-campaign]').forEach((button) => button.addEventListener('click', () => {
      const campaign = this.getCampaigns().find((item) => item.id === Number(button.dataset.mobiliseCampaign));
      if (campaign) massMobiliseDefender(campaign, player, 0.15);
      this.render(false);
    }));
    const campaignTarget = document.getElementById('campaign-target');
    const campaignObjective = document.getElementById('campaign-objective');
    const campaignShare = document.getElementById('campaign-share');
    const campaignLaunch = document.getElementById('launch-campaign');
    if (campaignTarget && campaignShare && campaignLaunch) {
      const assessCampaign = () => {
        const shareValue = Number(campaignShare.value) / 100;
        document.getElementById('campaign-share-label').textContent = `${campaignShare.value}%`;
        const chosen = this.campaignTargets(player).find((entry) => entry.region.id === campaignTarget.value);
        if (!chosen) { campaignLaunch.disabled = true; return; }
        let troops = Math.floor(player.army.personnel * shareValue);
        if (chosen.viaSea) troops = Math.min(troops, chosen.seaCapacity);
        document.getElementById('campaign-assessment').textContent = `${number(troops)} troops can depart for ${chosen.region.name}${chosen.viaSea ? ' by sea; fleet capacity limits the force' : ''}. The defender will fight with a strong home advantage.`;
        campaignLaunch.disabled = troops < 25;
      };
      campaignTarget.addEventListener('change', assessCampaign);
      campaignShare.addEventListener('input', assessCampaign);
      campaignObjective.addEventListener('change', assessCampaign);
      campaignLaunch.addEventListener('click', () => {
        const chosen = this.campaignTargets(player).find((entry) => entry.region.id === campaignTarget.value);
        if (!chosen) return;
        const campaign = launchCampaign(player, chosen.region, campaignObjective.value,
          Math.floor(player.army.personnel * Number(campaignShare.value) / 100), this.clock.tickIndex,
          { campaigns: this.getCampaigns(), regions: this.regions, polities: this.polities });
        if (campaign) { this.addCampaign(campaign); this.expandedCampaignId = campaign.id; this.render(false); }
      });
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
