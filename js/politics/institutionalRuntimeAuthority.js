import { chooseNpcInstitutionalApprovals, requestExecutiveAction } from './institutionalActions.js?v=20260916-institution-actions1';
import { registerInstitutionalRefusal } from './institutionalCrises.js?v=20260916-institution-integration1';

function worldState() {
  return globalThis?.window?.__worldsim || globalThis?.__worldsim || null;
}

export function runtimePolities(options = {}) {
  return options.polities || worldState()?.polities || [];
}

export function governingPolityForRegion(region, polities = []) {
  const id = region?.governance?.sovereignPolityId || region?.polityId;
  return polities.find((polity) => polity?.id === id) || null;
}

export function authoriseRuntimeGovernmentAction(region, action, options = {}) {
  const polities = runtimePolities(options);
  const polity = governingPolityForRegion(region, polities);
  // Older saves, isolated unit tests and pre-institutional regions have no
  // registered polity. Preserve their legacy behaviour rather than making
  // diplomacy impossible merely because institutional state is absent.
  if (!polity) return { governed: false, allowed: true, action, approvals: [], reason: 'untracked_government' };

  let institutionalDecision = null;
  let approvals = Array.isArray(options.approvals) ? options.approvals : null;
  if (!approvals) {
    institutionalDecision = chooseNpcInstitutionalApprovals(
      polity,
      action,
      options.context || {},
      options.rng || Math.random,
    );
    approvals = institutionalDecision.approvals || [];
  }
  const result = requestExecutiveAction(polity, action, approvals);

  if (!result.allowed && options.registerRefusal !== false) {
    registerInstitutionalRefusal(polity, action, {
      ...(options.context || {}),
      power: result.power,
      tick: options.currentTick,
    });
  }
  return { governed: true, action, polity, institutionalDecision, approvals, ...result };
}
