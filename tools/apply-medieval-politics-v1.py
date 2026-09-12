from pathlib import Path

p = Path('js/main.js')
s = p.read_text()

old = "import { availableVassalLevies, changeGovernanceForm, demandVassalage, governanceFormAvailability, governanceLabel, initialisePolities, musterVassalLevies, polityById, setDelegatedPower, setGovernancePolicy, sovereignPolity, tickPolities } from './politics/polities.js?v=20260912-currency2';"
new = old + "\nimport { tickMedievalInstitutions } from './politics/medievalInstitutions.js?v=20260912-medieval-politics1';"
if "tickMedievalInstitutions" not in s:
    assert old in s
    s = s.replace(old, new)

old = "import { createReligiousWorld, initialiseReligions, tickReligion } from './society/religion.js?v=20260905-religion1';"
new = old + "\nimport { tickReligiousInstitutions } from './society/religiousInstitutions.js?v=20260912-medieval-politics1';"
if "tickReligiousInstitutions" not in s:
    assert old in s
    s = s.replace(old, new)

old = "const religionEvents = profiler.measure('Religion', () => tickReligion(regions, religiousWorld, calendarWeek, activeRaids, activeCampaigns, Math.random, time.elapsedDays));"
new = old + "\n    const religiousInstitutionEvents = profiler.measure('Religious institutions', () => tickReligiousInstitutions(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));"
if "const religiousInstitutionEvents" not in s:
    assert old in s
    s = s.replace(old, new)

old = "const continuityEvents = profiler.measure('Political continuity', () => tickPoliticalContinuity(polities, regions, time.elapsedDays / 365.2425, calendarWeek, { playerPolityId: activePlayerPolityId }));"
new = old + "\n    const medievalPoliticalEvents = profiler.measure('Medieval politics', () => tickMedievalInstitutions(polities, regions, calendarWeek, time.elapsedDays, { playerPolityId: activePlayerPolityId }));"
if "const medievalPoliticalEvents" not in s:
    assert old in s
    s = s.replace(old, new)

old = "      ...religionEvents.filter((event) => event.regionId === playerRegionId),"
new = old + "\n      ...religiousInstitutionEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),"
if "...religiousInstitutionEvents.filter" not in s:
    assert old in s
    s = s.replace(old, new)

old = "      ...continuityEvents.filter((event) => event.polityId === activePlayerPolityId),"
new = old + "\n      ...medievalPoliticalEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.rebelPolityId === activePlayerPolityId),"
if "...medievalPoliticalEvents.filter" not in s:
    assert old in s
    s = s.replace(old, new)

marker = "  if (event.type === 'diplomatic_message_intercepted') {"
handlers = r'''  if (event.type === 'religious_seat_offer') {
    document.getElementById('event-title').textContent = `${event.religionName} requests an autonomous sacred seat`;
    document.getElementById('event-body').textContent = `The organised religious authority asks for a protected enclave inside ${event.regionName}. You would surrender a small part of the local tax base and direct territorial control, but hosting the seat can greatly increase religious legitimacy, pilgrimage income and influence over believers in other states.`;
    const options = document.getElementById('event-options');
    if (event.resolveDecision) {
      options.innerHTML = '<button id="btn-seat-grant">Grant the autonomous seat</button><button id="btn-seat-refuse">Keep direct control</button>';
      const finish = (choice) => {
        const result = event.resolveDecision(choice);
        document.getElementById('event-body').textContent = result?.established ? 'The sacred seat is established as an autonomous enclave inside the region. Its religious authority is now politically distinct from your government.' : 'You refuse to surrender territory. The religious hierarchy remains organised, but without an autonomous seat here.';
        options.innerHTML = '<button id="btn-event-continue">Continue</button>';
        document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });
      };
      document.getElementById('btn-seat-grant').addEventListener('click', () => finish('grant'));
      document.getElementById('btn-seat-refuse').addEventListener('click', () => finish('refuse'));
      document.getElementById('event-modal').classList.remove('hidden');
      return;
    }
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'religious_schism') {
    document.getElementById('event-title').textContent = 'Organised religious schism';
    document.getElementById('event-body').textContent = `${event.regionName} has become the centre of a durable institutional split. The new communion belongs to the same religious family but now has its own hierarchy and political patrons. This can sharpen regional identity and destabilise states that span both institutions.`;
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'medieval_autonomy_demand') {
    document.getElementById('event-title').textContent = `${event.regionName} demands greater autonomy`;
    document.getElementById('event-body').textContent = `Local elites now command their own garrison, fiscal machinery and political networks. They ask for greater control over taxation and defence. Granting autonomy reduces immediate secession pressure but further entrenches local power.`;
    const options = document.getElementById('event-options');
    if (event.resolveDecision) {
      options.innerHTML = '<button id="btn-autonomy-grant">Grant autonomy</button><button id="btn-autonomy-refuse">Refuse the demand</button>';
      const finish = (choice) => {
        const result = event.resolveDecision(choice);
        document.getElementById('event-body').textContent = result?.granted ? 'The province receives greater autonomy, lower tribute and control over its own military and tax administration.' : 'The demand is refused. Local grievance and independence pressure rise.';
        options.innerHTML = '<button id="btn-event-continue">Continue</button>';
        document.getElementById('btn-event-continue').addEventListener('click', () => { document.getElementById('event-modal').classList.add('hidden'); if (eventQueue.length) showNextEvent(clock,eventQueue); else clock.releaseAutoPause(); });
      };
      document.getElementById('btn-autonomy-grant').addEventListener('click', () => finish('grant'));
      document.getElementById('btn-autonomy-refuse').addEventListener('click', () => finish('refuse'));
      document.getElementById('event-modal').classList.remove('hidden');
      return;
    }
    wireEventContinue(clock,eventQueue); return;
  }
  if (event.type === 'medieval_civil_war') {
    document.getElementById('event-title').textContent = `Civil war: ${event.regionName} breaks away`;
    document.getElementById('event-body').textContent = `A local government with its own garrison, stronghold and tax apparatus has stopped recognising the former sovereign. This is not a spontaneous rebel stack: institutions built during years of local self-defence have become an independent government.`;
    wireEventContinue(clock,eventQueue); return;
  }
'''
if "event.type === 'religious_seat_offer'" not in s:
    assert marker in s
    s = s.replace(marker, handlers + marker, 1)

p.write_text(s)
