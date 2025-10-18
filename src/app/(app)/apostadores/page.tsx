import { Prisma, UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { ApostadoresManager } from "./apostadores-manager";

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value = typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

export default async function ApostadoresPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession();
  const query = typeof searchParams?.q === "string" ? searchParams.q.trim() : "";

  const where: Prisma.ApostadorWhereInput = query
    ? {
        alias: {
          contains: query,
          mode: "insensitive",
        },
      }
    : {};

  const [apostadores, total, rankRules, promotionEvery] = await Promise.all([
    prisma.apostador.findMany({
      where,
      include: {
        rango: true,
      },
      orderBy: [
        { apuestasTotal: "desc" },
        { updatedAt: "desc" },
      ],
      take: 100,
    }),
    prisma.apostador.count({ where }),
    prisma.rankRegla.findMany({ orderBy: { orden: "asc" } }),
    getPromotionThreshold(),
  ]);

  const apostadoresDto = apostadores.map((apostador) => ({
    id: apostador.id,
    alias: apostador.alias,
    rangoNombre: apostador.rango?.nombre ?? "Sin rango",
    rangoOrden: apostador.rango?.orden ?? 0,
    apuestasTotal: apostador.apuestasTotal,
    apuestasAcumuladas: apostador.apuestasAcumuladas,
    updatedAt: apostador.updatedAt.toISOString(),
    createdAt: apostador.createdAt.toISOString(),
  }));

  const rankRulesDto = rankRules.map((rule) => ({
    id: rule.id,
    nombre: rule.nombre,
    orden: rule.orden,
    minMonto: rule.minMonto,
    maxMonto: rule.maxMonto,
  }));

  const canAdjust = session.role === UserRole.ADMIN_GENERAL;

  return (
    <ApostadoresManager
      data={{
        apostadores: apostadoresDto,
        rankRules: rankRulesDto,
        canAdjust,
        total,
        query,
        promotionEvery,
      }}
    />
  );
}
