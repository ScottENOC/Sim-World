from pathlib import Path


def once(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise RuntimeError(f'missing anchor: {label}')
    return text.replace(old, new, 1)

# Region defaults -----------------------------------------------------------
p = Path('js/world/region.js')
s = p.read_text()
s = once(s,
"    this.militaryInstitutions = { officerSchoolProgress: 0, officerSchoolActive: false };",
"    this.militaryInstitutions = { officerSchoolProgress: 0, officerSchoolActive: false };\n    // Rulers set enduring strategic intent; the military planner derives the\n    // establishment and recruitment target instead of asking for a troop count.\n    this.militaryStrategy = { posture: 'peace', targetRegionId: null, targetPolityId: null,\n      garrisonFloor: 1, spendingPriority: 0.45, desiredPreparationWeeks: 26, secrecy: 0.35,\n      vassalAssumption: 'conservative', allyAssumption: 'conservative', planReport: {} };\n    this.diplomaticMessages = [];",
'military strategy defaults')
p.write_text(s)

# NPCs use the same planner --------------------------------------------------
p = Path('js/ai/nationAi.js')
s = p.read_text()
s = once(s,
"import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';",
"import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';\nimport { chooseNpcMilitaryStrategy } from '../military/strategicPlanning.js?v=20260908-strategy1';",
'planner import')
s = once(s,
"    chooseAiMilitaryPolicies(region);\n    setMilitaryTargets(region);",
"    chooseAiMilitaryPolicies(region);\n    chooseNpcMilitaryStrategy(region, regions, agreements, polities, currentTick, activeCampaigns);",
'NPC planner call')
p.write_text(s)

# Main integration -----------------------------------------------------------
p = Path('js/main.js')
s = p.read_text()
s = once(s,
"import { tickTransitControl } from './economy/transitTolls.js?v=20260907-transit1';",
"import { tickTransitControl } from './economy/transitTolls.js?v=20260907-transit1';\nimport { MILITARY_POSTURES, ensureMilitaryStrategy, reviewMilitaryStrategy, setMilitaryStrategy } from './military/strategicPlanning.js?v=20260908-strategy1';\nimport { sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260908-couriers1';",
'main planning imports')

s = once(s,
"    syncNextFleetIds(fleets);\n    syncRegionalNavyLedger(regions, fleets);",
"    syncNextFleetIds(fleets);\n    syncRegionalNavyLedger(regions, fleets);\n    syncNextDiplomaticMessageId(regions);",
'sync courier ids')

s = once(s,
"    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);",
"    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);\n    const diplomacyEvents = tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays);\n    const playerCapitalForPlan = regionsById.get(playerRegionId);\n    if (playerCapitalForPlan) reviewMilitaryStrategy(playerCapitalForPlan, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeek });",
'courier tick and player plan review')

s = once(s,
"      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),",
"      ...diplomacyEvents.filter((event) => event.agreement.fromId === playerRegionId || event.agreement.toId === playerRegionId),\n      ...courierEvents.filter((event) => {\n        const message = event.message;\n        return message && (message.senderActorId === activePlayerPolityId || message.targetActorId === activePlayerPolityId || event.interceptingActorId === activePlayerPolityId);\n      }),",
'courier player events')

# Replace direct troop target with strategic controls. -----------------------
old = """    <label class=\"control-row\">Target army size
      <input type=\"number\" min=\"0\" step=\"100\" id=\"input-army\" value=\"${Math.round(region.targetArmySize)}\">
    </label>
    <label class=\"control-row\">Target navy size (boats)"""
new = """    <div class=\"raid-section military-strategy-section\">
      <strong>Military strategy</strong>
      <label class=\"control-row\">Posture
        <select id=\"military-posture\">
          <option value=\"peace\" ${ensureMilitaryStrategy(region).posture === 'peace' ? 'selected' : ''}>Peace — local defence</option>
          <option value=\"guarded\" ${ensureMilitaryStrategy(region).posture === 'guarded' ? 'selected' : ''}>Guarded</option>
          <option value=\"prepare_war\" ${ensureMilitaryStrategy(region).posture === 'prepare_war' ? 'selected' : ''}>Prepare for war</option>
          <option value=\"mobilise_war\" ${ensureMilitaryStrategy(region).posture === 'mobilise_war' ? 'selected' : ''}>Mobilise for war</option>
          <option value=\"emergency_defence\" ${ensureMilitaryStrategy(region).posture === 'emergency_defence' ? 'selected' : ''}>Emergency defence</option>
        </select>
      </label>
      <label class=\"control-row\">War planning target
        <select id=\"military-plan-target\"><option value=\"\">— none —</option>${diplomaticTargets.map((target) => `<option value=\"${target.id}\" ${ensureMilitaryStrategy(region).targetRegionId === target.id ? 'selected' : ''}>${target.name}</option>`).join('')}</select>
      </label>
      <label class=\"control-row\">Minimum normal garrisons <span id=\"garrison-floor-label\">${Math.round(ensureMilitaryStrategy(region).garrisonFloor * 100)}%</span>
        <input type=\"range\" id=\"military-garrison-floor\" min=\"10\" max=\"100\" value=\"${Math.round(ensureMilitaryStrategy(region).garrisonFloor * 100)}\">
      </label>
      <label class=\"control-row\">Military spending priority <span id=\"military-spending-label\">${Math.round(ensureMilitaryStrategy(region).spendingPriority * 100)}%</span>
        <input type=\"range\" id=\"military-spending-priority\" min=\"10\" max=\"100\" value=\"${Math.round(ensureMilitaryStrategy(region).spendingPriority * 100)}\">
      </label>
      <label class=\"control-row\">Desired preparation time (weeks)
        <input type=\"number\" id=\"military-prep-weeks\" min=\"4\" max=\"260\" step=\"4\" value=\"${ensureMilitaryStrategy(region).desiredPreparationWeeks}\">
      </label>
      <label class=\"control-row\">Assume vassal help
        <select id=\"military-vassal-assumption\">${['none','conservative','normal','optimistic'].map((v) => `<option value=\"${v}\" ${ensureMilitaryStrategy(region).vassalAssumption === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <label class=\"control-row\">Assume ally help
        <select id=\"military-ally-assumption\">${['none','conservative','normal','optimistic'].map((v) => `<option value=\"${v}\" ${ensureMilitaryStrategy(region).allyAssumption === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </label>
      <div id=\"military-plan-report\" class=\"raid-status\"></div>
    </div>
    <label class=\"control-row\">Target navy size (boats)"""
s = once(s, old, new, 'strategic military UI')

old_listener = """  document.getElementById('input-army').addEventListener('change', (e) => {
    region.targetArmySize = Math.max(0, Number(e.target.value) || 0);
  });

  document.getElementById('input-navy').addEventListener('change', (e) => {"""
new_listener = """  const refreshMilitaryPlan = () => {
    const strategy = setMilitaryStrategy(region, {
      posture: document.getElementById('military-posture')?.value || 'peace',
      targetRegionId: document.getElementById('military-plan-target')?.value || null,
      garrisonFloor: (Number(document.getElementById('military-garrison-floor')?.value) || 100) / 100,
      spendingPriority: (Number(document.getElementById('military-spending-priority')?.value) || 45) / 100,
      desiredPreparationWeeks: Number(document.getElementById('military-prep-weeks')?.value) || 26,
      vassalAssumption: document.getElementById('military-vassal-assumption')?.value || 'conservative',
      allyAssumption: document.getElementById('military-ally-assumption')?.value || 'conservative',
    });
    const report = reviewMilitaryStrategy(region, { regions, polities, agreements, activeCampaigns: window.__worldsim?.activeCampaigns || [], currentTick: calendarWeekIndex(clock.elapsedDays || 0) });
    const garrisonLabel = document.getElementById('garrison-floor-label');
    const spendingLabel = document.getElementById('military-spending-label');
    if (garrisonLabel) garrisonLabel.textContent = `${Math.round(strategy.garrisonFloor * 100)}%`;
    if (spendingLabel) spendingLabel.textContent = `${Math.round(strategy.spendingPriority * 100)}%`;
    const status = document.getElementById('military-plan-report');
    if (status) status.innerHTML = `Authorised establishment: ${report.establishment.toLocaleString()} · current ${report.currentPersonnel.toLocaleString()}<br>` +
      `Normal garrisons ${report.normalGarrison.toLocaleString()} → retain ${report.retainedGarrison.toLocaleString()} · desired field army ${report.desiredFieldArmy.toLocaleString()}<br>` +
      `Expected support: vassals ${report.expectedVassalSupport.toLocaleString()} / nominal ${report.nominalVassalSupport.toLocaleString()}, allies ${report.expectedAllySupport.toLocaleString()} / nominal ${report.nominalAllySupport.toLocaleString()}` +
      (report.targetName ? `<br>Plan against ${report.targetName}: estimated opposing force ${report.estimatedEnemy.toLocaleString()} (uncertainty ±${Math.round(report.enemyUncertainty * 100)}%)${report.viaSea ? ' · overseas operation' : ''}` : '');
  };
  ['military-posture','military-plan-target','military-garrison-floor','military-spending-priority','military-prep-weeks','military-vassal-assumption','military-ally-assumption']
    .forEach((id) => document.getElementById(id)?.addEventListener(id.includes('floor') || id.includes('priority') ? 'input' : 'change', refreshMilitaryPlan));
  refreshMilitaryPlan();

  document.getElementById('input-navy').addEventListener('change', (e) => {"""
s = once(s, old_listener, new_listener, 'strategic military listeners')

# Add join-war controls/action. ------------------------------------------------
s = once(s,
"              <option value=\"resource_access\">Claim wood-harvesting rights</option>\n              <option value=\"vassalage\">Demand submission as a vassal</option>",
"              <option value=\"resource_access\">Claim wood-harvesting rights</option>\n              <option value=\"join_war\">Ask them to join a war</option>\n              <option value=\"vassalage\">Demand submission as a vassal</option>",
'join war action')

s = once(s,
"          <label class=\"control-row\" id=\"support-personnel-row\">Troops to send\n            <input type=\"number\" min=\"10\" step=\"10\" id=\"support-personnel\" value=\"${Math.max(10, Math.floor(region.army.personnel * 0.1))}\">\n          </label>",
"          <label class=\"control-row\" id=\"support-personnel-row\">Troops / requested contribution\n            <input type=\"number\" min=\"10\" step=\"10\" id=\"support-personnel\" value=\"${Math.max(10, Math.floor(region.army.personnel * 0.1))}\">\n          </label>\n          <label class=\"control-row hidden\" id=\"war-enemy-row\">Ask them to fight\n            <select id=\"war-enemy\"><option value=\"\">— select enemy —</option>${regions.filter((candidate) => candidate.id !== region.id && fogOfWar.isVisible(candidate)).map((candidate) => `<option value=\"${candidate.id}\">${candidate.name}</option>`).join('')}</select>\n          </label>",
'join war enemy control')

s = once(s,
"      supportRow.classList.toggle('hidden', diplomacyAction.value !== 'military_support');",
"      supportRow.classList.toggle('hidden', !['military_support','join_war'].includes(diplomacyAction.value));\n      document.getElementById('war-enemy-row')?.classList.toggle('hidden', diplomacyAction.value !== 'join_war');",
'join war row toggle')

old_click = """      const result = diplomacyAction.value === 'vassalage'
        ? demandVassalage(region, target, polities, toolTypes, clock.tickIndex, regions)
        : proposeAgreement(diplomacyAction.value, region, target, agreements, toolTypes,
          clock.tickIndex, { personnel: Number(document.getElementById('support-personnel')?.value) || 0 });
      document.getElementById('diplomacy-info').textContent = result.accepted
        ? `${target.name} accepted the agreement.`
        : `The proposal failed (${String(result.reason).replaceAll('_', ' ')}).`;
      if (result.accepted) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);"""
new_click = """      let result;
      if (diplomacyAction.value === 'join_war') {
        const enemy = regions.find((candidate) => candidate.id === document.getElementById('war-enemy')?.value);
        if (!enemy) { document.getElementById('diplomacy-info').textContent = 'Choose which enemy you want them to fight.'; return; }
        result = sendWarInvitation(region, target, enemy, regions, calendarWeekIndex(clock.elapsedDays || 0), {
          requestedPersonnel: Number(document.getElementById('support-personnel')?.value) || 0,
          secrecy: ensureMilitaryStrategy(region).secrecy,
        });
        document.getElementById('diplomacy-info').textContent = result.sent
          ? `Courier dispatched to ${target.name}. Expected arrival around week ${result.message.arrivalTick}; the message may be delayed, intercepted or exposed en route.`
          : `Could not dispatch the request (${String(result.reason).replaceAll('_', ' ')}).`;
        return;
      }
      result = diplomacyAction.value === 'vassalage'
        ? demandVassalage(region, target, polities, toolTypes, clock.tickIndex, regions)
        : proposeAgreement(diplomacyAction.value, region, target, agreements, toolTypes,
          clock.tickIndex, { personnel: Number(document.getElementById('support-personnel')?.value) || 0 });
      document.getElementById('diplomacy-info').textContent = result.accepted
        ? `${target.name} accepted the agreement.`
        : `The proposal failed (${String(result.reason).replaceAll('_', ' ')}).`;
      if (result.accepted) renderRegionControls(region, regions, polities, clock, activeRaids, agreements, playerRegionId, fogOfWar, toolTypes);"""
s = once(s, old_click, new_click, 'join war click')

# Initial player strategy is calculated as soon as a region is chosen. --------
s = once(s,
"    activePlayerPolityId = chosen.polityId || chosen.governance?.localPolityId || chosen.governance?.sovereignPolityId;\n    fogOfWar.setPlayerRegion(chosen.id);",
"    activePlayerPolityId = chosen.polityId || chosen.governance?.localPolityId || chosen.governance?.sovereignPolityId;\n    fogOfWar.setPlayerRegion(chosen.id);\n    reviewMilitaryStrategy(chosen, { regions, polities, agreements, activeCampaigns, currentTick: calendarWeekIndex(clock.elapsedDays || 0) });",
'initial player strategy')

# Courier event rendering -----------------------------------------------------
s = once(s,
"  if (event.type === 'fleet_contact') {",
"  if (event.type === 'diplomatic_message_intercepted') {\n    document.getElementById('event-title').textContent = event.destroyed ? 'Diplomatic courier lost' : 'Secret message compromised';\n    document.getElementById('event-body').textContent = event.destroyed\n      ? 'A diplomatic courier carrying war plans was intercepted and the message never reached its destination. The enemy may now know something of your intentions.'\n      : 'A diplomatic courier was intercepted or searched en route. The message continued, but your intended war and requested alliance may no longer be secret.';\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'join_war_response') {\n    document.getElementById('event-title').textContent = event.accepted ? 'Ally joins the war' : 'War request refused';\n    document.getElementById('event-body').textContent = event.accepted\n      ? `${event.targetName} has agreed to join the war against ${event.enemyName}. Their commitment is now part of your general's planning assumptions, but actual troops still have to be mobilised and moved.`\n      : `${event.targetName} has refused to join the war against ${event.enemyName}. Your general will no longer count on that promised contribution.`;\n    wireEventContinue(clock, eventQueue); return;\n  }\n  if (event.type === 'fleet_contact') {",
'courier event rendering')

p.write_text(s)
print('strategic military planning integration applied')
