from pathlib import Path

p = Path('js/main.js')
s = p.read_text()

old = "import { tickMedievalReligiousPolitics } from './society/medievalReligiousPolitics.js?v=20260912-medieval2';\n"
new = old + "import { handleReligiousPoliticsEvent } from './ui/religiousPoliticsEventUi.js?v=20260913-religious-politics2';\n"
assert old in s and "handleReligiousPoliticsEvent" not in s
s = s.replace(old, new, 1)

old = "const medievalReligiousEvents = profiler.measure('Religious politics', () => tickMedievalReligiousPolitics(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random));"
new = "const medievalReligiousEvents = profiler.measure('Religious politics', () => tickMedievalReligiousPolitics(regions, religiousWorld, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId, activeWars }));"
assert old in s
s = s.replace(old, new, 1)

old = "...medievalReligiousEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId),"
new = "...medievalReligiousEvents.filter((event) => event.regionId === playerRegionId || event.polityId === activePlayerPolityId || event.targetPolityId === activePlayerPolityId || event.polityIds?.includes?.(activePlayerPolityId)),"
assert old in s
s = s.replace(old, new, 1)

old = "function showNextEvent(clock, eventQueue) {\n  if (eventQueue.length === 0) return;\n\n  const event = eventQueue.shift();\n"
new = "function showNextEvent(clock, eventQueue) {\n  if (eventQueue.length === 0) return;\n\n  const event = eventQueue.shift();\n  if (handleReligiousPoliticsEvent(event, clock, eventQueue, showNextEvent)) return;\n"
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)

index = Path('index.html')
i = index.read_text()
i = i.replace('js/main.js?v=20260912-', 'js/main.js?v=20260913-religious-politics2-') if 'js/main.js?v=20260912-' in i else i
index.write_text(i)
