import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';

function modernScenarioActive() {
  return currentScenario()?.rulesProfile === 'modern-crisis';
}

export function applyModernScenarioAdvisorPresentation() {
  if (!modernScenarioActive() || typeof document === 'undefined') return false;
  const stewardTab = document.querySelector('#advisor-tabs [data-advisor="steward"]');
  if (!stewardTab) return false;

  const label = stewardTab.querySelector('small');
  if (label) label.textContent = 'Health Minister';
  stewardTab.setAttribute('aria-label', 'Health Minister: health, people and services');

  const title = document.getElementById('council-title');
  const keepModernTitle = () => {
    if (!stewardTab.classList.contains('active') && stewardTab.getAttribute('aria-selected') !== 'true') return;
    if (title && !title.textContent.startsWith('Health Minister')) title.textContent = 'Health Minister — Health, people & services';
  };
  stewardTab.addEventListener('click', () => queueMicrotask(keepModernTitle));
  if (title && !title.__modernHealthTitleObserver) {
    title.__modernHealthTitleObserver = new MutationObserver(() => queueMicrotask(keepModernTitle));
    title.__modernHealthTitleObserver.observe(title, { childList: true, characterData: true, subtree: true });
  }
  keepModernTitle();
  return true;
}
