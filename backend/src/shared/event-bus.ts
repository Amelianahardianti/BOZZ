import { EventEmitter } from "events";

// In-process only (SRS 9.4) — an event emitted right before a crash/restart is lost.
// Consumers of order.received/order.status.changed should track their own processed_at
// for reconciliation; that's the consumer's responsibility (Sales & Inventory module).

export interface OrderReceivedEvent {
  externalOrderPk: string;
  externalOrderId: string;
  platformName: string;
}

export interface OrderStatusChangedEvent {
  externalOrderPk: string;
  status: string;
}

interface EventMap {
  "order.received": OrderReceivedEvent;
  "order.status.changed": OrderStatusChangedEvent;
}

class TypedEventBus extends EventEmitter {
  emitTyped<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.emit(event, payload);
  }

  onTyped<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    this.on(event, listener);
  }
}

export const eventBus = new TypedEventBus();
