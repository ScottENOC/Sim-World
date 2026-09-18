import { TIME_RESOLUTIONS, formatHistoricalDate, resolutionForWorld } from './simTime.js?v=20260905-time1';

// 1x aims for roughly two real seconds per turn. Historical time covered by a
// turn is independent of wall-clock speed and can contract as the simulated
// world develops faster communications, transport and administration.
export const MS_PER_TICK_AT_1X = 2000;
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
    this.worldTempo = { index: 0, daysPerTick: 30, label: 'monthly', signals: {} };
    this.speed = 1;
    this._resumeSpeed = 1;
    this._nextTickAt = null;
    this._tickListeners = [];
    this._speedListeners = [];
    this._pendingResponseRequired = 0;
    this._rafHandle = null;
    this._running = false;
    this._estimatedTickMs = null;
    this._cooperativeYieldMs = 0;
    this._deferUntil = 0;
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

  setWorldTempo(tempo) {
    const daysPerTick = Math.max(1, Math.min(30, Number(tempo?.daysPerTick) || 30));
    this.worldTempo = {
      index: Math.max(0, Math.min(1, Number(tempo?.index) || 0)),
      daysPerTick,
      label: tempo?.label || 'adaptive',
      signals: { ...(tempo?.signals || {}) },
    };
    this.resolution = { id: 'adaptive', label: this.worldTempo.label, daysPerTick };
    return this.worldTempo;
  }

  setResolution(resolution) {
    this.resolution = typeof resolution === 'string'
      ? (TIME_RESOLUTIONS[resolution] || this.resolution)
      : (resolution || this.resolution);
  }

  get daysPerTick() { return this.resolution.daysPerTick; }

  deferForInteraction(ms = 300) {
    this._deferUntil = Math.max(this._deferUntil, this._now() + Math.max(0, ms));
  }

  isInteractionDeferred() {
    return this._now() < this._deferUntil;
  }

  recordCooperativeYield(durationMs) {
    this._cooperativeYieldMs += Math.max(0, Number(durationMs) || 0);
  }

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
    if (this._running || this._rafHandle !== null) return;
    this._running = true;
    const loop = async (frameTime) => {
      this._rafHandle = null;
      if (!this._running) return;
      if (this.speed > 0) {
        if (this._nextTickAt === null) {
          this._nextTickAt = frameTime + this._targetIntervalMs();
        } else if (frameTime >= this._nextTickAt) {
          if (frameTime < this._deferUntil) {
            this._nextTickAt = this._deferUntil;
            if (this._running) this._rafHandle = this._requestFrame(loop);
            return;
          }
          const startedAt = this._now();
          this._cooperativeYieldMs = 0;
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
            worldTempo: this.worldTempo,
          };
          for (const fn of this._tickListeners) {
            const result = fn(timeContext);
            if (result && typeof result.then === 'function') await result;
            if (!this._running) return;
          }
          const finishedAt = this._now();
          const durationMs = Math.max(0, finishedAt - startedAt - this._cooperativeYieldMs);
          this._recordTickDuration(durationMs);
          if (this.speed > 0) this._nextTickAt = Math.max(finishedAt, startedAt + this._targetIntervalMs());
        }
      } else {
        this._nextTickAt = null;
      }
      if (this._running) this._rafHandle = this._requestFrame(loop);
    };
    this._rafHandle = this._requestFrame(loop);
  }

  stop() {
    this._running = false;
    if (this._rafHandle !== null) this._cancelFrame(this._rafHandle);
    this._rafHandle = null;
    this._nextTickAt = null;
  }

  formatDate(startYear) { return formatHistoricalDate(startYear, this.elapsedDays, this.daysPerTick); }
}