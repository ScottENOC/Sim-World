#!/usr/bin/env python3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def rw(path, fn):
    p=ROOT/path
    s=p.read_text()
    ns=fn(s)
    assert ns!=s, f'no changes for {path}'
    p.write_text(ns)

def once(s,a,b,label):
    assert s.count(a)==1, f'{label}: {s.count(a)} matches'
    return s.replace(a,b,1)

# Profiler: nested detail timings + state metrics.
def patch_prof(s):
    s=once(s,"      stages: Object.create(null),\n", "      stages: Object.create(null),\n      details: Object.create(null),\n      metrics: Object.create(null),\n",'begin fields')
    anchor="""  function endTick() {
"""
    insert="""  function measureDetail(label, fn) {
    if (!active || !current) return fn();
    const start = now();
    try { return fn(); }
    finally { current.details[label] = (current.details[label] || 0) + (now() - start); }
  }

  function metric(label, value) {
    if (!active || !current) return;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) current.metrics[label] = numeric;
  }

"""
    s=once(s,anchor,insert+anchor,'detail funcs')
    s=once(s,"      stages: current.stages,\n", "      stages: current.stages,\n      details: current.details,\n      metrics: current.metrics,\n",'sample fields')
    anchor="""  function buildReport() {
"""
    helpers="""  function detailRows() {
    const labels = new Set(samples.flatMap((sample) => Object.keys(sample.details || {})));
    return [...labels].map((label) => {
      const values = samples.map((sample) => sample.details?.[label] || 0);
      return { label, avg: average(values), p95: percentile(values,95), max: Math.max(0,...values) };
    }).sort((a,b) => b.avg-a.avg);
  }

  function metricRows() {
    const labels = new Set(samples.flatMap((sample) => Object.keys(sample.metrics || {})));
    return [...labels].map((label) => {
      const values = samples.map((sample) => sample.metrics?.[label]).filter(Number.isFinite);
      return { label, last: values.at(-1) ?? 0, avg: average(values), max: Math.max(0,...values) };
    }).sort((a,b) => b.last-a.last);
  }

"""
    s=once(s,anchor,helpers+anchor,'report helpers')
    needle="""    lines.push('');
    lines.push('RECENT TICKS');
"""
    repl="""    lines.push('');
    lines.push('HOTSPOT DETAILS (nested inside subsystem totals)');
    lines.push('  avg | p95 | max | detail');
    for (const row of detailRows()) lines.push(`  ${formatMs(row.avg).padStart(10)} | ${formatMs(row.p95).padStart(10)} | ${formatMs(row.max).padStart(10)} | ${row.label}`);
    lines.push('');
    lines.push('STATE METRICS');
    lines.push('  last | avg | max | metric');
    for (const row of metricRows()) lines.push(`  ${row.last.toFixed(0).padStart(8)} | ${row.avg.toFixed(1).padStart(8)} | ${row.max.toFixed(0).padStart(8)} | ${row.label}`);
    lines.push('');
    lines.push('RECENT TICKS');
"""
    s=once(s,needle,repl,'report sections')
    old="""    for (const sample of samples.slice(-20)) {
      lines.push(`  ${formatMs(sample.total)}${sample.endDay == null ? '' : ` at sim day ${sample.endDay}`}`);
    }
"""
    new="""    for (const sample of samples.slice(-20)) {
      const m = sample.metrics || {};
      const state = [`rel=${m['Diplomacy relationship records'] ?? '-'}`, `ventures=${m['Trade active ventures'] ?? '-'}`, `known=${m['Trade known-region links'] ?? '-'}`, `candidates=${m['Trade candidate markets checked'] ?? '-'}`].join(' ');
      lines.push(`  ${formatMs(sample.total)}${sample.endDay == null ? '' : ` at sim day ${sample.endDay}`} · ${state}`);
    }
"""
    s=once(s,old,new,'recent state')
    s=once(s,"    measure,\n    endTick,", "    measure,\n    measureDetail,\n    metric,\n    endTick,",'return api')
    return s
rw(Path('js/core/performanceProfiler.js'), patch_prof)

# Diplomacy phases + metrics.
def patch_rel(s):
    s=once(s,"export function tickDiplomacy(regions, agreements, toolTypes, currentTick, elapsedDays = 7) {", "export function tickDiplomacy(regions, agreements, toolTypes, currentTick, elapsedDays = 7, profiler = null) {",'sig')
    s=once(s,"  const regionsById = new Map(regions.map((region) => [region.id, region]));\n  for (const region of regions) {", "  const regionsById = new Map(regions.map((region) => [region.id, region]));\n  const measureDetail = (label, fn) => profiler?.measureDetail ? profiler.measureDetail(label, fn) : fn();\n  const metric = (label, value) => profiler?.metric?.(label, value);\n  metric('Diplomacy relationship records before', regions.reduce((sum,r)=>sum+(r.relations instanceof Map?r.relations.size:0),0));\n  measureDetail('Diplomacy: relationship maintenance', () => {\n  for (const region of regions) {",'maintenance start')
    s=once(s,"    }\n  }\n\n  const events = [];\n  for (const agreement of agreements) {", "    }\n  }\n  });\n  metric('Diplomacy relationship records', regions.reduce((sum,r)=>sum+(r.relations instanceof Map?r.relations.size:0),0));\n  metric('Diplomacy active agreements', agreements.filter((a)=>a.active).length);\n\n  const events = [];\n  measureDetail('Diplomacy: agreements and payments', () => {\n  for (const agreement of agreements) {",'agreement start')
    s=once(s,"    }\n  }\n  return events;\n}", "    }\n  }\n  });\n  return events;\n}",'agreement end')
    return s
rw(Path('js/diplomacy/relations.js'), patch_rel)

# Trade broad phases + counts.
def patch_trade(s):
    s=once(s,"export function tickTrade(regions, currentTick = null, time = null, agreements = []) {\n  for (const region of regions) {", "export function tickTrade(regions, currentTick = null, time = null, agreements = [], profiler = null) {\n  const measureDetail = (label, fn) => profiler?.measureDetail ? profiler.measureDetail(label, fn) : fn();\n  const metric = (label, value) => profiler?.metric?.(label, value);\n  measureDetail('Trade: initialise regions', () => {\n  for (const region of regions) {",'trade init')
    s=once(s,"    region._tradeSecurityThisTick = routeSecurity(region);\n  }\n  const regionsById", "    region._tradeSecurityThisTick = routeSecurity(region);\n  }\n  });\n  const regionsById",'trade init end')
    s=once(s,"  processVentures(regions, regionsById, currentTick, time);\n  for (const region of regions) reconcileMerchantOccupation(region);", "  measureDetail('Trade: process ventures', () => processVentures(regions, regionsById, currentTick, time));\n  measureDetail('Trade: reconcile merchants', () => { for (const region of regions) reconcileMerchantOccupation(region); });",'trade process')
    s=once(s,"  const knownIdsByRegion = new Map(regions.map((region) => [region.id, knownRegionIds(region)]));\n  const hubIds = majorTradeHubIds(regions, currentTick);\n  const pricesByRegion = new Map(regions.map((region) => [region.id,\n    Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [resource, localPrice(region, resource)]))\n  ]));\n\n  for (const region of regions) {", "  let knownIdsByRegion; let hubIds; let pricesByRegion;\n  measureDetail('Trade: knowledge hubs and prices', () => {\n    knownIdsByRegion = new Map(regions.map((region) => [region.id, knownRegionIds(region)]));\n    hubIds = majorTradeHubIds(regions, currentTick);\n    pricesByRegion = new Map(regions.map((region) => [region.id, Object.fromEntries(TRADABLE_RESOURCES.map((resource) => [resource, localPrice(region, resource)]))]));\n  });\n  let candidateMarketsChecked = 0; let opportunitiesFound = 0; let searchingRegions = 0;\n  measureDetail('Trade: market search and launch', () => {\n  for (const region of regions) {",'trade prep')
    s=once(s,"    const candidates = [...candidateIds].map((id) => regionsById.get(id)).filter(Boolean);\n    if (!candidates.length) continue;\n    const opportunities = findOpportunities", "    const candidates = [...candidateIds].map((id) => regionsById.get(id)).filter(Boolean);\n    candidateMarketsChecked += candidates.length; searchingRegions += 1;\n    if (!candidates.length) continue;\n    const opportunities = findOpportunities",'candidates count')
    s=once(s,"    launchVentures(region, opportunities, currentTick, time, regionsById);\n  }\n\n  for (const region of regions) {", "    opportunitiesFound += opportunities.length;\n    launchVentures(region, opportunities, currentTick, time, regionsById);\n  }\n  });\n\n  measureDetail('Trade: careers and history', () => {\n  for (const region of regions) {",'market end')
    s=once(s,"    finishTradeWeek(region);\n  }\n  diffuseTradeNetworkKnowledge(regions, currentTick);\n}", "    finishTradeWeek(region);\n  }\n  });\n  measureDetail('Trade: diffuse network knowledge', () => diffuseTradeNetworkKnowledge(regions, currentTick));\n  metric('Trade active ventures', regions.reduce((sum,r)=>sum+(r.tradeEconomy?.ventures?.length||0),0));\n  metric('Trade route habits', regions.reduce((sum,r)=>sum+Object.keys(r.tradeEconomy?.routeHabits||{}).length,0));\n  metric('Trade recent partner links', regions.reduce((sum,r)=>sum+(r.recentTradePartners instanceof Map?r.recentTradePartners.size:0),0));\n  metric('Trade known-region links', [...knownIdsByRegion.values()].reduce((sum,set)=>sum+set.size,0));\n  metric('Trade candidate markets checked', candidateMarketsChecked);\n  metric('Trade opportunities found', opportunitiesFound);\n  metric('Trade searching regions', searchingRegions);\n  metric('Trade route geometry cache entries', regions.reduce((sum,r)=>sum+(r._routeGeometryCache instanceof Map?r._routeGeometryCache.size:0),0));\n  metric('Trade land path cache entries', regions.reduce((sum,r)=>sum+(r._tradeLandPathCache instanceof Map?r._tradeLandPathCache.size:0),0));\n}",'trade finish')
    return s
rw(Path('js/economy/trade.js'), patch_trade)

# Demographics phases; preserve per-region order but collect nested detail when profiler active.
def patch_demo(s):
    s=once(s,"export function tickDemographics(regions, religiousWorld = null, elapsedDays = 7) {\n  tickEducation(regions, null, elapsedDays);", "export function tickDemographics(regions, religiousWorld = null, elapsedDays = 7, profiler = null) {\n  const measureDetail = (label, fn) => profiler?.measureDetail ? profiler.measureDetail(label, fn) : fn();\n  const metric = (label, value) => profiler?.metric?.(label, value);\n  measureDetail('Demographics: education', () => tickEducation(regions, null, elapsedDays));",'demo sig')
    old="""  for (const region of regions) {
    tickUrbanisation(region, elapsedDays);
    tickSettlements(region);
    tickArts(region, regionsById, elapsedDays);
    tickStatePatronage(region, elapsedDays);
    tickCulturalMemory(region, elapsedDays);
    tickMilitaryFormations(region, elapsedDays);
    tickExternalities(region, elapsedDays);
    applyBaselineDemographics(region, elapsedDays);
  }
  tickArtistMigration(regions, elapsedDays);
  for (const region of regions) applyFamineResponse(region, regionsById, religiousWorld, elapsedDays);
  tickCulture(regions, elapsedDays);
"""
    new="""  for (const region of regions) {
    measureDetail('Demographics: urbanisation', () => tickUrbanisation(region, elapsedDays));
    measureDetail('Demographics: settlements', () => tickSettlements(region));
    measureDetail('Demographics: arts', () => tickArts(region, regionsById, elapsedDays));
    measureDetail('Demographics: state patronage', () => tickStatePatronage(region, elapsedDays));
    measureDetail('Demographics: cultural memory', () => tickCulturalMemory(region, elapsedDays));
    measureDetail('Demographics: military formations', () => tickMilitaryFormations(region, elapsedDays));
    measureDetail('Demographics: externalities', () => tickExternalities(region, elapsedDays));
    measureDetail('Demographics: births deaths aging', () => applyBaselineDemographics(region, elapsedDays));
  }
  measureDetail('Demographics: artist migration', () => tickArtistMigration(regions, elapsedDays));
  let famineRegions = 0;
  measureDetail('Demographics: famine and migration', () => { for (const region of regions) { if ((region.stockpile?.food||0)<-0.5) famineRegions++; applyFamineResponse(region, regionsById, religiousWorld, elapsedDays); } });
  measureDetail('Demographics: culture', () => tickCulture(regions, elapsedDays));
  metric('Demographics total population', regions.reduce((sum,r)=>sum+(r.population||0),0));
  metric('Demographics famine regions', famineRegions);
  metric('Demographics culture groups', regions.reduce((sum,r)=>sum+(Array.isArray(r.cultureGroups)?r.cultureGroups.length:0),0));
"""
    s=once(s,old,new,'demo body')
    return s
rw(Path('js/society/demographics.js'), patch_demo)

# Main: pass profiler and bust module caches.
def patch_main(s):
    reps={
      "./core/performanceProfiler.js?v=20260911-ios-profiler1":"./core/performanceProfiler.js?v=20260912-deep-profiler1",
      "./economy/trade.js?v=20260905-projects1":"./economy/trade.js?v=20260912-deep-profiler1",
      "./society/demographics.js?v=20260904-weather1":"./society/demographics.js?v=20260912-deep-profiler1",
      "./diplomacy/relations.js?v=20260904-save1":"./diplomacy/relations.js?v=20260912-deep-profiler1",
      "tickTrade(regions, calendarWeek, time, agreements)":"tickTrade(regions, calendarWeek, time, agreements, profiler)",
      "tickDemographics(regions, religiousWorld, time.elapsedDays)":"tickDemographics(regions, religiousWorld, time.elapsedDays, profiler)",
      "tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays)":"tickDiplomacy(regions, agreements, toolTypes, calendarWeek, time.elapsedDays, profiler)",
    }
    for a,b in reps.items(): s=once(s,a,b,a)
    return s
rw(Path('js/main.js'), patch_main)

def patch_index(s):
    import re
    ns=re.sub(r'js/main\.js\?v=[^"\']+', 'js/main.js?v=20260912-deep-profiler1', s, count=1)
    assert ns!=s
    return ns
rw(Path('index.html'), patch_index)

print('Applied deep iOS profiler instrumentation')
