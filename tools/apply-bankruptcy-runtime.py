from pathlib import Path
p=Path('js/main.js')
s=p.read_text()
old="import { tickCorporateCapital } from './economy/corporateCapital.js?v=20260913-capital2';"
new="import { tickCorporateCapitalWithDistress, resolvePlayerFirmDistressEvent } from './economy/corporateDistressRuntime.js?v=20260917-bankruptcy1';"
assert old in s
s=s.replace(old,new,1)
old="    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapital(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));"
new="""    const capitalEvents = profiler.measure('Corporate capital', () => tickCorporateCapitalWithDistress(regions, polities, calendarWeek, time.elapsedDays, Math.random, { playerPolityId: activePlayerPolityId }));
    for (const distressEvent of capitalEvents.filter((event) => event.type === 'commercial_firm_distress' && event.polityId === activePlayerPolityId)) {
      for (const bid of distressEvent.foreignBids || []) bid.buyerName = polityById(polities, bid.buyerPolityId)?.name || bid.buyerPolityId;
      distressEvent.resolveDecision = (choice) => resolvePlayerFirmDistressEvent(distressEvent, choice, { regions, polities, currentTick: calendarWeek });
    }"""
assert old in s
s=s.replace(old,new,1)
anchor="  if (event.type === 'foreign_restoration_support_detected') {"
assert anchor in s
block="""  if (event.type === 'commercial_firm_distress') {
    const options = document.getElementById('event-options');
    const sector = String(event.sector || 'enterprise').replaceAll('_', ' ');
    document.getElementById('event-title').textContent = `${sector[0]?.toUpperCase() || ''}${sector.slice(1)} enterprise in financial distress`;
    const a = event.assessment || {};
    const liability = Number(a.uncoveredLiability || 0);
    document.getElementById('event-body').innerHTML = `The enterprise can no longer meet its obligations without intervention.<br><br>` +
      `Capital ${Number(a.capital || 0).toFixed(2)} · debt ${Number(a.debt || 0).toFixed(2)} · uncovered future/public liabilities ${liability.toFixed(2)}.<br>` +
      `${(event.foreignBids || []).length ? `${event.foreignBids.length} foreign acquisition offer(s) are available.` : 'No credible foreign buyer has emerged.'}`;
    const domesticButtons = (event.options || []).filter((o) => o.available).map((o) => `<button data-firm-resolution="${o.id}">${o.label}${o.cost ? ` (${Number(o.cost).toFixed(2)})` : ''}</button>`).join('');
    const foreignButtons = (event.foreignBids || []).map((bid) => {
      const review = (bid.reviewOptions || []).filter((o) => o.available && o.id !== 'reject');
      const detail = `${bid.buyerName || bid.buyerPolityId}: offer ${Number(bid.bidValue || 0).toFixed(2)}, new capital ${Number(bid.recapitalisation || 0).toFixed(2)}`;
      return `<div class="raid-status"><strong>${detail}</strong><br>${review.map((o) => `<button data-firm-resolution="foreign|${bid.id}|${o.id}">${o.label}</button>`).join(' ')}</div>`;
    }).join('');
    options.innerHTML = domesticButtons + foreignButtons;
    const finish = (choice) => {
      const result = event.resolveDecision?.(choice);
      if (!result?.resolved) {
        document.getElementById('event-body').textContent = result?.summary || `That resolution is no longer available (${String(result?.reason || 'unknown').replaceAll('_', ' ')}).`;
        return;
      }
      document.getElementById('event-body').textContent = result.summary || 'The enterprise distress has been resolved.';
      options.innerHTML = '<button id="btn-event-continue">Continue</button>';
      document.getElementById('btn-event-continue').addEventListener('click', () => {
        document.getElementById('event-modal').classList.add('hidden');
        if (eventQueue.length) showNextEvent(clock, eventQueue); else clock.releaseAutoPause();
      });
    };
    options.querySelectorAll('[data-firm-resolution]').forEach((button) => button.addEventListener('click', () => finish(button.dataset.firmResolution)));
    document.getElementById('event-modal').classList.remove('hidden');
    return;
  }
"""
s=s.replace(anchor,block+anchor,1)
p.write_text(s)
# trigger marker: 2026-09-17
