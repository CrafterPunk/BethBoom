import { describe, expect, it } from "vitest";

import {
  applyDeltaCap,
  calculatePoolPayout,
  calculateSesgo,
  calculateSuggestedOdd,
  clamp,
  shouldTriggerRecalc,
} from "./odds";

describe("odds helpers", () => {
  it("clamp limits values", () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-1, 0, 2)).toBe(0);
  });

  it("calculates bias correctly", () => {
    expect(calculateSesgo(50, 100)).toBeCloseTo(0.5);
    expect(calculateSesgo(0, 100)).toBe(0);
    expect(calculateSesgo(10, 0)).toBe(0);
  });

  it("suggested odds stay within configured range", () => {
    const odd = calculateSuggestedOdd(0.3);
    expect(odd).toBeGreaterThanOrEqual(1.2);
    expect(odd).toBeLessThanOrEqual(5);
  });

  it("caps odd increases by delta", () => {
    const result = applyDeltaCap(2.0, 3.0);
    expect(result).toBeCloseTo(2.25);
  });

  it("caps odd decreases by delta", () => {
    const result = applyDeltaCap(3.0, 2.3);
    expect(result).toBeCloseTo(2.75);
  });

  it("detects when recalc threshold is reached", () => {
    expect(shouldTriggerRecalc(30000, 30000)).toBe(true);
    expect(shouldTriggerRecalc(15000, 30000)).toBe(false);
  });
});

describe("pool payouts", () => {
  it("returns zero when there are no winners", () => {
    const payout = calculatePoolPayout({
      totalApostado: 100000,
      feePct: 12,
      ganadoresSuma: 0,
      montoTicket: 2000,
    });
    expect(payout).toBe(0);
  });

  it("splits pool proportionally", () => {
    const payout = calculatePoolPayout({
      totalApostado: 50000,
      feePct: 10,
      ganadoresSuma: 10000,
      montoTicket: 5000,
    });
    expect(payout).toBeGreaterThan(0);
    expect(payout).toBeLessThan(50000);
  });

  it("computes deterministic payout with fees", () => {
    const payout = calculatePoolPayout({
      totalApostado: 100000,
      feePct: 12,
      ganadoresSuma: 20000,
      montoTicket: 5000,
    });
    expect(payout).toBe(22000);
  });
});
