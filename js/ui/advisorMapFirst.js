import { ensureEducation, setScribalStudentTarget, educatedSpecialists } from '../society/education.js?v=20260906-education1';
import { perceivedEconomicImportance, confidenceLabel } from '../economy/economicImportance.js?v=20260907-importance2';

const number = (value) => Math.round(Number(value) || 0).toLocaleString();

function playerRegion(sim) {
  const playerId = sim?.fogOfWar?.playerRegionId;
  return sim?.regions?.find((region) => region.id === playerId) || null;
}

function focusRegion(sim, regionId) {
  const region = sim?.regions?.find((candidate) => candidate.id === regionId);
  if (!region || !sim?.fogOfWar?.isVisible?.(region)) return;
  document.getElementById('council-panel')?.classList.add('hidden');
  sim.map.selectedId = region.id;
  sim.map.onSelect?.(region);
  sim.map.draw();
}

function renderScribalSection(sim) {
  const content = document.getElementById('advisor-content');
  const stewardTab = document.querySelector('[data-advisor="steward"].active');
  if (!content || !stewardTab || content.querySelector('[data-mapfirst-scribes]')) return;
  const region = playerRegion(sim);
  if (!region) return;

  const education = ensureEducation(region);
  const literate = Boolean(education.writingSystem);
  const specialists = educatedSpecialists(region);
  const recordedActivities = Object.keys(education.recordedExperience || {})
    .filter((key) => education.recordedExperience[key] > 1);
  const adminCoverage = Math.round((education.administrativeCoverage || 0) * 100);
  const adminDemand = Math.round(education.administrativeDemand || 0);
  const infoQuality = Math.max(0, Math.round(((education.informationQuality || 1) - 1) * 100));

  const section = document.createElement('section');
  section.className = 'advisor-section';
  section.dataset.mapfirstScribes = '1';
  section.innerHTML = `
    <h3>Scribes, writing and archives</h3>
    <div class="advisor-report-row"><span>Writing tradition</span><strong>${literate ? education.writingSystem : 'None locally'}</strong></div>
    <div class="advisor-report-row"><span>Students</span><strong>${number(education.students)}</strong></div>
    <div class="advisor-report-row"><span>Junior scribes</span><strong>${number(education.juniorScribes)}</strong></div>
    <div class="advisor-report-row"><span>Experienced scribes</span><strong>${number(education.experiencedScribes)}</strong></div>
    <div class="advisor-report-row"><span>Master scribes</span><strong>${number(education.masterScribes)}</strong></div>
    <div class="advisor-report-row"><span>Archive maturity</span><strong>${Math.round((education.archiveLevel || 0) * 100)}%</strong></div>
    <div class="advisor-report-row"><span>Educated specialists</span><strong>${number(specialists)}</strong></div>
    <div class="advisor-report-row"><span>Government scribal coverage</span><strong>${adminCoverage}%${adminDemand ? ` of ${number(adminDemand)} demand` : ''}</strong></div>
    ${infoQuality ? `<div class="advisor-report-row"><span>Report processing</span><strong>+${infoQuality}% quality</strong></div>` : ''}
    ${recordedActivities.length ? `<p class="advisor-note">Recorded practical fields: ${recordedActivities.join(', ')}.</p>` : ''}
    ${!literate && education.adoptionProgress > 0 ? `<p class="advisor-note">Foreign writing exposure: ${Math.round(education.adoptionProgress * 100)}% toward local adoption.</p>` : ''}
    <label class="advisor-field"><span>Target scribal students</span><input id="council-scribal-students" type="number" min="0" step="1" value="${Math.round(education.targetStudents)}" ${literate ? '' : 'disabled'}></label>
    <p class="advisor-note">${literate
      ? 'Training takes years. Expanding the pipeline improves administration and record-keeping only as cohorts mature.'
      : 'An oral society cannot train local scribes yet. Writing is usually adopted through sustained contact with literate neighbours or trading partners.'}</p>
  `;
  content.appendChild(section);
  section.querySelector('#council-scribal-students')?.addEventListener('change', (event) => {
    setScribalStudentTarget(region, event.target.value);
  });
}

function renderEconomicReputation(sim) {
  const content = document.getElementById('advisor-content');
  const treasurerTab = document.querySelector('[data-advisor="treasurer"].active');
  if (!content || !treasurerTab || content.querySelector('[data-mapfirst-economic-reputation]')) return;
  const observer = playerRegion(sim);
  if (!observer) return;

  const known = sim.regions
    .filter((region) => region.id !== observer.id && sim.fogOfWar?.isVisible?.(region))
    .map((region) => ({ region, estimate: perceivedEconomicImportance(observer, region, sim.regions, sim.clock?.tickIndex || 0) }))
    .sort((a, b) => b.estimate.score - a.estimate.score)
    .slice(0, 8);

  const section = document.createElement('section');
  section.className = 'advisor-section';
  section.dataset.mapfirstEconomicReputation = '1';
  section.innerHTML = `
    <h3>Known economic centres</h3>
    <p class="advisor-note">These are estimates, not accounts. Merchants, envoys and travellers judge scale from traffic, visible construction, court display and whatever reports have reached us. Magnificence can conceal decline.</p>
    ${known.length ? `<div class="advisor-list">${known.map(({ region, estimate }) => `
      <button data-economic-region="${region.id}"><span>${region.name}</span><small>${estimate.description} · ${confidenceLabel(estimate.confidence)}</small></button>
    `).join('')}</div>` : '<p class="advisor-note">We do not yet know enough foreign centres to compare them.</p>'}
  `;
  content.appendChild(section);
  section.querySelectorAll('[data-economic-region]').forEach((button) => {
    button.addEventListener('click', () => focusRegion(sim, button.dataset.economicRegion));
  });
}

export function installMapFirstAdvisorExtensions(sim = window.__worldsim) {
  const content = document.getElementById('advisor-content');
  if (!sim || !content) return false;
  if (content.dataset.mapFirstAdvisorExtensions === '1') return true;
  content.dataset.mapFirstAdvisorExtensions = '1';

  const refresh = () => queueMicrotask(() => {
    renderScribalSection(sim);
    renderEconomicReputation(sim);
  });
  new MutationObserver(refresh).observe(content, { childList: true });
  document.getElementById('advisor-tabs')?.addEventListener('click', refresh);
  sim.clock?.onTick?.(() => {
    if (!document.getElementById('council-panel')?.classList.contains('hidden')) refresh();
  });
  refresh();
  return true;
}

if (typeof window !== 'undefined') installMapFirstAdvisorExtensions();
