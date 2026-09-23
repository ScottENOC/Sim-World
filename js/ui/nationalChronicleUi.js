import { chronicleEntries, ensureNationalChronicle } from '../history/nationalChronicle.js';

const MAX_RENDERED_ENTRIES = 100;

function polityFor(world, polityId) {
  return (world?.polities || []).find((polity) => polity?.id === polityId) || null;
}

function currentFilters(section) {
  return {
    category: section.querySelector('[data-chronicle-category]')?.value || 'all',
    kind: section.querySelector('[data-chronicle-kind]')?.value || 'all',
    query: section.querySelector('[data-chronicle-search]')?.value || '',
  };
}

function humanise(value) {
  const text = String(value || '').replaceAll('_', ' ');
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function renderRows(section, world) {
  const playerPolityId = world?.activePlayerPolityId;
  if (!playerPolityId) return;
  const filters = currentFilters(section);
  const entries = chronicleEntries(world, playerPolityId, filters);
  const list = section.querySelector('[data-chronicle-list]');
  const summary = section.querySelector('[data-chronicle-summary]');
  if (!list || !summary) return;
  list.replaceChildren();
  summary.textContent = entries.length > MAX_RENDERED_ENTRIES
    ? `${entries.length.toLocaleString()} matching records · showing newest ${MAX_RENDERED_ENTRIES}`
    : `${entries.length.toLocaleString()} matching record${entries.length === 1 ? '' : 's'}`;
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'advisor-note';
    empty.textContent = 'No chronicle entries match these filters.';
    list.appendChild(empty);
    return;
  }
  for (const entry of entries.slice(0, MAX_RENDERED_ENTRIES)) {
    const row = document.createElement('div');
    row.className = 'advisor-note';
    const heading = document.createElement('strong');
    heading.textContent = `${entry.dateLabel || 'Undated'} — ${entry.title || 'Historical event'}`;
    const body = document.createElement('div');
    body.textContent = entry.body || '';
    const meta = document.createElement('small');
    meta.textContent = [entry.category, entry.kind, entry.channel].filter(Boolean).map(humanise).join(' · ');
    row.append(heading, body, meta);
    list.appendChild(row);
  }
}

function rebuildKindOptions(section, world, keepValue = 'all') {
  const category = section.querySelector('[data-chronicle-category]')?.value || 'all';
  const select = section.querySelector('[data-chronicle-kind]');
  if (!select) return;
  const polityId = world?.activePlayerPolityId;
  const kinds = [...new Set(chronicleEntries(world, polityId, { category, newestFirst: false }).map((entry) => entry.kind).filter(Boolean))].sort();
  select.replaceChildren(new Option('All record types', 'all'));
  for (const value of kinds) select.append(new Option(humanise(value), value));
  select.value = kinds.includes(keepValue) ? keepValue : 'all';
}

export function renderNationalChronicle(world = globalThis.__worldsim, { defaultCategory = 'technology' } = {}) {
  if (typeof document === 'undefined') return;
  const content = document.getElementById('advisor-content');
  const activeSpymaster = document.querySelector('[data-advisor="spymaster"].active');
  if (!content || !activeSpymaster || !world?.activePlayerPolityId) return;
  const polity = polityFor(world, world.activePlayerPolityId);
  const chronicle = ensureNationalChronicle(polity);
  if (!chronicle) return;
  const previous = content.querySelector('[data-national-chronicle]');
  const previousFilters = previous ? currentFilters(previous) : null;
  previous?.remove();
  const categories = [...new Set(chronicle.entries.map((entry) => entry.category).filter(Boolean))].sort();
  if (!categories.includes('technology')) categories.unshift('technology');
  const section = document.createElement('section');
  section.className = 'advisor-section';
  section.dataset.nationalChronicle = '1';
  const heading = document.createElement('h3');
  heading.textContent = 'National chronicle';
  section.appendChild(heading);
  const intro = document.createElement('p');
  intro.className = 'advisor-note';
  intro.textContent = 'A permanent record of events remembered by the state: discoveries, wars, rulers, political changes, disasters, religious shifts, territorial changes and other national milestones.';
  section.appendChild(intro);
  const categoryLabel = document.createElement('label');
  categoryLabel.className = 'advisor-field';
  const categoryText = document.createElement('span');
  categoryText.textContent = 'Category';
  const category = document.createElement('select');
  category.dataset.chronicleCategory = '1';
  category.append(new Option('All records', 'all'));
  for (const value of categories) category.append(new Option(humanise(value), value));
  const wantedCategory = previousFilters?.category || defaultCategory;
  category.value = categories.includes(wantedCategory) || wantedCategory === 'all' ? wantedCategory : 'all';
  categoryLabel.append(categoryText, category);
  section.appendChild(categoryLabel);
  const kindLabel = document.createElement('label');
  kindLabel.className = 'advisor-field';
  const kindText = document.createElement('span');
  kindText.textContent = 'Record type';
  const kind = document.createElement('select');
  kind.dataset.chronicleKind = '1';
  kindLabel.append(kindText, kind);
  section.appendChild(kindLabel);
  const searchLabel = document.createElement('label');
  searchLabel.className = 'advisor-field';
  const searchText = document.createElement('span');
  searchText.textContent = 'Search chronicle';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Event, country, ruler, technology, date…';
  search.dataset.chronicleSearch = '1';
  search.value = previousFilters?.query || '';
  searchLabel.append(searchText, search);
  section.appendChild(searchLabel);
  const summary = document.createElement('p');
  summary.className = 'advisor-note';
  summary.dataset.chronicleSummary = '1';
  section.appendChild(summary);
  const list = document.createElement('div');
  list.className = 'intelligence-list';
  list.dataset.chronicleList = '1';
  section.appendChild(list);
  rebuildKindOptions(section, world, previousFilters?.kind || 'all');
  category.addEventListener('change', () => { rebuildKindOptions(section, world); renderRows(section, world); });
  kind.addEventListener('change', () => renderRows(section, world));
  search.addEventListener('input', () => renderRows(section, world));
  content.appendChild(section);
  renderRows(section, world);
}

export function openNationalChronicle() {
  if (typeof document === 'undefined') return;
  document.getElementById('btn-council')?.click();
  queueMicrotask(() => {
    document.querySelector('[data-advisor="spymaster"]')?.click();
    queueMicrotask(() => renderNationalChronicle());
  });
}
