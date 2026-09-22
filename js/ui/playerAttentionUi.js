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
    title: severe ? 'Serious illness in the realm' : 'Illness reported',
    body: message,
    actionLabel: advice ? `Review: ${advice.label}` : 'Review with Steward',
    action: 'open-steward',
    recommendedQuarantinePolicy: advice?.policy ?? null,
  };
}

export function informationalEventNotice(title, body) {
  const cleanTitle = compact(title);
  const cleanBody = compact(body);
  if (!cleanBody || cleanBody === GENERIC_UNPRESENTED_EVENT) return null;
  if (/\b(recognised|outbreak)\b/i.test(cleanTitle) && /Estimated prevalence/i.test(cleanBody)) {
    return diseaseAttentionNotice(cleanTitle, cleanBody);
  }
  return { title: cleanTitle || 'Report', body: cleanBody };
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
  host.setAttribute('aria-label', 'Recent reports');
  host.setAttribute('aria-live', 'polite');
  (document.getElementById('app') || document.body).appendChild(host);
  return host;
}

function openSteward() {
  document.getElementById('btn-council')?.click();
  queueMicrotask(() => document.querySelector('[data-advisor="steward"]')?.click());
}

function removeNotice(card) {
  if (!card?.isConnected) return;
  card.classList.add('leaving');
  setTimeout(() => card.remove(), 220);
}

export function pushPlayerNotice({ title = 'Report', body = '', actionLabel = null, action = null, ttlMs = DEFAULT_NOTICE_TTL_MS } = {}) {
  if (typeof document === 'undefined') return null;
  ensureStylesheet();
  const host = ensureHost();
  const card = document.createElement('article');
  card.className = 'player-attention-card';

  const heading = document.createElement('strong');
  heading.className = 'player-attention-title';
  heading.textContent = title;
  card.appendChild(heading);

  const text = document.createElement('p');
  text.textContent = body;
  card.appendChild(text);

  const actions = document.createElement('div');
  actions.className = 'player-attention-actions';
  if (actionLabel) {
    const actionButton = document.createElement('button');
    actionButton.type = 'button';
    actionButton.textContent = actionLabel;
    actionButton.addEventListener('click', () => {
      if (action === 'open-steward') openSteward();
      else if (typeof action === 'function') action();
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

function convertInformationalModal() {
  const modal = document.getElementById('event-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  const continueButton = document.getElementById('btn-event-continue');
  if (!continueButton || !modal.contains(continueButton)) return;

  const title = document.getElementById('event-title')?.textContent || 'Report';
  const body = document.getElementById('event-body')?.textContent || '';
  const notice = informationalEventNotice(title, body);
  if (notice) pushPlayerNotice(notice);

  // Continue is deliberately invoked programmatically. Existing event code owns
  // queue progression and auto-pause accounting; this layer only changes how a
  // no-decision event is presented to the player.
  continueButton.click();
}

function installPlayerAttentionFeed() {
  ensureStylesheet();
  ensureHost();
  const modal = document.getElementById('event-modal');
  if (!modal) return;
  const observer = new MutationObserver(() => queueMicrotask(convertInformationalModal));
  observer.observe(modal, { attributes: true, childList: true, subtree: true, characterData: true });
  convertInformationalModal();
  globalThis.__playerAttention = { push: pushPlayerNotice };
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installPlayerAttentionFeed, { once: true });
  else installPlayerAttentionFeed();
}
