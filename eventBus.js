export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  on(topic, fn) {
    if (!this._listeners.has(topic)) this._listeners.set(topic, []);
    this._listeners.get(topic).push(fn);
    return () => this.off(topic, fn);
  }

  off(topic, fn) {
    const list = this._listeners.get(topic);
    if (!list) return;
    const i = list.indexOf(fn);
    if (i !== -1) list.splice(i, 1);
  }

  emit(topic, payload) {
    const list = this._listeners.get(topic);
    if (!list) return;
    for (const fn of list.slice()) fn(payload);
  }
}
