"use client";

import { useEffect, useMemo, useState } from "react";

function computeRemaining(endsAt: string | null, initialMs: number | null): number | null {
  if (!endsAt) {
    return null;
  }
  if (initialMs === null) {
    const target = new Date(endsAt).getTime();
    return Math.max(target - Date.now(), 0);
  }
  return Math.max(initialMs, 0);
}

function calculateDifference(endsAt: string): number {
  return Math.max(new Date(endsAt).getTime() - Date.now(), 0);
}

export function useCountdown(endsAt: string | null, initialMs: number | null) {
  const [remaining, setRemaining] = useState<number | null>(() => computeRemaining(endsAt, initialMs));

  useEffect(() => {
    if (!endsAt) {
      setRemaining(null);
      return;
    }

    setRemaining(calculateDifference(endsAt));

    const timer = window.setInterval(() => {
      setRemaining(calculateDifference(endsAt));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [endsAt]);

  return useMemo(
    () => ({
      remainingMs: remaining,
      isElapsed: typeof remaining === "number" ? remaining <= 0 : false,
    }),
    [remaining],
  );
}

