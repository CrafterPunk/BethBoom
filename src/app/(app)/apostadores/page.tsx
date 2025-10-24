import { Prisma, TicketEstado, UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { ApostadoresManager } from "./apostadores-manager";

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value =
    typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

async function expireStaleTickets(now: Date) {
  const cutoff = new Date(now.getTime() - ONE_WEEK_MS);
  const staleTickets = await prisma.ticket.findMany({
    where: {
      estado: TicketEstado.ACTIVO,
      mercado: { closedAt: { not: null, lt: cutoff } },
    },
    select: { id: true, mercado: { select: { closedAt: true } } },
    take: 200,
  });

  if (staleTickets.length === 0) {
    return;
  }

  await Promise.all(
    staleTickets.map((ticket) => {
      const closedAt = ticket.mercado.closedAt;
      if (!closedAt) return Promise.resolve();
      const venceAt = new Date(closedAt.getTime() + ONE_WEEK_MS);
      return prisma.ticket.update({
        where: { id: ticket.id },
        data: { estado: TicketEstado.VENCIDO, venceAt },
      });
    }),
  );
}

export default async function ApostadoresPage({
  searchParams,
}: {
  searchParams?: { q?: string };
}) {
  const session = await requireSession();
  const now = new Date();
  await expireStaleTickets(now);
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
        tickets: {
          orderBy: { createdAt: "desc" },
          take: 25,
          include: {
            mercado: { select: { nombre: true, tipo: true, closedAt: true } },
            pagado: { select: { monto: true, pagadoAt: true } },
          },
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

  const apostadoresDto = apostadores.map((apostador) => {
    const historyTickets = apostador.tickets.map((ticket) => {
      const closedAt = ticket.mercado.closedAt;
      const defaultExpiry = closedAt ? new Date(closedAt.getTime() + ONE_WEEK_MS) : null;
      const venceAt = ticket.venceAt ?? defaultExpiry;
      const isExpired = ticket.estado === TicketEstado.VENCIDO || (ticket.estado === TicketEstado.ACTIVO && venceAt && venceAt.getTime() < Date.now());
      const effectiveEstado = isExpired && ticket.estado === TicketEstado.ACTIVO ? TicketEstado.VENCIDO : ticket.estado;
      const pagoMonto = ticket.pagado?.monto ? Number(ticket.pagado.monto) : null;
      return {
        id: ticket.id,
        codigo: ticket.codigo,
        mercado: ticket.mercado.nombre,
        tipoMercado: ticket.mercado.tipo,
        monto: ticket.monto,
        estado: effectiveEstado,
        venceAt: venceAt ? venceAt.toISOString() : null,
        pagoMonto,
        pagadoAt: ticket.pagado?.pagadoAt ? ticket.pagado.pagadoAt.toISOString() : null,
        createdAt: ticket.createdAt.toISOString(),
      };
    });

    const totalApostado = historyTickets
      .filter((ticket) => ticket.estado !== TicketEstado.ANULADO)
      .reduce((sum, ticket) => sum + ticket.monto, 0);
    const totalPagado = historyTickets
      .filter((ticket) => ticket.estado === TicketEstado.PAGADO && ticket.pagoMonto !== null)
      .reduce((sum, ticket) => sum + (ticket.pagoMonto ?? 0), 0);
    const totalExpirado = historyTickets
      .filter((ticket) => ticket.estado === TicketEstado.VENCIDO)
      .reduce((sum, ticket) => sum + ticket.monto, 0);
    const balance = totalPagado - totalApostado;

    return {
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
      history: {
        tickets: historyTickets,
        totals: {
          apostado: totalApostado,
          pagado: totalPagado,
          expirado: totalExpirado,
          balance,
        },
      },
    };
  });

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
