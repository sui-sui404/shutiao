/**
 * EventBus — 全局事件总线
 * 所有模块之间通过事件通信，不直接互相调用
 */
class EventBus {
  constructor() {
    this._listeners = {};
  }

  /**
   * 监听事件
   * @param {string} event 事件名
   * @param {Function} callback 回调函数
   * @returns {Function} 取消监听的函数
   */
  on(event, callback) {
    if (!this._listeners[event]) {
      this._listeners[event] = [];
    }
    this._listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  /**
   * 监听事件（只触发一次）
   */
  once(event, callback) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      callback(...args);
    };
    this.on(event, wrapper);
  }

  /**
   * 取消监听
   */
  off(event, callback) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(
      (cb) => cb !== callback
    );
  }

  /**
   * 触发事件
   * @param {string} event 事件名
   * @param  {...any} args 传递给回调的参数
   */
  emit(event, ...args) {
    if (!this._listeners[event]) return;
    for (const cb of this._listeners[event]) {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    }
  }

  /**
   * 清除某个事件的所有监听器，或清除全部
   */
  clear(event) {
    if (event) {
      delete this._listeners[event];
    } else {
      this._listeners = {};
    }
  }
}

export const bus = new EventBus();
export default bus;
