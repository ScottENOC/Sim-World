// One tick = one game-week. Real-time speed is how often ticks fire, not
// how much happens per tick — that keeps the sim's math independent of
// how fast the player has the clock running.
const MS_PER_TICK_AT_1X = 600; // 1x = ~0.6s per game-week

export class Clock {
  constructor() {
    this.tickIndex = 0;       // weeks since game start
    this.speed = 1;           // 0 = paused, 1/2/4 = multiplier
    this._lastFrameTime = 0;
    this._accumulatorMs = 0;
    this._tickListeners = [];
    this._pendingResponseRequired = 0; // count of events awaiting a decision
    this._rafHandle = null;
  }

  onTick(fn) {
    this._tickListeners.push(fn);
  }

  setSpeed(speed) {
    if (this._pendingResponseRequired > 0 && speed !== 0) {
      // Can't un-pause past a response-required event.
      return;
    }
    this.speed = speed;
  }

  togglePause() {
    this.setSpeed(this.speed === 0 ? 1 : 0);
  }

  // Called by the event scheduler when a response-required popup appears.
  requestAutoPause() {
    this._pendingResponseRequired++;
    this.speed = 0;
  }

  // Called once the player resolves that popup.
  releaseAutoPause() {
    this._pendingResponseRequired = Math.max(0, this._pendingResponseRequired - 1);
  }

  // Auto-throttle: as more decisions are queued up, cap the max speed so
  // the player doesn't blow past things that need attention. This is what
  // stands in for "slows down over time" — it tracks how much is happening,
  // not the calendar date.
  effectiveMaxSpeed(pendingEventCount) {
    if (pendingEventCount >= 3) return 1;
    if (pendingEventCount >= 1) return 2;
    return 4;
  }

  start() {
    const loop = (now) => {
      if (this._lastFrameTime === 0) this._lastFrameTime = now;
      const dt = now - this._lastFrameTime;
      this._lastFrameTime = now;

      if (this.speed > 0) {
        this._accumulatorMs += dt * this.speed;
        const msPerTick = MS_PER_TICK_AT_1X;
        while (this._accumulatorMs >= msPerTick) {
          this._accumulatorMs -= msPerTick;
          this.tickIndex++;
          for (const fn of this._tickListeners) fn(this.tickIndex);
        }
      }
      this._rafHandle = requestAnimationFrame(loop);
    };
    this._rafHandle = requestAnimationFrame(loop);
  }

  stop() {
    if (this._rafHandle) cancelAnimationFrame(this._rafHandle);
  }

  // Human-readable in-game date from tickIndex, given a start year.
  formatDate(startYear) {
    const totalWeeks = this.tickIndex;
    const year = startYear + Math.floor(totalWeeks / 52);
    const week = (totalWeeks % 52) + 1;
    const era = year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
    return `Week ${week}, ${era}`;
  }
}
