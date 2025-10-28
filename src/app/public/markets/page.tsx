import { MercadoEstado, Prisma } from "@prisma/client";

import { readSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { PublicMarketsLanding, type PublicMarket } from "./public-landing";

const toNumber = (value: Prisma.Decimal | null) => (value ? Number(value) : null);

export default async function PublicMarketsPage() {
  const [session, markets] = await Promise.all([
    readSession(),
    prisma.mercado.findMany({
      where: {
        estado: {
          in: [MercadoEstado.ABIERTO, MercadoEstado.SUSPENDIDO],
        },
      },
      include: {
        opciones: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: [{ estado: "asc" }, { endsAt: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const now = new Date();
  const marketsDto: PublicMarket[] = markets.map((market) => {
    const endsAt = market.endsAt ?? null;
    const timeRemainingMs = endsAt ? Math.max(endsAt.getTime() - now.getTime(), 0) : null;
    return {
      id: market.id,
      nombre: market.nombre,
      descripcion: market.descripcion,
      tipo: market.tipo,
      estado: market.estado,
      endsAt: endsAt ? endsAt.toISOString() : null,
      timeRemainingMs,
      opciones: market.opciones.map((option) => ({
        id: option.id,
        nombre: option.nombre,
        cuotaActual: toNumber(option.cuotaActual),
        cuotaInicial: toNumber(option.cuotaInicial),
      })),
    };
  });

  return <PublicMarketsLanding markets={marketsDto} sessionDisplayName={session?.displayName ?? null} />;
}
