from pathlib import Path

p=Path('js/main.js')
text=p.read_text()
old="import { buildFishingContactPairs, initialiseKnowledge, pruneKnowledge, tickFishingKnowledge, KNOWLEDGE_THRESHOLDS, knowledgeLevel, knowledgeStage, compassDirection } from './core/knowledge.js?v=20260906-scouting1';\n"
new=old+"import { tickPublishedGeography } from './core/publishedGeography.js?v=20260918-atlas1';\n"
if new not in text:
    if old not in text: raise RuntimeError('knowledge import anchor missing')
    text=text.replace(old,new,1)
old2="    const renaissanceEvents = profiler.measure('Renaissance networks', () => tickRenaissanceNetworks(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));\n"
new2=old2+"    profiler.measure('Published geography', () => tickPublishedGeography(regions, calendarWeek, time.elapsedDays));\n"
if new2 not in text:
    if old2 not in text: raise RuntimeError('renaissance tick anchor missing')
    text=text.replace(old2,new2,1)
p.write_text(text)
print('published geography integration applied')

# trigger
