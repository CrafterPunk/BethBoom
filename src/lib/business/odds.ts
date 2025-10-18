export const ODDS_BASE = 2;
export const ODDS_K1 = 0.6;
export const ODDS_K2 = 0.8;
export const ODDS_MIN = 1.2;
export const ODDS_MAX = 5.0;
export const ODDS_DELTA_MAX = 0.25;

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function calculateSesgo(montoOpcion: number, montoTotal: number) {
  if (montoTotal <= 0) {
    return 0;
  }
  return montoOpcion / montoTotal;
}

export function calculateSuggestedOdd(sesgo: number) {
  const raw = ODDS_BASE / (ODDS_K1 + ODDS_K2 * sesgo);
  return clamp(Number(raw.toFixed(2)), ODDS_MIN, ODDS_MAX);
}

export function applyDeltaCap(actual: number, suggested: number) {
  const delta = suggested - actual;
  if (Math.abs(delta) <= ODDS_DELTA_MAX) {
    return Number(suggested.toFixed(2));
  }
  const adjusted = actual + Math.sign(delta) * ODDS_DELTA_MAX;
  return Number(adjusted.toFixed(2));
}

export function calculatePoolPayout({
  totalApostado,
  feePct,
  ganadoresSuma,
  montoTicket,
}: {
  totalApostado: number;
  feePct: number;
  ganadoresSuma: number;
  montoTicket: number;
}) {
  if (ganadoresSuma <= 0) {
    return 0;
  }
  const pozoNeto = Math.floor(totalApostado * (1 - feePct / 100));
  const proporcional = (pozoNeto * montoTicket) / ganadoresSuma;
  return Math.floor(proporcional);
}

export function shouldTriggerRecalc(montoAcumulado: number, umbral: number) {
  return montoAcumulado >= umbral;
}