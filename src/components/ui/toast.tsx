"use client";

import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type ToastIntent = "default" | "success" | "error";

type ToastPayload = {
  message: string;
  intent?: ToastIntent;
  durationMs?: number;
};

type ToastEntry = ToastPayload & { id: string };

type ToastContextValue = {
  push: (payload: ToastPayload) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(undefined);

const INTENT_STYLES: Record<ToastIntent, string> = {
  default: "border-border/60 bg-card/80 text-foreground",
  success: "border-emerald-500/50 bg-emerald-900/40 text-emerald-100",
  error: "border-rose-500/50 bg-rose-900/40 text-rose-100",
};

const DEFAULT_DURATION = 3200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);
  const timersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = React.useCallback((handle: ReturnType<typeof setTimeout>) => {
    if (typeof handle === "number") {
      window.clearTimeout(handle);
    } else {
      clearTimeout(handle);
    }
  }, []);

  const removeToast = React.useCallback(
    (id: string) => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      const timers = timersRef.current;
      const timeoutId = timers.get(id);
      if (timeoutId) {
        clearTimer(timeoutId);
        timers.delete(id);
      }
    },
    [clearTimer],
  );

  const push = React.useCallback(
    (payload: ToastPayload) => {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const toastEntry: ToastEntry = {
        id,
        intent: payload.intent ?? "default",
        message: payload.message,
        durationMs: payload.durationMs ?? DEFAULT_DURATION,
      };
      setToasts((current) => [...current, toastEntry]);

      const timeoutId = setTimeout(() => removeToast(id), toastEntry.durationMs ?? DEFAULT_DURATION);
      timersRef.current.set(id, timeoutId);
    },
    [removeToast],
  );

  React.useEffect(
    () => () => {
      timersRef.current.forEach((timeoutId) => clearTimer(timeoutId));
      timersRef.current.clear();
    },
    [clearTimer],
  );

  const contextValue = React.useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur",
              INTENT_STYLES[toast.intent ?? "default"],
            )}
          >
            <span className="flex-1 leading-snug">{toast.message}</span>
            <button
              type="button"
              className="rounded-md p-1 text-xs transition-colors hover:bg-black/10"
              onClick={() => removeToast(toast.id)}
              aria-label="Cerrar notificacion"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast debe usarse dentro de ToastProvider");
  }
  return context;
}


