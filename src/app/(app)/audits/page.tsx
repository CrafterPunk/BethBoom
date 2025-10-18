import { Prisma, UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { AuditsManager } from "./audits-manager";

function parseDate(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function stringifyJson(value: Prisma.JsonValue | Prisma.NullTypes.JsonNull) {
  if (value === null) return "null";
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return JSON.stringify(value);
}

export default async function AuditsPage({
  searchParams,
}: {
  searchParams?: {
    page?: string;
    entity?: string;
    actor?: string;
    from?: string;
    to?: string;
  };
}) {
  const session = await requireSession();
  const canDelete = session.role === UserRole.ADMIN_GENERAL;

  const entityFilter = searchParams?.entity?.trim() || undefined;
  const actorFilter = searchParams?.actor?.trim() || undefined;
  const fromDate = parseDate(searchParams?.from);
  const toDate = parseDate(searchParams?.to);

  const where: Prisma.AuditLogWhereInput = {};
  if (entityFilter) {
    where.entidad = entityFilter;
  }
  if (actorFilter) {
    where.actorId = actorFilter;
  }
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) {
      (where.createdAt as Prisma.DateTimeFilter).gte = new Date(fromDate.setHours(0, 0, 0, 0));
    }
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      (where.createdAt as Prisma.DateTimeFilter).lte = end;
    }
  }

  const page = Math.max(1, Number.parseInt(searchParams?.page ?? "1", 10) || 1);
  const take = 50;
  const skip = (page - 1) * take;

  const [logs, total, entities, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        actor: { select: { displayName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entidad"], _count: true }),
    prisma.auditLog.findMany({
      distinct: ["actorId"],
      where: { actorId: { not: null } },
      select: {
        actorId: true,
        actor: { select: { displayName: true } },
      },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / take));
  const currentPage = Math.min(page, totalPages);

  const data = {
    logs: logs.map((log) => ({
      id: log.id,
      accion: log.accion,
      entidad: log.entidad,
      entidadId: log.entidadId,
      actorId: log.actorId,
      actorNombre: log.actor?.displayName ?? null,
      createdAt: log.createdAt.toISOString(),
      antes: stringifyJson(log.antes),
      despues: stringifyJson(log.despues),
      ip: log.ip,
      userAgent: log.userAgent,
    })),
    pagination: {
      page: currentPage,
      totalPages,
      total,
    },
    filters: {
      entities: entities.map((item) => item.entidad).filter((item): item is string => Boolean(item)),
      actors: actors
        .filter((item) => item.actorId && item.actor)
        .map((item) => ({ id: item.actorId as string, nombre: item.actor?.displayName ?? "" })),
      from: fromDate ? new Date(fromDate).toISOString().slice(0, 10) : undefined,
      to: toDate ? new Date(toDate).toISOString().slice(0, 10) : undefined,
      entity: entityFilter,
      actor: actorFilter,
    },
    canDelete,
  };

  return <AuditsManager data={data} />;
}

