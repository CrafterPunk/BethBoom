import type { RankRegla } from "@prisma/client";

export type RankRuleLike = Pick<RankRegla, "minMonto" | "maxMonto" | "nombre">;

export function isAmountWithinRank(rank: RankRuleLike, amount: number) {
  return amount >= rank.minMonto && amount <= rank.maxMonto;
}
