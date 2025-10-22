"use client";

import { useCallback, useMemo, useState } from "react";

import type { AppEvent } from "@/lib/events";
import { useEventStream } from "@/lib/hooks/use-event-stream";
import { cn } from "@/lib/utils";

type Notification = AppEvent & { dismissAt: number };

const DISPLAY_DURATION_MS = 8_000;

const variantStyles: Record<string, string> = {
  MARKET_ODDS_THRESHOLD: "border-violet-400/40 bg-violet-950/40 text-violet-100",
  CASH_CLOSE_REQUESTED: "border-amber-400/40 bg-amber-950/40 text-amber-100",
  CASH_CLOSE_APPROVED: "border-sky-400/40 bg-sky-950/40 text-sky-100",
  HIGH_PAYOUT: "border-emerald-400/40 bg-emerald-950/40 text-emerald-100",
};

export function EventNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const handleEvent = useCallback((event: AppEvent) => {
    setNotifications((prev) => {
      const cleaned = prev.filter((item) => item.dismissAt > Date.now());
      return [
        ...cleaned,
        {
          ...event,
          dismissAt: Date.now() + DISPLAY_DURATION_MS,
        },
      ];
    });
  }, []);

  const handleError = useCallback(() => {
    setNotifications((prev) => prev.filter((item) => item.dismissAt > Date.now()));
  }, []);

  useEventStream({ onEvent: handleEvent, onError: handleError });

  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => notification.dismissAt > Date.now()),
    [notifications],
  );

  if (visibleNotifications.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed right-6 top-6 z-50 flex w-80 flex-col gap-3">
      {visibleNotifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            "pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg",
            variantStyles[notification.type] ?? "border-primary/40 bg-background/80",
          )}
        >
          <p className="text-xs uppercase tracking-wide text-muted-foreground/80">{notification.type.replace(/_/g, " ")}</p>
          <p className="mt-1 font-medium text-foreground">{notification.message}</p>
          {notification.payload?.summary ? (
            <p className="mt-1 text-xs text-muted-foreground">{String(notification.payload.summary)}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
