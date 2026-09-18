import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  telephoneAdministrativeMultiplier,
  telephoneMilitaryCommandMultiplier,
  telephoneMobilisationMultiplier,
} from '../js/economy/localCommunications.js';
import { massMobiliseDefender } from '../js/military/campaigns.js';

function defender({ militaryCoordination = 0, administrativeCoordination = 0 } = {}) {
  return {
    population: 20000,
    stability: 1,
    demographics: { workingAge: 10000 },
    army: { personnel: 1000 },
    navy: { personnel: 0 },
    localCommunications: { militaryCoordination, administrativeCoordination },
  };
}

function campaign() {
  return { completed: false, phase: 'engaged', militia: 0, defenderMorale: 0.5 };
}

const unwired = defender();
assert.equal(telephoneAdministrativeMultiplier(unwired), 1);
assert.equal(telephoneMilitaryCommandMultiplier(unwired), 1);
assert.equal(telephoneMobilisationMultiplier(unwired), 1);

const fullyCoordinated = defender({ militaryCoordination: 1, administrativeCoordination: 1 });
assert.equal(telephoneAdministrativeMultiplier(fullyCoordinated), 1.10);
assert.equal(telephoneMilitaryCommandMultiplier(fullyCoordinated), 1.08);
assert.equal(telephoneMobilisationMultiplier(fullyCoordinated), 1.30);

const baseCampaign = campaign();
const baseDefender = defender();
const baseRaised = massMobiliseDefender(baseCampaign, baseDefender, 0.10);
assert.equal(baseRaised, 900, 'baseline weekly mobilisation should use the requested 10% of available manpower');
assert.equal(baseCampaign.mobilisationResponseMultiplier, 1);

const wiredCampaign = campaign();
const wiredDefender = defender({ militaryCoordination: 1 });
const wiredRaised = massMobiliseDefender(wiredCampaign, wiredDefender, 0.10);
assert.equal(wiredRaised, 1170, 'full local telephone coordination should raise 30% more of the requested levy within the same weekly step');
assert.equal(wiredCampaign.mobilisationResponseMultiplier, 1.30);
assert.ok(wiredRaised > baseRaised);

// Telephone accelerates local response but must not alter the eventual manpower ceiling.
const cappedCampaign = campaign();
const cappedDefender = defender({ militaryCoordination: 1 });
const cappedRaised = massMobiliseDefender(cappedCampaign, cappedDefender, 0.25);
assert.equal(cappedRaised, 2250, 'the existing 25% emergency-mobilisation ceiling must remain binding');

// Guard the historical/system boundary: local telephone enters local administrative
// control and corruption, but does not replace the inter-region report-distance formula.
const politiesSource = fs.readFileSync(new URL('../js/politics/polities.js', import.meta.url), 'utf8');
assert.match(politiesSource, /telephoneAdministrativeMultiplier\(region\)/);
assert.match(politiesSource, /telephoneFrictionReduction/);
assert.match(politiesSource, /reportDelayWeeks = Math\.max\(1, Math\.round\(\(centroidDistanceKm/);
assert.doesNotMatch(politiesSource, /reportDelayWeeks[^;]*telephoneAdministrativeMultiplier/s,
  'local telephone service must not magically collapse capital-to-province report travel time');

console.log('telephone administration and mobilisation regressions passed');
