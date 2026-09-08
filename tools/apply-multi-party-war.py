from pathlib import Path

def replace(path, old, new):
    p=Path(path); text=p.read_text()
    if old not in text:
        raise SystemExit(f'anchor missing in {path}: {old[:80]!r}')
    p.write_text(text.replace(old,new,1))

# campaigns: permit multiple belligerents against the same theatre while preventing duplicate pair campaigns
p=Path('js/military/campaigns.js'); text=p.read_text()
old="""  if (campaigns.some((campaign) => !campaign.completed &&\n      [campaign.attackerId, campaign.defenderId].some((id) => id === attacker.id || id === defender.id))) {\n    return { possible: false, reason: 'already_at_war' };\n  }"""
new="""  if (campaigns.some((campaign) => !campaign.completed &&\n      campaign.attackerId === attacker.id && campaign.defenderId === defender.id)) {\n    return { possible: false, reason: 'already_campaigning_target' };\n  }"""
if old not in text: raise SystemExit('campaign guard anchor missing')
p.write_text(text.replace(old,new,1))

# save/load active war theatres
p=Path('js/core/saveGame.js'); text=p.read_text()
text=text.replace("activeRaids, activeCampaigns, fleets = [], clock", "activeRaids, activeCampaigns, activeWars = [], fleets = [], clock", 1)
text=text.replace("activeRaids: encode(activeRaids), activeCampaigns: encode(activeCampaigns), fleets: encode(fleets),", "activeRaids: encode(activeRaids), activeCampaigns: encode(activeCampaigns), activeWars: encode(activeWars), fleets: encode(fleets),", 1)
text=text.replace("activeRaids, activeCampaigns, fleets = null, clock", "activeRaids, activeCampaigns, activeWars = null, fleets = null, clock", 1)
text=text.replace("activeCampaigns.splice(0, activeCampaigns.length, ...decode(snapshot.activeCampaigns || []));", "activeCampaigns.splice(0, activeCampaigns.length, ...decode(snapshot.activeCampaigns || []));\n  if (activeWars) activeWars.splice(0, activeWars.length, ...decode(snapshot.activeWars || []));", 1)
p.write_text(text)

# main imports/state/tick/save/events
p=Path('js/main.js'); text=p.read_text()
anchor="import { sendWarInvitation, syncNextDiplomaticMessageId, tickDiplomaticCouriers } from './diplomacy/couriers.js?v=20260908-couriers1';"
text=text.replace(anchor, anchor+"\nimport { WAR_STANCES, participantInWar, setEnemyPriority, setWarStance, syncNextWarId, syncWarTheatres } from './military/warTheatres.js?v=20260908-war1';",1)
text=text.replace("  let activeCampaigns = [];\n  let fleets", "  let activeCampaigns = [];\n  let activeWars = [];\n  let fleets",1)
text=text.replace("restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, fleets, clock, fogOfWar })", "restoreGameSnapshot(snapshot, { regions, seaRegions, polities, religiousWorld, agreements, activeRaids, activeCampaigns, activeWars, fleets, clock, fogOfWar })",1)
text=text.replace("    syncNextCampaignId(activeCampaigns);", "    syncNextCampaignId(activeCampaigns);\n    syncNextWarId(activeWars);",1)
text=text.replace("    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);", "    const courierEvents = tickDiplomaticCouriers(regions, agreements, fleets, calendarWeek, time.elapsedDays, Math.random);\n    const warEvents = syncWarTheatres(activeWars, activeCampaigns, regions, agreements, calendarWeek);\n    preparePlayerWarEntryEvents(warEvents, activeWars, activePlayerPolityId, regions);",1)
text=text.replace("      ...courierEvents.filter((event) => {", "      ...warEvents.filter((event) => event.playerInvolved),\n      ...courierEvents.filter((event) => {",1)
text=text.replace("    get activeCampaigns() { return activeCampaigns; },", "    get activeCampaigns() { return activeCampaigns; },\n    get activeWars() { return activeWars; },",1)
# menu save call
text=text.replace("activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), fleets: window.__worldsim?.fleets || [],", "activeRaids: getActiveRaids(), activeCampaigns: getActiveCampaigns(), activeWars: window.__worldsim?.activeWars || [], fleets: window.__worldsim?.fleets || [],",1)

# insert helper before showNextEvent
helper=r'''
function actorRegion(regions, actorId) {
  return regions.find((region) => (region.governance?.sovereignPolityId || region.controllingActorId || region.id) === actorId) || null;
}

function preparePlayerWarEntryEvents(events, wars, playerActorId, regions) {
  if (!playerActorId) return;
  for (const event of events) {
    if (event.type !== 'war_participant_joined') continue;
    const war = wars.find((candidate) => candidate.id === event.warId);
    const player = participantInWar(war, playerActorId);
    if (!war || !player) continue;
    event.playerInvolved = true;
    event.war = war;
    event.entrantName = actorRegion(regions, event.actorId)?.name || event.actorId;
    event.playerIsEntrant = event.actorId === playerActorId;
    const entrant = participantInWar(war, event.actorId);
    const counterpart = event.playerIsEntrant
      ? war.participants.find((p) => p.actorId !== playerActorId && p.sideId === entrant?.sideId)
      : entrant;
    event.sameSide = counterpart ? counterpart.sideId === player.sideId : false;
    event.resolveWarEntry = (choice) => {
      const others = war.participants.filter((p) => p.actorId !== playerActorId);
      const primaryEnemy = others.find((p) => p.sideId !== player.sideId)?.actorId || others[0]?.actorId;
      if (choice === 'cooperate') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId,
          other.sideId === player.sideId ? WAR_STANCES.COOPERATE : WAR_STANCES.HOSTILE);
      } else if (choice === 'cobelligerent') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId,
          other.sideId === player.sideId ? WAR_STANCES.COBELLIGERENT : WAR_STANCES.HOSTILE);
      } else if (choice === 'avoid_entrant') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.AVOID);
      } else if (choice === 'fight_all_primary') {
        for (const other of others) setWarStance(war, playerActorId, other.actorId, WAR_STANCES.HOSTILE);
        if (primaryEnemy) setEnemyPriority(war, playerActorId, primaryEnemy, 0.8);
      } else if (choice === 'prioritise_entrant') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.HOSTILE);
        setEnemyPriority(war, playerActorId, event.actorId, 0.85);
      } else if (choice === 'prioritise_existing') {
        setWarStance(war, playerActorId, event.actorId, WAR_STANCES.HOSTILE);
        if (primaryEnemy && primaryEnemy !== event.actorId) setEnemyPriority(war, playerActorId, primaryEnemy, 0.85);
      }
      return war;
    };
  }
}

'''
text=text.replace("function showNextEvent(clock, eventQueue) {", helper+"function showNextEvent(clock, eventQueue) {",1)
# event UI branch
branch=r'''  if (event.type === 'war_participant_joined') {
    const options = document.getElementById('event-options');
    document.getElementById('event-title').textContent = `${event.entrantName} enters the war`;
    document.getElementById('event-body').textContent = event.playerIsEntrant
      ? `Your state has entered an existing multi-party war. Decide how your armies should treat the other belligerents; sharing an enemy does not automatically make another army your ally.`
      : `${event.entrantName} has entered a war in which you are already fighting. Decide whether to coordinate, avoid them, or treat them as another enemy. These orders also guide how your generals divide effort between fronts.`;
    const choices = event.sameSide
      ? [['cooperate','Coordinate as allies'],['cobelligerent','Fight the common enemy independently'],['avoid_entrant','Avoid their forces'],['prioritise_entrant','Treat them as hostile']]
      : [['prioritise_existing','Fight both; prioritise existing enemy'],['prioritise_entrant','Fight both; prioritise newcomer'],['avoid_entrant','Avoid the newcomer if possible'],['fight_all_primary','Fight all belligerents']];
    options.innerHTML = choices.map(([id,label]) => `<button data-war-choice="${id}">${label}</button>`).join(' ');
    document.getElementById('event-modal').classList.remove('hidden');
    options.querySelectorAll('[data-war-choice]').forEach((button) => button.addEventListener('click', () => {
      event.resolveWarEntry?.(button.dataset.warChoice);
      document.getElementById('event-modal').classList.add('hidden');
      if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
    }));
    return;
  }
'''
text=text.replace("  if (event.type === 'diplomatic_message_intercepted') {", branch+"  if (event.type === 'diplomatic_message_intercepted') {",1)
p.write_text(text)
