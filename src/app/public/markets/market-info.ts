import type { MercadoTipo } from "@prisma/client";

type MarketInfo = {
  label: string;
  summary: string;
  details: string;
};

export const MARKET_TYPE_INFO: Record<MercadoTipo, MarketInfo> = {
  POOL: {
    label: "Pozo compartido",
    summary: "El premio se reparte entre quienes aciertan.",
    details:
      "Todas las apuestas entran a un mismo fondo y, al cerrar el mercado, se reparte entre los boletos ganadores de forma proporcional. Mientras mas aportes y menos ganadores haya, mayor sera tu premio.",
  },
  ODDS: {
    label: "Cuotas dinamicas",
    summary: "Pagas segun la cuota fijada al momento de comprar.",
    details:
      "Las cuotas se ajustan segun el flujo de apuestas. Al comprar un ticket, quedas amarrado a la cuota mostrada. Si aciertas, cobras tu monto multiplicado por esa cuota.",
  },
};
