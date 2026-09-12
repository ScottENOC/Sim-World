import {
  dismissMercenaryCompany,
  grantCompanyCharter,
  hireMercenaryCompany,
  joinOrganisation,
  leaveOrganisation,
  organisationActions,
  recogniseFreeCity,
  revokeCompanyCharter,
  suppressPirateHaven,
  toleratePirateHaven,
  votePooledAuthority,
} from '../politics/nonStateInteractions.js?v=20260912-organisations2';

function currentTick(world) {
  return Math.floor((world.clock?.elapsedDays || 0) / 7);
}

function playerState() {
  const world = window.__worldsim;
  if (!world?.activePlayerPolityId) return null;
  const polity = world.polities?.find((item) => item.id === world.activePlayerPolityId);
  const capital = polity ? world.regions?.find((region) => region.id === polity.capitalRegionId) : null;
  return polity && capital ? { world, polity, capital } : null;
}

function label(type) {
  return ({
    free_city: 'Free city', pirate_haven: 'Pirate haven', mercenary_company: 'Mercenary company',
    merchant_league: 'Merchant league', chartered_company: 'Chartered company',
    interstate_league: 'Interstate league', supranational_union: 'Supranational union',
  })[type] || String(type).replaceAll('_', ' ');
}

function addStatus(host, text) {
  const p = document.createElement('p');
  p.className = 'save-status';
  p.textContent = text;
  host.appendChild(p);
}

function button(text, action) {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = text;
  el.addEventListener('click', action);
  return el;
}

function render(host) {
  const state = playerState();
  host.replaceChildren();
  const title = document.createElement('h3');
  title.textContent = 'Independent organisations';
  host.appendChild(title);

  if (!state) {
    addStatus(host, 'Choose a starting region first.');
    return;
  }
  const { world, polity, capital } = state;
  const rows = organisationActions(world.religiousWorld, polity.id, world.regions, world.polities)
    .filter((row) => row.isHostSovereign || row.isMember || row.contract || row.canHire || row.canJoin || row.canRecognise);

  if (!rows.length) {
    addStatus(host, 'No independent organisation is currently relevant to your government. As cities, companies, leagues and other actors emerge, relations with them will appear here.');
    return;
  }

  for (const row of rows) {
    const org = row.organisation;
    const card = document.createElement('div');
    card.className = 'raid-status';
    const heading = document.createElement('strong');
    heading.textContent = `${org.name} · ${label(org.type)}`;
    card.appendChild(heading);
    addStatus(card, `Treasury ${Math.round(org.treasury || 0).toLocaleString()} · influence ${Math.round((org.influence || 0) * 100)}% · autonomy ${Math.round((org.autonomy || 0) * 100)}%${org.memberPolityIds?.size ? ` · ${org.memberPolityIds.size} state member${org.memberPolityIds.size === 1 ? '' : 's'}` : ''}.`);
    if (row.contract) addStatus(card, `You hire ${Math.round(row.contract.personnel).toLocaleString()} personnel for ${row.contract.monthlyCost.toFixed(1)} treasury/month.`);
    if (org.type === 'interstate_league' || org.type === 'supranational_union') addStatus(card, `Pooled sovereignty ${Math.round((org.pooledSovereignty || 0) * 100)}% · common authority ${Math.round((org.authority || 0) * 100)}%.`);

    const actions = document.createElement('div');
    actions.className = 'save-actions';
    const run = (fn) => {
      const result = fn();
      if (!result?.changed && result?.reason) window.alert(String(result.reason).replaceAll('_', ' '));
      render(host);
    };

    if (row.canHire) actions.appendChild(button('Hire company', () => run(() => hireMercenaryCompany(world.religiousWorld, org.id, polity.id, capital.id, world.regions, world.polities, Math.max(100, Math.floor((org.militaryCapacity || 0) * 0.5)), currentTick(world)))));
    if (row.canDismiss) actions.appendChild(button('End contract', () => run(() => dismissMercenaryCompany(world.religiousWorld, org.id, polity.id, world.regions))));
    if (row.canRecognise) actions.appendChild(button('Recognise free city', () => run(() => recogniseFreeCity(world.religiousWorld, org.id, polity.id, world.polities))));
    if (row.canTolerate) actions.appendChild(button('Tolerate / take tribute', () => run(() => toleratePirateHaven(world.religiousWorld, org.id, polity.id, world.polities))));
    if (row.canSuppress) actions.appendChild(button('Suppress pirates', () => run(() => suppressPirateHaven(world.religiousWorld, org.id, polity.id, world.regions, world.polities))));
    if (row.canGrantCharter && org.charteringPolityId !== polity.id) actions.appendChild(button('Grant charter', () => run(() => grantCompanyCharter(world.religiousWorld, org.id, polity.id, world.regions, world.polities))));
    if (row.canRevokeCharter) actions.appendChild(button('Revoke charter', () => run(() => revokeCompanyCharter(world.religiousWorld, org.id, polity.id, world.polities))));
    if (row.canJoin) actions.appendChild(button('Join', () => run(() => joinOrganisation(world.religiousWorld, org.id, polity.id, world.polities))));
    if (row.canLeave) actions.appendChild(button('Leave', () => run(() => leaveOrganisation(world.religiousWorld, org.id, polity.id))));
    if (row.canVote) {
      actions.appendChild(button('Vote to pool more authority', () => run(() => votePooledAuthority(world.religiousWorld, org.id, polity.id, true, world.polities))));
      actions.appendChild(button('Vote against integration', () => run(() => votePooledAuthority(world.religiousWorld, org.id, polity.id, false, world.polities))));
    }
    if (actions.children.length) card.appendChild(actions);
    host.appendChild(card);
  }
}

function mount() {
  const menuCard = document.querySelector('#menu-modal .menu-card');
  if (!menuCard || document.getElementById('organisation-menu-section')) return;
  const section = document.createElement('div');
  section.id = 'organisation-menu-section';
  section.className = 'menu-section';
  menuCard.insertBefore(section, menuCard.querySelector('.menu-section:last-of-type'));
  render(section);
  document.getElementById('btn-menu')?.addEventListener('click', () => render(section));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 0));
else setTimeout(mount, 0);
