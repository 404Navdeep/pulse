import { EventEmitter } from "node:events";

class EventBus extends EventEmitter {
    emitEvent(event, data = {}) {
        this.emit(event,data);
    }
    onEvent(event, listener) {
        this.on(event, listener);
    }
    onceEvent(event, listener) {
        this.once(event, listener);
    }
}

export default new EventBus();