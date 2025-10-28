import { MercadoEstado, Prisma, UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { SalesManager } from "./sales-manager";

const toNumber = (value: Prisma.Decimal | null) => (value ? Number(value) : null);

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value = typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

export default async function SalesPage() {
  const session = await requireSession();
  const now = new Date();

  await prisma.mercado.updateMany({
    where: {
      estado: MercadoEstado.ABIERTO,
      endsAt: { not: null, lte: now },
    },
    data: {
      estado: MercadoEstado.CERRADO,
      closedAt: now,
    },
  });

  const [markets, rankRules, promotionEvery] = await Promise.all([
    prisma.mercado.findMany({
      where: {
        estado: MercadoEstado.ABIERTO,
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
      include: {
        opciones: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.rankRegla.findMany({ orderBy: { orden: "asc" } }),
    getPromotionThreshold(),
  ]);

  const marketsDto = markets.map((market) => {
    const rawRemaining = market.endsAt ? market.endsAt.getTime() - now.getTime() : null;
    const timeRemainingMs = rawRemaining !== null ? Math.max(rawRemaining, 0) : null;
    return {
      id: market.id,
      nombre: market.nombre,
      descripcion: market.descripcion,
      tipo: market.tipo,
      estado: market.estado,
      endsAt: market.endsAt ? market.endsAt.toISOString() : null,
      timeRemainingMs,
      opciones: market.opciones.map((option) => ({
        id: option.id,
        nombre: option.nombre,
        cuotaInicial: toNumber(option.cuotaInicial),
        cuotaActual: toNumber(option.cuotaActual),
      })),
    };
  });

  const rankRulesDto = rankRules.map((rule) => ({
    id: rule.id,
    nombre: rule.nombre,
    orden: rule.orden,
    minMonto: rule.minMonto,
    maxMonto: rule.maxMonto,
  }));

  return (
    <SalesManager
      data={{
        markets: marketsDto,
        rankRules: rankRulesDto,
        promotionEvery,
        canSell: session.role === UserRole.ADMIN_GENERAL || session.role === UserRole.TRABAJADOR,
      }}
    />
  );
}

