from pathlib import Path

religious = Path('js/society/medievalReligiousPolitics.js')
r = religious.read_text()
r = r.replace('const protected = aFollowers > 0.45 && aInf > 0.24 ? a : bFollowers > 0.45 && bInf > 0.24 ? b : null;', 'const favouredPolity = aFollowers > 0.45 && aInf > 0.24 ? a : bFollowers > 0.45 && bInf > 0.24 ? b : null;')
r = r.replace('const target = protected?.id === aId ? b : protected?.id === bId ? a : null;', 'const target = favouredPolity?.id === aId ? b : favouredPolity?.id === bId ? a : null;')
r = r.replace('if (!protected || !target || currentTick - p.lastWarCallTick <= 52) continue;', 'if (!favouredPolity || !target || currentTick - p.lastWarCallTick <= 52) continue;')
r = r.replace('followerShareInPolity(religion.id,protected.id,regions)', 'followerShareInPolity(religion.id,favouredPolity.id,regions)')
r = r.replace('ensurePolityReligiousPolitics(protected)', 'ensurePolityReligiousPolitics(favouredPolity)')
r = r.replace('protected.administration.legitimacy', 'favouredPolity.administration.legitimacy')
r = r.replace('protectedPolityId:protected.id', 'protectedPolityId:favouredPolity.id')
r = r.replace('polityId:protected.id', 'polityId:favouredPolity.id')
religious.write_text(r)

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
