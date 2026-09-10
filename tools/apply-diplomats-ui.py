from pathlib import Path

p = Path('js/ui/advisors.js')
text = p.read_text()

# Imports.
old = "import { setChokepointTollPolicy, setRoadTollPolicy, transitPolicySummary } from '../economy/transitTolls.js?v=20260907-transit1';"
new = old + "\nimport { DIPLOMAT_AUTHORITY, dispatchDiplomat, diplomatsFor, recallDiplomat, setDiplomatAuthority } from '../diplomacy/diplomats.js?v=20260909-diplomats1';\nimport { ensureCounterIntelligence, setCounterIntelligencePolicy } from '../diplomacy/counterIntelligence.js?v=20260909-counterintel1';\nimport { sendDeceptionJointOperationLetter, sendForgedJointOperationLetter } from '../diplomacy/couriers.js?v=20260909-counterintel1';"
if new not in text:
    if old not in text: raise SystemExit('advisor import anchor missing')
    text = text.replace(old, new, 1)

# Replace Envoy panel with persistent diplomat controls.
start = text.index('  renderEnvoy(player) {')
end = text.index('\n  renderPriest(player) {', start)
new_envoy = r'''  renderEnvoy(player) {
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    const diplomats = diplomatsFor(player);
    const authorityLabel = { observe: 'Observe only', negotiate: 'Negotiate minor agreements', military: 'Military negotiations', plenipotentiary: 'Broad plenipotentiary authority' };
    return `<p class="advisor-voice">“A letter carries your words. An envoy can carry judgement as well — if you choose how much authority to trust them with.”</p>
      ${section('Diplomatic service', diplomats.map((diplomat) => {
        const host = this.regions.find((region) => region.id === diplomat.postedRegionId);
        return `<div class="advisor-note"><strong>${diplomat.name}</strong> · ${diplomat.status.replaceAll('_',' ')}${host ? ` at ${host.name}` : ''}<br>
          Authority: ${authorityLabel[diplomat.authority] || diplomat.authority} · local familiarity ${percent(diplomat.localFamiliarity || 0)}${diplomat.compromised ? ' · reliability questioned' : ''}</div>
          <label class="advisor-field"><span>Delegated authority</span><select data-diplomat-authority="${diplomat.id}">
            ${Object.values(DIPLOMAT_AUTHORITY).map((authority) => `<option value="${authority}" ${diplomat.authority === authority ? 'selected' : ''}>${authorityLabel[authority]}</option>`).join('')}
          </select></label>
          ${['military','plenipotentiary'].includes(diplomat.authority) ? `<label class="advisor-field advisor-slider"><span>Maximum military commitment <b>${Math.round((diplomat.maxMilitaryCommitmentFraction || .2) * 100)}%</b></span><input data-diplomat-military-cap="${diplomat.id}" type="range" min="5" max="80" value="${Math.round((diplomat.maxMilitaryCommitmentFraction || .2) * 100)}"></label>` : ''}
          ${diplomat.status === 'home' && contacts.length ? `<label class="advisor-field"><span>Post to court</span><select data-diplomat-target="${diplomat.id}"><option value="">Choose court</option>${contacts.map((region) => `<option value="${region.id}">${region.name}</option>`).join('')}</select></label><button class="advisor-order" data-dispatch-diplomat="${diplomat.id}">Dispatch envoy</button>` : ''}
          ${diplomat.status === 'posted' ? `<button class="advisor-order" data-recall-diplomat="${diplomat.id}">Recall envoy</button>` : ''}`;
      }).join(''))}
      ${section('Known neighbours', contacts.length ? `<div class="advisor-list">${contacts.map((region) => `<button data-open-region="${region.id}"><span>${region.name}</span><small>${attitudeLabel(attitudeToward(region, player.id))} · inspect</small></button>`).join('')}</div>` : '<p class="advisor-note">We know of no foreign courts yet.</p>')}
      <p class="advisor-note">A resident envoy slowly learns the court and can report visible preparations. Delegated authority can speed agreements because the envoy may answer on the spot, but a ruler who grants it is accepting the risk of judgement, delay and disloyalty.</p>`;
  }
'''
text = text[:start] + new_envoy + text[end:]

# Replace Spymaster panel with counter-intelligence + deception controls while retaining evidence ledger.
start = text.index('  renderSpymaster(player) {')
end = text.index('\n  wireCurrent(player) {', start)
new_spy = r'''  renderSpymaster(player) {
    const observations = player.knowledge?.observations || [];
    const subjects = new Set(observations.map((item) => item.subjectId));
    const newest = [...observations].sort((a, b) => (b.receivedAt ?? b.observedAt ?? -1) - (a.receivedAt ?? a.observedAt ?? -1)).slice(0, 6);
    const diplomaticIntel = [...(player.diplomaticIntelligence || [])].sort((a,b) => (b.learnedTick || 0) - (a.learnedTick || 0)).slice(0, 8);
    const ci = ensureCounterIntelligence(player);
    const contacts = this.regions.filter((region) => region.id !== player.id && this.fogOfWar.isVisible(region));
    return `<p class="advisor-voice">“A seal proves less than people think. We judge the messenger, the hand, the route, the motive — and whether the story fits what else we know.”</p>
      ${section('Counter-intelligence', `
        <label class="advisor-field advisor-slider"><span>Credential security <b id="ci-credentials-label">${Math.round(ci.credentialSecurity * 100)}%</b></span><input id="ci-credentials" type="range" min="0" max="100" value="${Math.round(ci.credentialSecurity * 100)}"></label>
        <label class="advisor-field advisor-slider"><span>Codes and challenge phrases <b id="ci-codes-label">${Math.round(ci.codePractice * 100)}%</b></span><input id="ci-codes" type="range" min="0" max="100" value="${Math.round(ci.codePractice * 100)}"></label>
        <label class="advisor-field advisor-slider"><span>Verification caution <b id="ci-caution-label">${Math.round(ci.verificationCaution * 100)}%</b></span><input id="ci-caution" type="range" min="0" max="100" value="${Math.round(ci.verificationCaution * 100)}"></label>
        <p class="advisor-note">Stronger authentication makes forged letters harder to pass. Excessive caution can also delay or cast doubt on genuine messages. A genuine letter can still contain a lie.</p>`)}
      ${section('Diplomatic intelligence', diplomaticIntel.length ? `<div class="intelligence-list">${diplomaticIntel.map((entry) => {
        const confidence = Number.isFinite(entry.confidence) ? ` · ${Math.round(entry.confidence * 100)}% confidence` : '';
        return `<div><strong>${String(entry.type || 'report').replaceAll('_',' ')}</strong><span>${entry.hostRegionId ? `${this.regions.find((r) => r.id === entry.hostRegionId)?.name || entry.hostRegionId} · ` : ''}${entry.authenticityVerdict ? `${entry.authenticityVerdict.replaceAll('_',' ')} · ` : ''}${entry.learnedTick != null ? `${Math.max(0, this.clock.tickIndex - entry.learnedTick)}w old` : 'undated'}${confidence}</span></div>`;
      }).join('')}</div>` : '<p class="advisor-note">No diplomatic intelligence has reached the court.</p>')}
      ${contacts.length >= 2 ? section('Deception operations', `
        <p class="advisor-note">A false plan can be a genuine letter with false content, or a forged letter pretending to come from someone else. The first is easier to authenticate and harder to disprove; the second risks exposing the forgery.</p>
        <label class="advisor-field"><span>Send false plan to</span><select id="deception-recipient"><option value="">Choose recipient</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>False target</span><select id="deception-enemy"><option value="">Choose alleged target</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>False attack in</span><input id="deception-months" type="number" min="1" max="60" value="3"> months</label>
        <button id="send-deception-letter" class="advisor-order">Send genuine false plan</button>
        <hr>
        <label class="advisor-field"><span>Forge as if sent by</span><select id="forgery-sender"><option value="">Choose purported sender</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Deliver forgery to</span><select id="forgery-recipient"><option value="">Choose recipient</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <label class="advisor-field"><span>Claim they will attack</span><select id="forgery-enemy"><option value="">Choose alleged target</option>${contacts.map((r) => `<option value="${r.id}">${r.name}</option>`).join('')}</select></label>
        <button id="send-forged-letter" class="advisor-order danger">Attempt forged letter</button>
        <div id="deception-status" class="advisor-note"></div>`): ''}
      ${section('Evidence ledger', row('Known foreign peoples', number(subjects.size)) + row('Current reports', number(observations.length)) + row('Direct contacts', number(player.knowledge?.directContactIds?.size)))}
      ${section('Recent ordinary reports', newest.length ? `<div class="intelligence-list">${newest.map((report) => { const subject = this.regions.find((r) => r.id === report.subjectId); const age = Number.isFinite(report.receivedAt) ? Math.max(0, this.clock.tickIndex - report.receivedAt) : null; return `<div><strong>${subject?.name || 'Unknown people'}</strong><span>${String(report.topic).replaceAll('_', ' ')} · ${String(report.source).replaceAll('_', ' ')}${age === null ? '' : ` · ${age}w old`}</span></div>`; }).join('')}</div>` : '<p class="advisor-note">No reports have reached the court.</p>')}`;
  }
'''
text = text[:start] + new_spy + text[end:]

# Add general wiring before the Marshal-only early return.
anchor = "    if (this.activeAdvisor !== 'marshal') return;"
insert = r'''    document.querySelectorAll('[data-diplomat-authority]').forEach((select) => select.addEventListener('change', () => {
      const diplomatId = select.dataset.diplomatAuthority;
      const cap = document.querySelector(`[data-diplomat-military-cap="${diplomatId}"]`);
      setDiplomatAuthority(player, diplomatId, select.value, { maxMilitaryCommitmentFraction: Number(cap?.value || 20) / 100 });
      this.render(false);
    }));
    document.querySelectorAll('[data-diplomat-military-cap]').forEach((input) => input.addEventListener('change', () => {
      const diplomat = diplomatsFor(player).find((d) => d.id === input.dataset.diplomatMilitaryCap);
      if (diplomat) setDiplomatAuthority(player, diplomat.id, diplomat.authority, { maxMilitaryCommitmentFraction: Number(input.value) / 100 });
      this.render(false);
    }));
    document.querySelectorAll('[data-dispatch-diplomat]').forEach((button) => button.addEventListener('click', () => {
      const targetId = document.querySelector(`[data-diplomat-target="${button.dataset.dispatchDiplomat}"]`)?.value;
      const target = this.regions.find((region) => region.id === targetId);
      if (target) dispatchDiplomat(player, target, this.regions, button.dataset.dispatchDiplomat, this.clock.tickIndex);
      this.render(false);
    }));
    document.querySelectorAll('[data-recall-diplomat]').forEach((button) => button.addEventListener('click', () => {
      recallDiplomat(player, button.dataset.recallDiplomat, this.regions, this.clock.tickIndex);
      this.render(false);
    }));
    const updateCi = () => {
      const credentials = document.getElementById('ci-credentials');
      const codes = document.getElementById('ci-codes');
      const caution = document.getElementById('ci-caution');
      if (!credentials || !codes || !caution) return;
      setCounterIntelligencePolicy(player, { credentialSecurity: Number(credentials.value) / 100, codePractice: Number(codes.value) / 100, verificationCaution: Number(caution.value) / 100 });
      document.getElementById('ci-credentials-label').textContent = `${credentials.value}%`;
      document.getElementById('ci-codes-label').textContent = `${codes.value}%`;
      document.getElementById('ci-caution-label').textContent = `${caution.value}%`;
    };
    ['ci-credentials','ci-codes','ci-caution'].forEach((id) => document.getElementById(id)?.addEventListener('input', updateCi));
    document.getElementById('send-deception-letter')?.addEventListener('click', () => {
      const recipient = this.regions.find((r) => r.id === document.getElementById('deception-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('deception-enemy')?.value);
      const status = document.getElementById('deception-status');
      if (!recipient || !enemy || recipient.id === enemy.id) { if (status) status.textContent = 'Choose two different foreign courts.'; return; }
      const months = Math.max(1, Number(document.getElementById('deception-months')?.value) || 3);
      const result = sendDeceptionJointOperationLetter(player, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + Math.round(months * 4.345), secrecy: .12 });
      if (status) status.textContent = result.sent ? 'False operational letter dispatched with genuine credentials.' : `Could not send (${result.reason}).`;
    });
    document.getElementById('send-forged-letter')?.addEventListener('click', () => {
      const purported = this.regions.find((r) => r.id === document.getElementById('forgery-sender')?.value);
      const recipient = this.regions.find((r) => r.id === document.getElementById('forgery-recipient')?.value);
      const enemy = this.regions.find((r) => r.id === document.getElementById('forgery-enemy')?.value);
      const status = document.getElementById('deception-status');
      if (!purported || !recipient || !enemy || purported.id === recipient.id) { if (status) status.textContent = 'Choose a purported sender, a different recipient and an alleged target.'; return; }
      const result = sendForgedJointOperationLetter(player, purported, recipient, enemy, this.regions, this.clock.tickIndex, { attackTick: this.clock.tickIndex + 13 });
      if (status) status.textContent = result.sent ? 'Forged letter dispatched. Whether it survives scrutiny is unknown.' : `Could not send (${result.reason}).`;
    });
'''
if insert not in text:
    if anchor not in text: raise SystemExit('advisor wire anchor missing')
    text = text.replace(anchor, insert + anchor, 1)

p.write_text(text)
