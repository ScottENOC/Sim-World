import { AdvisorCouncil } from './advisors.js?v=20260907-art1';
import { settlementSummary } from '../society/settlements.js?v=20260907-art1';
import { artistPopulation, ensureCulturalLife, notableWorks } from '../society/arts.js?v=20260907-art1';

const originalRenderSteward = AdvisorCouncil.prototype.renderSteward;
const number = (value) => Math.round(Number(value) || 0).toLocaleString();
const percent = (value) => `${Math.round((Number(value) || 0) * 100)}%`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function culturalSection(player) {
  const settlement = settlementSummary(player);
  const cultural = ensureCulturalLife(player);
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

  return `<section class="advisor-section cultural-life-section">
    <h3>Settlement & artistic life</h3>
    <div class="advisor-report-row"><span>Principal settlement</span><strong>${escapeHtml(settlement.name)}</strong></div>
    <div class="advisor-report-row"><span>Urban population</span><strong>${number(settlement.population)} · ${percent(settlement.urbanShare)} of region</strong></div>
    <div class="advisor-report-row"><span>Settlement reputation</span><strong>${percent(settlement.fame)}</strong></div>
    <div class="advisor-report-row"><span>Professional artists</span><strong>${number(artistPopulation(player))}</strong></div>
    <div class="advisor-report-row"><span>Artistic reputation</span><strong>${percent(cultural.reputation || 0)}</strong></div>
    <div class="advisor-report-row"><span>Public artistic amenity</span><strong>${percent(cultural.publicAmenity || 0)}</strong></div>
    <p class="advisor-note">Artists are sustained by real urban surplus and private patronage. Their work does not generate abstract culture points: surviving works can make this place pleasant or famous, reinforce the subject they depict, and later attract visitors. Oral works can disappear if performance traditions die; written and physical works survive more easily.</p>
    <h4>Working artists</h4>${artistRows}
    <h4>Notable works</h4>${workRows}
  </section>`;
}

AdvisorCouncil.prototype.renderSteward = function renderStewardWithCulture(player) {
  return `${originalRenderSteward.call(this, player)}${culturalSection(player)}`;
};
