import { Prisma } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { MarketsManager } from "./markets-manager";

const toNumber = (value: Prisma.Decimal | null) => (value ? Number(value) : null);

export default async function MarketsPage() {
  const session = await requireSession();

  const [markets, franquicias] = await Promise.all([
    prisma.mercado.findMany({
      include: {
        opciones: {
          orderBy: { createdAt: "asc" },
        },
        sede: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.franquicia.findMany({
      where: { activa: true },
      select: { id: true, nombre: true, codigo: true },
      orderBy: { nombre: "asc" },
    }),
  ]);

  const marketsDto = markets.map((market) => ({
    id: market.id,
    nombre: market.nombre,
    descripcion: market.descripcion,
    tipo: market.tipo,
    estado: market.estado,
    feePct: Number(market.feePct),
    franchiseSharePct: Number(market.franchiseSharePct),
    umbralRecalcMonto: market.umbralRecalcMonto,
    franquiciaScope: market.franquiciaScope,
    sede: market.sede
      ? {
          id: market.sede.id,
          nombre: market.sede.nombre,
          codigo: market.sede.codigo,
        }
      : null,
    startsAt: market.startsAt?.toISOString() ?? null,
    endsAt: market.endsAt?.toISOString() ?? null,
    closedAt: market.closedAt?.toISOString() ?? null,
    ganadoraId: market.ganadoraId,
    opciones: market.opciones.map((option) => ({
      id: option.id,
      nombre: option.nombre,
      cuotaInicial: toNumber(option.cuotaInicial),
      cuotaActual: toNumber(option.cuotaActual),
      totalApostado: option.totalApostado,
      createdAt: option.createdAt.toISOString(),
    })),
    createdAt: market.createdAt.toISOString(),
  }));

  return (
    <MarketsManager
      data={{
        markets: marketsDto,
        franquicias,
        canManage: session.role === "ADMIN_GENERAL" || session.role === "MARKET_MAKER",
        canCloseMarkets: session.role === "ADMIN_GENERAL",
        isOddsVisible:
          session.role === "ADMIN_GENERAL" || session.role === "TRABAJADOR" || session.role === "MARKET_MAKER",
      }}
    />
  );
}

