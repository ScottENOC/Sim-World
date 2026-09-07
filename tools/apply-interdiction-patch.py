#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def patch(path, old, new, label):
    p = ROOT / path
    text = p.read_text()
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'{label}: anchor not found in {path}')
    p.write_text(text.replace(old, new, 1))

# Merchants account for active interdiction and refuse genuinely blocked routes.
patch('js/economy/trade.js', """    const transit = estimateTransitToll(region, route, regions, regionsById, agreements);
    const baseCost = route.cost + (1 - route.reliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
""", """    const transit = estimateTransitToll(region, route, regions, regionsById, agreements);
    if (transit.blocked) continue;
    const effectiveReliability = route.reliability * (transit.reliabilityMultiplier ?? 1);
    if (effectiveReliability <= 0.001) continue;
    const baseCost = route.cost + (1 - effectiveReliability) * 0.1;
    const pricesThere = pricesByRegion.get(dest.id);
""", 'trade interdiction assessment')
patch('js/economy/trade.js', """        route: { ...route, cost, transit },
""", """        route: { ...route, cost, transit, reliability: effectiveReliability },
""", 'trade interdiction reliability')

# Player controls passage access separately from tolls.
patch('js/ui/advisors.js', """          <label class=\"advisor-field\"><span>${entry.label}: military-support allies</span><select data-cp-allies=\"${entry.id}\" ${entry.controlledByUs ? '' : 'disabled'}><option value=\"yes\" ${entry.policy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value=\"no\" ${entry.policy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>`).join('') : '<p class=\"advisor-note\">This region is not close enough to a major mapped maritime chokepoint to enforce passage tolls.</p>'}`)}
""", """          <label class=\"advisor-field\"><span>${entry.label}: military-support allies</span><select data-cp-allies=\"${entry.id}\" ${entry.controlledByUs ? '' : 'disabled'}><option value=\"yes\" ${entry.policy.alliesFree !== false ? 'selected' : ''}>Travel toll-free</option><option value=\"no\" ${entry.policy.alliesFree === false ? 'selected' : ''}>Pay normal tolls</option></select></label>
          <label class=\"advisor-field\"><span>${entry.label}: passage policy</span><select data-cp-access=\"${entry.id}\" ${entry.controlledByUs ? '' : 'disabled'}><option value=\"open\" ${entry.policy.access === 'open' ? 'selected' : ''}>Open passage</option><option value=\"hostile\" ${entry.policy.access === 'hostile' ? 'selected' : ''}>Interdict hostile traffic</option><option value=\"closed\" ${entry.policy.access === 'closed' ? 'selected' : ''}>Attempt closure</option></select></label>`).join('') : '<p class=\"advisor-note\">This region is not close enough to a major mapped maritime chokepoint to enforce passage tolls.</p>'}`)}
""", 'advisor access control')

patch('js/ui/advisors.js', """      setChokepointTollPolicy(player, id, { rate: Number(input.value) / 100, alliesFree: allies?.value !== 'no' });
""", """      const access = document.querySelector(`[data-cp-access=\"${id}\"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input.value) / 100, alliesFree: allies?.value !== 'no', access: access?.value || 'open' });
""", 'advisor toll preserves access')
patch('js/ui/advisors.js', """      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: select.value !== 'no' });
    }));
    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
""", """      const access = document.querySelector(`[data-cp-access=\"${id}\"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: select.value !== 'no', access: access?.value || 'open' });
    }));
    document.querySelectorAll('[data-cp-access]').forEach((select) => select.addEventListener('change', () => {
      const id = select.dataset.cpAccess;
      const input = document.querySelector(`[data-cp-toll=\"${id}\"]`);
      const allies = document.querySelector(`[data-cp-allies=\"${id}\"]`);
      setChokepointTollPolicy(player, id, { rate: Number(input?.value || 0) / 100, alliesFree: allies?.value !== 'no', access: select.value });
    }));
    document.getElementById('add-trade-embargo')?.addEventListener('click', () => {
""", 'advisor access listener')

# AI only attempts hostile interdiction when control is strong; closure is reserved
# for severe hostility and very strong control rather than routine revenue policy.
patch('js/ai/nationAi.js', """    const desired = treasuryPressure ? 0.055 : throughput > 100 ? 0.03 : 0.018;
    // Small variation stops every AI from converging on the exact same nominal rate.
    setChokepointTollPolicy(region, entry.id, { rate: desired * (0.9 + rng() * 0.2), alliesFree: true });
""", """    const desired = treasuryPressure ? 0.055 : throughput > 100 ? 0.03 : 0.018;
    const access = entry.control >= 0.78 && (region.militaryPolicy?.navalPriority === 'war') ? 'hostile' : 'open';
    // Small variation stops every AI from converging on the exact same nominal rate.
    setChokepointTollPolicy(region, entry.id, { rate: desired * (0.9 + rng() * 0.2), alliesFree: true, access });
""", 'AI interdiction policy')

print('Interdiction integration patched')
