import { AdvisorCouncil } from './advisors.js?v=20260905-projects1';
import { settlementSummary } from '../society/settlements.js?v=20260907-art1';
import { artistPopulation, ensureCulturalLife, notableWorks } from '../society/arts.js?v=20260907-art1';
import { definingMemories } from '../society/culturalMemory.js?v=20260907-memory1';
import {
  STATE_PATRONAGE_LEVELS, commissionGovernmentWork, closeArtSchool,
  ensureStatePatronage, foundArtSchool, setStatePatronagePolicy,
} from '../society/statePatronage.js?v=20260907-art2';

const originalRenderSteward = AdvisorCouncil.prototype.renderSteward;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
let activePlayer = null;
let activeCouncil = null;

function memoryRows(player) {
  const memories = definingMemories(player, 6).filter((m) => m.strength > 0.05 || m.symbolicLegacy > 0.08);
  if (!memories.length) return '<p class="advisor-note">No event has yet become a defining shared story.</p>';
  return memories.map((memory) => `
    <article class="conflict-card">
      <div class="conflict-detail" style="display:block">
        <strong>${escapeHtml(memory.label)}</strong>
        <p class="advisor-note">${escapeHtml(memory.theme)}${memory.motif ? ` · ${escapeHtml(memory.motif)}` : ''}${memory.defining ? ' · defining memory' : ''}</p>
        <div class="advisor-report-row"><span>Story strength</span><strong>${percent(memory.strength)}</strong></div>
        <div class="advisor-report-row"><span>Practical relevance</span><strong>${percent(memory.practicalRelevance)}</strong></div>
        <div class="advisor-report-row"><span>Symbolic legacy</span><strong>${percent(memory.symbolicLegacy)}</strong></div>
        <div class="advisor-report-row"><span>Reinforced by art</span><strong>${percent(memory.artReinforcement)}</strong></div>
        <div class="advisor-report-row"><span>Historical accuracy</span><strong>${percent(memory.historicalAccuracy)}</strong></div>
      </div>
    </article>`).join('');
}

function culturalSection(player) {
  const settlement = settlementSummary(player);
  const cultural = ensureCulturalLife(player);
  const policy = ensureStatePatronage(player);
  const school = cultural.artSchool;
  const works = notableWorks(player, 6);
  const artists = Object.entries(cultural.artists || {})
    .filter(([, cohort]) => (cohort.people || 0) >= 0.4)
    .sort((a, b) => (b[1].people || 0) - (a[1].people || 0));

  const artistRows = artists.length ? artists.map(([discipline, cohort]) => `
    <div class="advisor-report-row"><span>${escapeHtml(discipline.charAt(0).toUpperCase() + discipline.slice(1))}</span>
      <strong>${number(cohort.people)} · skill ${percent(cohort.skill || 0)}</strong></div>`).join('')
    : '<p class="advisor-note">There are not yet enough wealthy patrons and urban specialists to sustain a professional artistic community.</p>';

  const workRows = works.length ? works.map((work) => `
    <article class="conflict-card">
      <div class="conflict-detail" style="display:block">
        <strong>${escapeHtml(work.title)}</strong>
        <p class="advisor-note">${escapeHtml(work.discipline)} · ${escapeHtml(work.subject)} · ${escapeHtml(work.patronType)} · ${escapeHtml(work.transmission)}</p>
        <div class="advisor-report-row"><span>Quality</span><strong>${percent(work.quality)}</strong></div>
        <div class="advisor-report-row"><span>Known fame</span><strong>${percent(work.fame)}</strong></div>
        ${work.discipline === 'sculpture' || work.discipline === 'painting'
          ? `<div class="advisor-report-row"><span>Condition</span><strong>${percent(work.condition)}</strong></div>` : ''}
      </div>
    </article>`).join('')
    : '<p class="advisor-note">No individually notable works have yet survived into the record.</p>';

  const policyOptions = Object.entries(STATE_PATRONAGE_LEVELS).map(([id, spec]) =>
    `<option value="${id}" ${policy.level === id ? 'selected' : ''}>${escapeHtml(spec.label)}</option>`).join('');
  const canFoundSchool = !school.founded && settlement.population >= 5000 && (player.treasury || 0) >= 80;
  const schoolUi = school.founded ? `
    <div class="advisor-report-row"><span>School quality</span><strong>${percent(school.quality)}</strong></div>
    <div class="advisor-report-row"><span>Teachers</span><strong>${number(school.teachers)}</strong></div>
    <div class="advisor-report-row"><span>Students</span><strong>${number(school.students)}</strong></div>
    <div class="advisor-report-row"><span>Annual upkeep</span><strong>${Number(school.annualUpkeep || 0).toFixed(1)} coin</strong></div>
    <div class="advisor-report-row"><span>Funding this year</span><strong>${percent(school.fundingRatio ?? 1)}</strong></div>
    <button class="advisor-order danger" data-close-art-school>Close art school</button>`
    : `<button class="advisor-order" data-found-art-school ${canFoundSchool ? '' : 'disabled'}>Found state art school · 80 coin</button>
      <p class="advisor-note">Requires a principal settlement of at least 5,000 people and 80 coin. The school then has continuing upkeep; underfunding reduces teaching quality rather than magically preserving the bonus.</p>`;

  return `<section class="advisor-section cultural-life-section">
    <h3>Settlement & artistic life</h3>
    <div class="advisor-report-row"><span>Principal settlement</span><strong>${escapeHtml(settlement.name)}</strong></div>
    <div class="advisor-report-row"><span>Urban population</span><strong>${number(settlement.population)} · ${percent(settlement.urbanShare)} of region</strong></div>
    <div class="advisor-report-row"><span>Settlement reputation</span><strong>${percent(settlement.fame)}</strong></div>
    <div class="advisor-report-row"><span>Professional artists</span><strong>${number(artistPopulation(player))}</strong></div>
    <div class="advisor-report-row"><span>Artistic reputation</span><strong>${percent(cultural.reputation || 0)}</strong></div>
    <div class="advisor-report-row"><span>Public artistic amenity</span><strong>${percent(cultural.publicAmenity || 0)}</strong></div>
    <p class="advisor-note">Artists are sustained by real urban surplus and patronage. Their work can reinforce particular stories; it still does not generate an abstract culture currency.</p>

    <h4>Defining stories</h4>
    <p class="advisor-note">Important events can become shared cultural memories. Practical consequences fade when the underlying practice becomes obsolete, while stories, symbols and surviving artworks can persist much longer.</p>
    ${memoryRows(player)}

    <h4>State patronage</h4>
    <label class="advisor-field"><span>Patronage policy</span><select id="state-art-policy">${policyOptions}</select></label>
    <div class="advisor-report-row"><span>Recent state art spending</span><strong>${Number(policy.annualSpend || 0).toFixed(1)} coin</strong></div>
    <p class="advisor-note">NPC governments use the same treasury-backed system. Once you choose a policy here, your realm keeps that policy until you change it.</p>
    <label class="advisor-field"><span>Commission</span><select id="state-art-discipline">
      <option value="sculpture">Sculpture</option><option value="painting">Painting</option><option value="music">Music</option><option value="poetry">Poetry</option>
    </select></label>
    <label class="advisor-field"><span>Subject</span><select id="state-art-subject">
      <option value="ruler">Ruler</option><option value="religion">Religion</option><option value="victory">Victory</option><option value="city">City</option><option value="ancestors">Ancestors</option><option value="mourning">Mourning</option><option value="love">Love</option><option value="nature">Nature</option>
    </select></label>
    <label class="advisor-field advisor-slider"><span>Ambition <b id="state-art-scale-label">70%</b></span><input id="state-art-scale" type="range" min="20" max="100" value="70"></label>
    <button class="advisor-order" data-commission-state-art>Commission work from treasury</button>

    <h4>State art school</h4>${schoolUi}
    <h4>Working artists</h4>${artistRows}
    <h4>Notable works</h4>${workRows}
  </section>`;
}

AdvisorCouncil.prototype.renderSteward = function renderStewardWithCulture(player) {
  activePlayer = player;
  activeCouncil = this;
  return `${originalRenderSteward.call(this, player)}${culturalSection(player)}`;
};

document.addEventListener('change', (event) => {
  if (!activePlayer) return;
  if (event.target?.id === 'state-art-policy') {
    setStatePatronagePolicy(activePlayer, event.target.value);
    activeCouncil?.render(false);
  }
});

document.addEventListener('input', (event) => {
  if (event.target?.id === 'state-art-scale') {
    const label = document.getElementById('state-art-scale-label');
    if (label) label.textContent = `${event.target.value}%`;
  }
});

document.addEventListener('click', (event) => {
  if (!activePlayer) return;
  const commission = event.target.closest?.('[data-commission-state-art]');
  if (commission) {
    const discipline = document.getElementById('state-art-discipline')?.value || 'sculpture';
    const subject = document.getElementById('state-art-subject')?.value || 'ruler';
    const scale = Number(document.getElementById('state-art-scale')?.value || 70) / 100;
    const work = commissionGovernmentWork(activePlayer, discipline, subject, scale, 'state');
    if (!work) window.alert('The commission cannot proceed: there may be too few artists, insufficient treasury funds, or missing materials.');
    activeCouncil?.render(false);
    return;
  }
  if (event.target.closest?.('[data-found-art-school]')) {
    if (foundArtSchool(activePlayer, activeCouncil?.clock?.tickIndex ?? null)) activeCouncil?.render(false);
    return;
  }
  if (event.target.closest?.('[data-close-art-school]')) {
    if (closeArtSchool(activePlayer)) activeCouncil?.render(false);
  }
});
