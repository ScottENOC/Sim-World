import assert from 'node:assert/strict';
import { Clock } from '../js/core/clock.js';
import { diseaseAttentionNotice, informationalEventNotice, quarantineAdviceForBurden } from '../js/ui/playerAttentionUi.js';

{
  const clock = new Clock({ now: () => 0, requestFrame: () => 1, cancelFrame: () => {} });
  assert.equal(clock.setSpeed(2), true);
  clock.requestAutoPause();
  assert.equal(clock.speed, 0, 'decision auto-pause should stop the clock');
  clock.releaseAutoPause();
  assert.equal(clock.speed, 2, 'resolving the last decision should restore the previous speed');
}

{
  const clock = new Clock({ now: () => 0, requestFrame: () => 1, cancelFrame: () => {} });
  clock.setSpeed(0);
  clock.requestAutoPause();
  clock.releaseAutoPause();
  assert.equal(clock.speed, 0, 'a game that was already manually paused must stay paused');
}

{
  const clock = new Clock({ now: () => 0, requestFrame: () => 1, cancelFrame: () => {} });
  clock.setSpeed(4);
  clock.requestAutoPause();
  clock.requestAutoPause();
  clock.releaseAutoPause();
  assert.equal(clock.speed, 0, 'nested pending decisions must keep the game paused');
  clock.releaseAutoPause();
  assert.equal(clock.speed, 4, 'the final resolved decision should restore speed once');
}

{
  assert.equal(quarantineAdviceForBurden(1.2, 1), null, 'trivial disease burden should not prompt movement controls');
  assert.equal(quarantineAdviceForBurden(2.5, 1)?.policy, 0.3, 'moderate illness should prompt inspect-and-isolate advice');
  assert.equal(quarantineAdviceForBurden(4.8, 12)?.policy, 0.65, 'material spread should prompt traveller quarantine advice');
  assert.equal(quarantineAdviceForBurden(8.2, 40)?.policy, 1, 'severe outbreaks should prompt cordon-and-market-closure advice');
}

{
  const notice = diseaseAttentionNotice(
    'Enteric disease recognised',
    'Local authorities now recognise an outbreak of Enteric disease. Estimated prevalence is 1.2%, with about 1 recent deaths.',
  );
  assert.equal(notice, null, 'small low-mortality outbreaks should not demand ruler attention');
}

{
  const notice = diseaseAttentionNotice(
    'Enteric disease recognised',
    'Local authorities now recognise an outbreak of Enteric disease. Estimated prevalence is 4.8%, with about 12 recent deaths.',
  );
  assert.ok(notice, 'material outbreaks should reach the ruler');
  assert.equal(notice.advisor, 'steward');
  assert.equal(notice.action, 'open-advisor:steward');
  assert.equal(notice.recommendedQuarantinePolicy, 0.65);
  assert.match(notice.actionLabel, /Quarantine travellers/i);
  assert.match(notice.body, /Steward recommends quarantining travellers/i);
  assert.ok(!notice.body.includes('4.8%'), 'player-facing disease note should not expose exact prevalence');
  assert.ok(!notice.body.includes('Enteric disease'), 'pre-germ-theory notice should use symptoms rather than modern taxonomy');
  assert.match(notice.body, /stomach and bowel sickness/i);
}

{
  const notice = informationalEventNotice(
    'Event: mass demobilisation',
    'An event occurred, but no dedicated presentation is available yet.',
  );
  assert.equal(notice, null, 'generic unpresented simulation events should never become ruler interruptions');
}

{
  const notice = informationalEventNotice(
    'Breakthrough: Iron smelting',
    'Smiths have learnt to smelt iron.',
  );
  assert.equal(notice, null, 'legacy capital breakthrough cards should be suppressed because technology attention owns the report');
}

{
  const notice = informationalEventNotice('Construction complete', 'The granary is finished.');
  assert.equal(notice.advisor, 'steward');
  assert.equal(notice.title, 'Construction complete');
  assert.equal(notice.body, 'The granary is finished.');
  assert.equal(notice.action, 'open-advisor:steward');
  assert.equal(notice.actionLabel, 'Review with Steward');
}

console.log('Player attention regressions passed.');
