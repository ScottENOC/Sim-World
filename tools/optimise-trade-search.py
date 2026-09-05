from pathlib import Path
p=Path('js/economy/trade.js'); s=p.read_text()
old="""  const noHabitsYet = Object.keys(economy.routeHabits).length === 0;
  const crisis = economy.searchPressure >= CRISIS_SEARCH_PRESSURE;
  const broadSearch = noHabitsYet || crisis || staggeredDue(region, currentTick, BROAD_SEARCH_INTERVAL);
  if (broadSearch) {
    for (const id of knownIds) candidateIds.add(id);
    for (const id of nearbyMarketIds(region, regionsById)) if (knownIds.has(id)) candidateIds.add(id);
  } else {"""
new="""  const noHabitsYet = Object.keys(economy.routeHabits).length === 0;
  const crisis = economy.searchPressure >= CRISIS_SEARCH_PRESSURE;
  // A merchant community that found nothing on its first survey should not
  // re-scan the entire known world every month forever. Give every region one
  // initial broad search, then fall back to the normal half-year cadence unless
  // failed ventures create crisis search pressure. Fresh reports and direct
  // contacts are still considered every tick outside that broad search.
  const initialBroadSearch = noHabitsYet && !economy.initialBroadSearchCompleted;
  const scheduledBroadSearch = staggeredDue(region, currentTick, BROAD_SEARCH_INTERVAL);
  const broadSearch = initialBroadSearch || crisis || scheduledBroadSearch;
  if (broadSearch) {
    economy.initialBroadSearchCompleted = true;
    for (const id of knownIds) candidateIds.add(id);
    for (const id of nearbyMarketIds(region, regionsById)) if (knownIds.has(id)) candidateIds.add(id);
  } else {"""
if old not in s: raise SystemExit('candidate broad search anchor missing')
s=s.replace(old,new,1)
p.write_text(s)
