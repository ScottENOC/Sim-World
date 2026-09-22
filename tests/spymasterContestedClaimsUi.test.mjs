import assert from 'node:assert/strict';
import { renderContestedClaimsBrief } from '../js/ui/spymasterContestedClaimsUi.js';

const player={
  report:{informationIntegrity:{
    sharedReality:.44,postTruthPressure:.61,syntheticMediaPressure:.72,attributionConfidence:.38,
    contestedClaims:[{
      id:'school-strike',headline:'Reports say a school was struck',ageDays:4,
      confidence:.83,attributionConfidence:.31,evidenceCount:5,independentSourceCount:4,
      provenance:.76,forensicSupport:.68,narrativeCount:2,syntheticMediaCouldExplainEvidence:.24,
    }],
  }},
  informationIntegrity:{incidents:[{
    id:'school-strike',narratives:[
      {kind:'denial_synthetic',reach:.72,sourceReliability:.4},
      {kind:'alternative_actor',reach:.48,sourceReliability:.55},
    ],
  }]},
};

const html=renderContestedClaimsBrief(player);
assert.match(html,/Contested information/);
assert.match(html,/Event confidence/);
assert.match(html,/83%/);
assert.match(html,/Attribution confidence/);
assert.match(html,/31%/);
assert.match(html,/5 evidence items/);
assert.match(html,/4 independent sources/);
assert.match(html,/denial synthetic/);
assert.match(html,/Synthetic-media explanation remains plausible/);
assert.match(html,/not hidden truth/i);
assert(!html.includes('strategicTruthKnown'),'UI must not expose hidden truth fields');

const empty=renderContestedClaimsBrief({report:{informationIntegrity:{contestedClaims:[]}}});
assert.match(empty,/No major contested public claims/);

console.log('Spymaster contested claims UI regressions passed.');
