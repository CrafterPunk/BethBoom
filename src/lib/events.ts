import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

export type AppEventType =
  | "MARKET_ODDS_THRESHOLD"
  | "CASH_CLOSE_REQUESTED"
  | "CASH_CLOSE_APPROVED"
  | "HIGH_PAYOUT";

export type AppEvent<TPayload = Record<string, unknown>> = {
  id: string;
  type: AppEventType;
  message: string;
  payload?: TPayload;
  createdAt: string;
};

type EventHandler = (event: AppEvent) => void;

declare global {
  // eslint-disable-next-line no-var
  var __appEventEmitter: EventEmitter | undefined;
}

const emitter: EventEmitter = globalThis.__appEventEmitter ?? new EventEmitter();

if (!globalThis.__appEventEmitter) {
  emitter.setMaxListeners(50);
  globalThis.__appEventEmitter = emitter;
}

export function emitAppEvent(event: AppEvent) {
  emitter.emit("app-event", event);
}

export function subscribeToAppEvents(handler: EventHandler) {
  emitter.on("app-event", handler);
  return () => emitter.off("app-event", handler);
}

export function buildAppEvent(input: Omit<AppEvent, "id" | "createdAt">): AppEvent {
  return {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}
