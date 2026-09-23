import { currentScenario } from '../core/scenarios.js?v=20260921-scenarios2';

function modernScenarioActive() {
  return currentScenario()?.rulesProfile === 'modern-crisis';
}

function relabelStewardAttention() {
  for (const card of document.querySelectorAll('[data-advisor="steward"]')) {
    const heading = card.querySelector?.('.player-attention-title');
    if (heading?.textContent?.startsWith('Steward:')) {
      heading.textContent = `Health Minister:${heading.textContent.slice('Steward:'.length)}`;
    }
    for (const button of card.querySelectorAll?.('button') || []) {
      if (/Review with Steward/i.test(button.textContent || '')) button.textContent = 'Review with Health Minister';
    }
  }
  const modal = document.getElementById('event-modal');
  if (modal?.dataset?.advisor === 'steward') {
    const modalTitle = document.getElementById('event-title');
    if (modalTitle?.textContent?.startsWith('Steward:')) {
      modalTitle.textContent = `Health Minister:${modalTitle.textContent.slice('Steward:'.length)}`;
    }
  }
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

  const app = document.getElementById('app') || document.body;
  if (app && !app.__modernHealthAttentionObserver) {
    app.__modernHealthAttentionObserver = new MutationObserver(() => queueMicrotask(relabelStewardAttention));
    app.__modernHealthAttentionObserver.observe(app, { childList: true, subtree: true, characterData: true });
  }
  keepModernTitle();
  relabelStewardAttention();
  return true;
}
