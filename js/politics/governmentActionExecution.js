import { launchCampaign } from '../military/campaigns.js?v=20260916-institution-actions1';
import { setMilitaryPolicy } from '../military/policies.js?v=20260916-institution-actions1';
import { polityById } from './polities.js?v=20260916-institution-actions1';
import { chooseNpcInstitutionalApprovals, requestExecutiveAction } from './institutionalActions.js?v=20260916-institution-actions1';
import { registerInstitutionalRefusal } from './institutionalCrises.js?v=20260916-institution-integration1';

function governingPolity(region, polities = []) {
  const id = region?.governance?.sovereignPolityId || region?.polityId;
  return polityById(polities, id);
}

function authorisation(polity, action, options = {}) {
  if (!polity) return { allowed: false, reason: 'no_governing_polity', action };
  if (options.npc) {
    const decision = chooseNpcInstitutionalApprovals(polity, action, options.context || {}, options.rng || Math.random);
    const result = { allowed: decision.approved, ...decision.result, institutionalDecision: decision };
    if (!result.allowed) registerInstitutionalRefusal(polity, action, { ...(options.context || {}), power: result.power, tick: options.currentTick });
    return result;
  }
  const result = requestExecutiveAction(polity, action, options.approvals || []);
  if (!result.allowed && options.registerRefusal) registerInstitutionalRefusal(polity, action, { ...(options.context || {}), power: result.power, tick: options.currentTick });
  return result;
}

export function executeGovernmentAction(region, action, effect, polities, options = {}) {
  const polity = governingPolity(region, polities);
  const approval = authorisation(polity, action, options);
  if (!approval.allowed) return { changed: false, result: null, authorisation: approval };
  const result = typeof effect === 'function' ? effect() : null;
  return { changed: result !== false, result, authorisation: approval };
}

export function executeGovernmentMilitaryPolicy(region, key, value, polities, options = {}) {
  return executeGovernmentAction(region, 'change_military_policy', () => setMilitaryPolicy(region, key, value), polities, options);
}

export function executeGovernmentCampaign(attacker, defender, objective, requestedPersonnel, currentTick, options = {}) {
  const polity = governingPolity(attacker, options.polities || []);
  const approval = authorisation(polity, 'launch_offensive_war', { ...options, currentTick });
  if (!approval.allowed) return { campaign: null, authorisation: approval };
  const campaign = launchCampaign(attacker, defender, objective, requestedPersonnel, currentTick, options);
  return { campaign, authorisation: approval };
}
