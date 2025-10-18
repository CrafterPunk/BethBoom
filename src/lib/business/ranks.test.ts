import { describe, expect, it } from "vitest";

import { isAmountWithinRank } from "@/lib/business/ranks";

describe("rank validations", () => {
  const rank = { nombre: "Bronce", minMonto: 1000, maxMonto: 10000 };

  it("accepts amounts inside limits", () => {
    expect(isAmountWithinRank(rank, 5000)).toBe(true);
  });

  it("accepts exact boundaries", () => {
    expect(isAmountWithinRank(rank, 1000)).toBe(true);
    expect(isAmountWithinRank(rank, 10000)).toBe(true);
  });

  it("rejects amounts below minimum", () => {
    expect(isAmountWithinRank(rank, 999)).toBe(false);
  });

  it("rejects amounts above maximum", () => {
    expect(isAmountWithinRank(rank, 20000)).toBe(false);
  });
});
