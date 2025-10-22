import { Prisma, UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { ApostadoresManager } from "./apostadores-manager";

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value =
    typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
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

  const [apostadores, total, rankRules, promotionEvery, tags] = await Promise.all([
    prisma.apostador.findMany({
      where,
      include: {
        rango: true,
        rangoManual: true,
        notas: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { createdBy: { select: { displayName: true } } },
        },
        etiquetas: {
          include: {
            tag: true,
            createdBy: { select: { displayName: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        promociones: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { triggeredBy: { select: { displayName: true } } },
        },
      },
      orderBy: [
        { updatedAt: "desc" },
        { alias: "asc" },
      ],
      take: 100,
    }),
    prisma.apostador.count({ where }),
    prisma.rankRegla.findMany({ orderBy: { orden: "asc" } }),
    getPromotionThreshold(),
    prisma.apostadorTag.findMany({ orderBy: { nombre: "asc" }, where: { activa: true } }),
  ]);

  const apostadoresDto = apostadores.map((apostador) => ({
    id: apostador.id,
    alias: apostador.alias,
    rangoId: apostador.rangoId,
    rangoNombre: apostador.rango?.nombre ?? "Sin rango",
    rangoOrden: apostador.rango?.orden ?? 0,
    rangoManualId: apostador.rangoManualId,
    rangoManualNombre: apostador.rangoManual?.nombre ?? null,
    promocionAutomatica: apostador.promocionAutomatica,
    apuestasTotal: apostador.apuestasTotal,
    apuestasAcumuladas: apostador.apuestasAcumuladas,
    createdAt: apostador.createdAt.toISOString(),
    updatedAt: apostador.updatedAt.toISOString(),
    notas: apostador.notas.map((nota) => ({
      id: nota.id,
      contenido: nota.contenido,
      createdAt: nota.createdAt.toISOString(),
      autor: nota.createdBy?.displayName ?? "Sistema",
    })),
    etiquetas: apostador.etiquetas.map((asignacion) => ({
      assignmentId: asignacion.id,
      tagId: asignacion.tagId,
      nombre: asignacion.tag.nombre,
      color: asignacion.tag.color,
    })),
    promociones: apostador.promociones.map((hist) => ({
      id: hist.id,
      rangoAnteriorNombre: hist.rangoAnteriorNombre,
      rangoNuevoNombre: hist.rangoNuevoNombre,
      motivo: hist.motivo ?? null,
      createdAt: hist.createdAt.toISOString(),
      actor: hist.triggeredBy?.displayName ?? null,
    })),
  }));

  const rankRulesDto = rankRules.map((rule) => ({
    id: rule.id,
    nombre: rule.nombre,
    orden: rule.orden,
    minMonto: rule.minMonto,
    maxMonto: rule.maxMonto,
  }));

  const tagsDto = tags.map((tag) => ({
    id: tag.id,
    nombre: tag.nombre,
    color: tag.color,
    descripcion: tag.descripcion ?? null,
  }));

  const canManage = session.role === UserRole.ADMIN_GENERAL;

  return (
    <ApostadoresManager
      data={{
        apostadores: apostadoresDto,
        rankRules: rankRulesDto,
        tags: tagsDto,
        canManage,
        total,
        query,
        promotionEvery,
      }}
    />
  );
}
