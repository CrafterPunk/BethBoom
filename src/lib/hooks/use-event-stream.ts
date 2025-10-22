"use client";

import { useEffect } from "react";

import type { AppEvent } from "@/lib/events";

export type EventStreamOptions = {
  onEvent: (event: AppEvent) => void;
  onError?: (error: Event) => void;
};

export function useEventStream({ onEvent, onError }: EventStreamOptions) {
  useEffect(() => {
    const source = new EventSource("/api/events");

    source.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as AppEvent;
        onEvent(parsed);
      } catch (error) {
        console.warn("Evento SSE invalido", error);
      }
    };

    source.onerror = (event) => {
      source.close();
      onError?.(event);
    };

    return () => {
      source.close();
    };
  }, [onEvent, onError]);
}
