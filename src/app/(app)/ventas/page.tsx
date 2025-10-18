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

  const [markets, rankRules, promotionEvery] = await Promise.all([
    prisma.mercado.findMany({
      where: { estado: MercadoEstado.ABIERTO },
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

  const marketsDto = markets.map((market) => ({
    id: market.id,
    nombre: market.nombre,
    descripcion: market.descripcion,
    tipo: market.tipo,
    opciones: market.opciones.map((option) => ({
      id: option.id,
      nombre: option.nombre,
      cuotaInicial: toNumber(option.cuotaInicial),
      cuotaActual: toNumber(option.cuotaActual),
    })),
  }));

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

