import './technologyAttentionUi.js?v=20260923-tech-attention1';
import { advisorForReport, advisorFramedTitle, advisorReviewLabel } from './advisorAttention.js?v=20260923-advisor-attention1';

const DEFAULT_NOTICE_TTL_MS = 12000;
const MAX_VISIBLE_NOTICES = 4;
const GENERIC_UNPRESENTED_EVENT = 'An event occurred, but no dedicated presentation is available yet.';

const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();

function parseDiseaseNumbers(body) {
  const prevalenceMatch = body.match(/Estimated prevalence(?: is| has reached)?\s+([\d.]+)%/i);
  const deathsMatch = body.match(/about\s+([\d,]+)\s+recent deaths/i);
  return {
    prevalencePct: prevalenceMatch ? Math.max(0, Number(prevalenceMatch[1]) || 0) : 0,
    deaths: deathsMatch ? Math.max(0, Number(deathsMatch[1].replaceAll(',', '')) || 0) : 0,
  };
}

function diseaseSymptomDescription(title) {
  const lower = title.toLowerCase();
  if (lower.includes('enteric')) return 'stomach and bowel sickness';
  if (lower.includes('respiratory')) return 'fever and coughing illness';
  if (lower.includes('smallpox')) return 'a pox-like sickness';
  if (lower.includes('plague')) return 'a dangerous fever';
  return 'sickness';
}

export function quarantineAdviceForBurden(prevalencePct, deaths) {
  const prevalence = Math.max(0, Number(prevalencePct) || 0);
  const recentDeaths = Math.max(0, Number(deaths) || 0);
  if (prevalence >= 7 || recentDeaths >= 25) {
    return {
      policy: 1,
      label: 'Cordon and close markets',
      sentence: 'The Steward recommends cordoning affected areas and closing markets until the outbreak eases.',
    };
  }
  if (prevalence >= 4 || recentDeaths >= 5) {
    return {
      policy: 0.65,
      label: 'Quarantine travellers',
      sentence: 'The Steward recommends quarantining travellers and tightening movement controls while the outbreak is active.',
    };
  }
  if (prevalence >= 2) {
    return {
      policy: 0.3,
      label: 'Inspect and isolate',
      sentence: 'The Steward recommends inspecting travellers and isolating suspected cases before the sickness spreads further.',
    };
  }
  return null;
}

export function diseaseAttentionNotice(title, body) {
  const { prevalencePct, deaths } = parseDiseaseNumbers(body);
  if (prevalencePct < 2 && deaths < 5) return null;

  const symptom = diseaseSymptomDescription(title);
  const severe = prevalencePct >= 7 || deaths >= 25;
  const substantial = prevalencePct >= 4 || deaths >= 5;
  const advice = quarantineAdviceForBurden(prevalencePct, deaths);
  let message;
  if (severe) message = `The Steward reports that ${symptom} is causing serious disruption and an unusual number of deaths.`;
  else if (substantial) message = `The Steward reports that ${symptom} is spreading noticeably through the populace.`;
  else message = `The populace appears to be suffering through a particularly bad spell of ${symptom}.`;
  if (advice) message = `${message} ${advice.sentence}`;

  return {
    advisor: 'steward',
    title: severe ? 'Serious illness in the realm' : 'Illness reported',
    body: message,
    actionLabel: advice ? `Review: ${advice.label}` : 'Review with Steward',
    action: 'open-advisor:steward',
    recommendedQuarantinePolicy: advice?.policy ?? null,
  };
}

export function informationalEventNotice(title, body) {
  const cleanTitle = compact(title);
  const cleanBody = compact(body);
  if (!cleanBody || cleanBody === GENERIC_UNPRESENTED_EVENT) return null;
  if (/^Breakthrough:/i.test(cleanTitle)) return null;
  if (/\b(recognised|outbreak)\b/i.test(cleanTitle) && /Estimated prevalence/i.test(cleanBody)) {
    return diseaseAttentionNotice(cleanTitle, cleanBody);
  }
  const advisor = advisorForReport(cleanTitle, cleanBody);
  return {
    advisor,
    title: cleanTitle || 'Report',
    body: cleanBody,
    actionLabel: advisorReviewLabel(advisor),
    action: `open-advisor:${advisor}`,
  };
}

function ensureStylesheet() {
  if (document.querySelector('link[data-player-attention-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/player-attention.css?v=20260923-attention1';
  link.dataset.playerAttentionStyle = '1';
  document.head.appendChild(link);
}

function ensureHost() {
  let host = document.getElementById('player-attention-feed');
  if (host) return host;
  host = document.createElement('section');
  host.id = 'player-attention-feed';
  host.className = 'player-attention-feed';
  host.setAttribute('aria-label', 'Recent reports from the council');
  host.setAttribute('aria-live', 'polite');
  (document.getElementById('app') || document.body).appendChild(host);
  return host;
}

function openAdvisor(advisorId = 'chancellor') {
  document.getElementById('btn-council')?.click();
  queueMicrotask(() => document.querySelector(`[data-advisor="${advisorId}"]`)?.click());
}

function removeNotice(card) {
  if (!card?.isConnected) return;
  card.classList.add('leaving');
  setTimeout(() => card.remove(), 220);
}

export function pushPlayerNotice({ title = 'Report', body = '', advisor = null, actionLabel = null, action = null, ttlMs = DEFAULT_NOTICE_TTL_MS } = {}) {
  if (typeof document === 'undefined') return null;
  ensureStylesheet();
  const host = ensureHost();
  const resolvedAdvisor = advisor || advisorForReport(title, body);
  const card = document.createElement('article');
  card.className = 'player-attention-card';
  card.dataset.advisor = resolvedAdvisor;

  const heading = document.createElement('strong');
  heading.className = 'player-attention-title';
  heading.textContent = advisorFramedTitle(title, resolvedAdvisor);
  card.appendChild(heading);

  const text = document.createElement('p');
  text.textContent = body;
  card.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'player-attention-actions';
  const resolvedActionLabel = actionLabel || advisorReviewLabel(resolvedAdvisor);
  const resolvedAction = action || `open-advisor:${resolvedAdvisor}`;
  if (resolvedActionLabel) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = resolvedActionLabel;
    actionButton.addEventListener('click', () => {
      if (typeof resolvedAction === 'string' && resolvedAction.startsWith('open-advisor:')) {
        openAdvisor(resolvedAction.slice('open-advisor:'.length));
      } else if (typeof resolvedAction === 'function') resolvedAction();
    });
    actions.appendChild(actionButton);
  }
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'player-attention-dismiss';
  dismiss.setAttribute('aria-label', 'Dismiss report');
  dismiss.textContent = '×';
  dismiss.addEventListener('click', () => removeNotice(card));
  actions.appendChild(dismiss);
  card.appendChild(actions);

  host.prepend(card);
  while (host.children.length > MAX_VISIBLE_NOTICES) host.lastElementChild?.remove();
  setTimeout(() => removeNotice(card), Math.max(2500, Number(ttlMs) || DEFAULT_NOTICE_TTL_MS));
  return card;
}

function decorateDecisionModal() {
  const modal = document.getElementById('event-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (document.getElementById('btn-event-continue')) return;
  const options = document.getElementById('event-options');
  if (!options?.querySelector('button')) return;
  const titleElement = document.getElementById('event-title');
  const bodyElement = document.getElementById('event-body');
  if (!titleElement) return;
  if (titleElement.dataset.advisorFramed === '1' && titleElement.textContent === titleElement.dataset.advisorFramedTitle) return;
  const advisor = advisorForReport(titleElement.textContent || '', bodyElement?.textContent || '');
  const framed = advisorFramedTitle(titleElement.textContent || 'Decision required', advisor);
  titleElement.textContent = framed;
  titleElement.dataset.advisorFramed = '1';
  titleElement.dataset.advisorFramedTitle = framed;
  modal.dataset.advisor = advisor;
}

function convertInformationalModal() {
  const modal = document.getElementById('event-modal');
  if (!modal || modal.classList.contains('hidden')) return false;
  const continueButton = document.getElementById('btn-event-continue');
  if (!continueButton || !modal.contains(continueButton)) return false;

  const titleElement = document.getElementById('event-title');
  if (titleElement) {
    delete titleElement.dataset.advisorFramed;
    delete titleElement.dataset.advisorFramedTitle;
  }
  const title = titleElement?.textContent || 'Report';
  const body = document.getElementById('event-body')?.textContent || '';
  const notice = informationalEventNotice(title, body);
  if (notice) pushPlayerNotice(notice);

  continueButton.click();
  return true;
}

function routeCurrentModal() {
  if (!convertInformationalModal()) decorateDecisionModal();
}

function installPlayerAttentionFeed() {
  ensureStylesheet();
  ensureHost();
  const modal = document.getElementById('event-modal');
  if (!modal) return;
  const observer = new MutationObserver(() => queueMicrotask(routeCurrentModal));
  observer.observe(modal, { attributes: true, childList: true, subtree: true, characterData: true });
  routeCurrentModal();
  globalThis.__playerAttention = { push: pushPlayerNotice, openAdvisor };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPlayerAttentionFeed, { once: true });
  else installPlayerAttentionFeed();
}
