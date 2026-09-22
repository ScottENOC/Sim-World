import assert from 'node:assert/strict';
import { Clock } from '../js/core/clock.js';
import { diseaseAttentionNotice, informationalEventNotice } from '../js/ui/playerAttentionUi.js';

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
  assert.equal(notice.action, 'open-steward');
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
  const notice = informationalEventNotice('Construction complete', 'The granary is finished.');
  assert.deepEqual(notice, { title: 'Construction complete', body: 'The granary is finished.' });
}

console.log('Player attention regressions passed.');
