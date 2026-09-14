from pathlib import Path

path = Path('js/main.js')
text = path.read_text()

# The branch workflow applies this once before committing the repaired runtime.
# Pull-request validation then sees the already-repaired file, so treat that
# state as success rather than trying to patch the old anchors again.
if "event.type !== 'raid_resolved' || !event.outcome || !event.raid" in text:
    raise SystemExit(0)

raid_anchor = """  const { attackerName, defenderName, outcome, raid } = event;\n  const won = outcome.attackerRatio > 0.5;\n"""
replacement = """  if (event.type === 'religious_variant') {\n    document.getElementById('event-title').textContent = 'A new religious branch';\n    document.getElementById('event-body').textContent = `${event.religion?.name || 'A new religious tradition'} has emerged in ${event.regionName || 'the region'}, interpreting an older tradition in a new way.`;\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n  if (event.type === 'religious_directive') {\n    document.getElementById('event-title').textContent = 'A religious directive';\n    document.getElementById('event-body').textContent = `${event.leaderName || 'The religious leader'} calls for ${event.directive?.type === 'holy_war' ? 'holy war against' : 'peace with'} the followers of ${event.targetFaithName || 'a rival tradition'}. Defiance may cause unrest where this is the state religion.`;\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n  if (event.type !== 'raid_resolved' || !event.outcome || !event.raid) {\n    console.warn('Unhandled simulation event', event);\n    document.getElementById('event-title').textContent = event.title || `Event: ${String(event.type || 'unknown').replaceAll('_', ' ')}`;\n    document.getElementById('event-body').textContent = event.description || event.summary || 'An event occurred, but no dedicated presentation is available yet.';\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n\n  const { attackerName, defenderName, outcome, raid } = event;\n  const won = outcome.attackerRatio > 0.5;\n"""
if raid_anchor not in text:
    raise SystemExit('raid fallback anchor not found')
text = text.replace(raid_anchor, replacement, 1)

bad_wire = """function wireEventContinue(clock, eventQueue) {\n  document.getElementById('event-options').innerHTML = '<button id=\"btn-event-continue\">Continue</button>';\n  document.getElementById('event-modal').classList.remove('hidden');\n  if (event.type === 'religious_variant') {\n    document.getElementById('event-title').textContent = 'A new religious branch';\n    document.getElementById('event-body').textContent = `${event.religion.name} has emerged in ${event.regionName}, interpreting an older tradition in a new way.`;\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n  if (event.type === 'religious_directive') {\n    document.getElementById('event-title').textContent = 'A religious directive';\n    document.getElementById('event-body').textContent = `${event.leaderName || 'The religious leader'} calls for ${event.directive.type === 'holy_war' ? 'holy war against' : 'peace with'} the followers of ${event.targetFaithName || 'a rival tradition'}. Defiance may cause unrest where this is the state religion.`;\n    wireEventContinue(clock, eventQueue);\n    return;\n  }\n\n  document.getElementById('btn-event-continue').addEventListener('click', () => {\n"""
good_wire = """function wireEventContinue(clock, eventQueue) {\n  document.getElementById('event-options').innerHTML = '<button id=\"btn-event-continue\">Continue</button>';\n  document.getElementById('event-modal').classList.remove('hidden');\n  document.getElementById('btn-event-continue').addEventListener('click', () => {\n"""
if bad_wire not in text:
    raise SystemExit('wireEventContinue splice anchor not found')
text = text.replace(bad_wire, good_wire, 1)

path.write_text(text)
