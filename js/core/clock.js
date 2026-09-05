import { TIME_RESOLUTIONS, formatHistoricalDate, resolutionForWorld } from './simTime.js?v=20260905-time1';

// At 1x, one world tick is still 600 ms of wall-clock time. What changes is
// how much historical time that tick represents. Bronze Age starts monthly;
// future capabilities can tighten the cadence without rewriting every system.
export const MS_PER_TICK_AT_1X = 600;
const RUNNING_SPEEDS = [0.5, 1, 2, 4];
const PERFORMANCE_HEADROOM = 1.08;

export class Clock {
  constructor({
    now = () => performance.now(),
    requestFrame = (fn) => requestAnimationFrame(fn),
    cancelFrame = (handle) => cancelAnimationFrame(handle),
  } = {}) {
    this.tickIndex = 0;
    this.elapsedDays = 0;
    this.resolution = TIME_RESOLUTIONS.month;
    this.speed = 1;
    this._resumeSpeed = 1;
    this._nextTickAt = null;
    this._tickListeners = [];
    this._speedListeners = [];
    this._pendingResponseRequired = 0;
    this._rafHandle = null;
    this._estimatedTickMs = null;
    this._now = now;
    this._requestFrame = requestFrame;
    this._cancelFrame = cancelFrame;
  }

  onTick(fn) { this._tickListeners.push(fn); }
  onSpeedChange(fn) { this._speedListeners.push(fn); }

  _emitSpeedChange(detail) {
    for (const fn of this._speedListeners) fn(detail);
  }

  _applySpeed(speed, detail = {}) {
    const previousSpeed = this.speed;
    if (speed === previousSpeed) return true;
    this.speed = speed;
    if (speed > 0) this._resumeSpeed = speed;
    this._nextTickAt = null;
    this._emitSpeedChange({ previousSpeed, speed, ...detail });
    return true;
  }

  setSpeed(speed) {
    if (this._pendingResponseRequired > 0 && speed !== 0) return false;
    if (speed !== 0 && !RUNNING_SPEEDS.includes(speed)) return false;
    return this._applySpeed(speed, { automatic: false, reason: 'player' });
  }

  togglePause() { return this.setSpeed(this.speed === 0 ? this._resumeSpeed : 0); }

  requestAutoPause() {
    this._pendingResponseRequired++;
    this._applySpeed(0, { automatic: true, reason: 'event' });
  }

  releaseAutoPause() {
    this._pendingResponseRequired = Math.max(0, this._pendingResponseRequired - 1);
  }

  effectiveMaxSpeed(pendingEventCount) {
    if (pendingEventCount >= 3) return 1;
    if (pendingEventCount >= 1) return 2;
    return 4;
  }

  setWorldCapabilities(capabilities) {
    this.resolution = resolutionForWorld(capabilities);
  }

  setResolution(resolution) {
    this.resolution = typeof resolution === 'string'
      ? (TIME_RESOLUTIONS[resolution] || this.resolution)
      : (resolution || this.resolution);
  }

  get daysPerTick() { return this.resolution.daysPerTick; }

  _targetIntervalMs(speed = this.speed) { return MS_PER_TICK_AT_1X / speed; }

  _recordTickDuration(durationMs) {
    this._estimatedTickMs = this._estimatedTickMs === null
      ? durationMs
      : this._estimatedTickMs * 0.75 + durationMs * 0.25;
    if (this.speed <= 0 || durationMs * PERFORMANCE_HEADROOM <= this._targetIntervalMs()) return;
    const previousSpeed = this.speed;
    const sustainableSpeed = [...RUNNING_SPEEDS].reverse().find((candidate) => (
      candidate < previousSpeed && durationMs * PERFORMANCE_HEADROOM <= this._targetIntervalMs(candidate)
    )) || 0.5;
    this._applySpeed(sustainableSpeed, { automatic: true, reason: 'performance', tickDurationMs: durationMs });
  }

  start() {
    if (this._rafHandle !== null) return;
    const loop = (frameTime) => {
      if (this.speed > 0) {
        if (this._nextTickAt === null) {
          this._nextTickAt = frameTime + this._targetIntervalMs();
        } else if (frameTime >= this._nextTickAt) {
          const startedAt = this._now();
          const startDay = this.elapsedDays;
          const elapsedDays = this.daysPerTick;
          this.tickIndex++;
          this.elapsedDays += elapsedDays;
          const timeContext = {
            tickIndex: this.tickIndex,
            startDay,
            endDay: this.elapsedDays,
            elapsedDays,
            resolution: this.resolution.id,
          };
          for (const fn of this._tickListeners) fn(timeContext);
          const finishedAt = this._now();
          const durationMs = Math.max(0, finishedAt - startedAt);
          this._recordTickDuration(durationMs);
          if (this.speed > 0) this._nextTickAt = Math.max(finishedAt, startedAt + this._targetIntervalMs());
        }
      } else {
        this._nextTickAt = null;
      }
      this._rafHandle = this._requestFrame(loop);
    };
    this._rafHandle = this._requestFrame(loop);
  }

  stop() {
    if (this._rafHandle !== null) this._cancelFrame(this._rafHandle);
    this._rafHandle = null;
    this._nextTickAt = null;
  }

  formatDate(startYear) { return formatHistoricalDate(startYear, this.elapsedDays); }
}
