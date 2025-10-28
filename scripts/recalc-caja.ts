#!/usr/bin/env tsx

import { AsyncLocalStorage } from "async_hooks";
import { CajaLiquidacionTipo, CajaSesion, Prisma, PrismaClient, Ticket, TicketEstado } from "@prisma/client";

// Ensure AsyncLocalStorage is available for Next internals used by revalidatePath
(global as unknown as { AsyncLocalStorage?: typeof AsyncLocalStorage }).AsyncLocalStorage ??= AsyncLocalStorage;

const prisma = new PrismaClient();

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7;

type SessionWithMeta = CajaSesion & {
  franquicia: { id: string; nombre: string };
  trabajador: { id: string; displayName: string };
};

type SummaryBucket = {
  nombre: string;
  ventas: number;
  pagos: number;
  saldo: number;
  sesiones: number;
};

function computeSessionWindow(session: SessionWithMeta, nextSession: SessionWithMeta | undefined, now: Date) {
  const start = session.createdAt;
  const candidateEnds: Date[] = [];

  if (session.cerradoAt) candidateEnds.push(session.cerradoAt);
  if (session.aprobadoAt) candidateEnds.push(session.aprobadoAt);
  if (session.solicitadoAt) candidateEnds.push(session.solicitadoAt);
  if (nextSession) candidateEnds.push(nextSession.createdAt);

  const validEnd = candidateEnds
    .filter((candidate) => candidate.getTime() > start.getTime())
    .sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    start,
    end: validEnd ?? now,
  };
}

function normalizeVenceAt(ticket: Ticket & { mercado: { closedAt: Date | null } }) {
  if (ticket.venceAt) {
    return ticket.venceAt;
  }

  if (ticket.mercado.closedAt) {
    return new Date(ticket.mercado.closedAt.getTime() + ONE_WEEK_MS);
  }

  return null;
}

function computeLiquidacion(capitalPropio: number, ventasTotal: number, pagosTotal: number) {
  const neto = ventasTotal - pagosTotal;

  if (neto > 0) {
    return {
      tipo: CajaLiquidacionTipo.WORKER_OWES,
      monto: neto,
    };
  }

  if (neto < 0) {
    return {
      tipo: CajaLiquidacionTipo.HQ_OWES,
      monto: Math.abs(neto),
    };
  }

  return {
    tipo: CajaLiquidacionTipo.BALANCEADO,
    monto: 0,
  };
}

async function expireStaleTickets(now: Date) {
  const candidates = await prisma.ticket.findMany({
    where: {
      estado: TicketEstado.ACTIVO,
      OR: [
        { venceAt: { not: null, lt: now } },
        { mercado: { closedAt: { not: null, lt: new Date(now.getTime() - ONE_WEEK_MS) } } },
      ],
    },
    select: {
      id: true,
      venceAt: true,
      mercado: { select: { closedAt: true } },
    },
  });

  if (candidates.length === 0) {
    return 0;
  }

  let updated = 0;
  for (const ticket of candidates) {
    const venceAt = normalizeVenceAt(ticket as Ticket & { mercado: { closedAt: Date | null } });
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        estado: TicketEstado.VENCIDO,
        venceAt: venceAt ?? new Date(now.getTime()),
      },
    });
    updated += 1;
  }

  return updated;
}

async function recalcSessions(now: Date) {
  const sessions = (await prisma.cajaSesion.findMany({
    include: {
      franquicia: { select: { id: true, nombre: true } },
      trabajador: { select: { id: true, displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as SessionWithMeta[];

  const sessionsByWorker = new Map<string, SessionWithMeta[]>();
  for (const session of sessions) {
    const list = sessionsByWorker.get(session.trabajadorId) ?? [];
    list.push(session);
    sessionsByWorker.set(session.trabajadorId, list);
  }

  const franchiseSummary = new Map<string, SummaryBucket>();
  const userSummary = new Map<string, SummaryBucket>();

  let updatedSessions = 0;

  for (const [, workerSessions] of sessionsByWorker) {
    workerSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    for (let index = 0; index < workerSessions.length; index += 1) {
      const session = workerSessions[index];
      const nextSession = workerSessions[index + 1];

      const { start, end } = computeSessionWindow(session, nextSession, now);

      if (end.getTime() <= start.getTime()) {
        continue;
      }

      const ticketWhere: Prisma.TicketWhereInput = {
        trabajadorId: session.trabajadorId,
        franquiciaId: session.franquiciaId,
        createdAt: { gte: start, lt: end },
        estado: { in: [TicketEstado.ACTIVO, TicketEstado.PAGADO] },
      };

      const ticketAgg = await prisma.ticket.aggregate({
        where: ticketWhere,
        _sum: { monto: true },
        _count: { _all: true },
      });

      const pagoAgg = await prisma.pago.aggregate({
        where: {
          pagadorId: session.trabajadorId,
          franquiciaId: session.franquiciaId,
          pagadoAt: { gte: start, lt: end },
        },
        _sum: { monto: true },
        _count: { _all: true },
      });

      const ventasTotal = Number(ticketAgg._sum?.monto ?? 0);
      const ventasCount =
        typeof ticketAgg._count === "object" && ticketAgg._count !== null
          ? ticketAgg._count._all ?? 0
          : Number(ticketAgg._count ?? 0);
      const pagosTotal = Number(pagoAgg._sum?.monto ?? 0);
      const pagosCount =
        typeof pagoAgg._count === "object" && pagoAgg._count !== null ? pagoAgg._count._all ?? 0 : Number(pagoAgg._count ?? 0);

      const liquidacion = computeLiquidacion(session.capitalPropio, ventasTotal, pagosTotal);

      const shouldUpdate =
        session.ventasTotal !== ventasTotal ||
        session.ventasCount !== ventasCount ||
        session.pagosTotal !== pagosTotal ||
        session.pagosCount !== pagosCount ||
        session.liquidacionMonto !== liquidacion.monto ||
        session.liquidacionTipo !== liquidacion.tipo;

      if (shouldUpdate) {
        await prisma.cajaSesion.update({
          where: { id: session.id },
          data: {
            ventasTotal,
            ventasCount,
            pagosTotal,
            pagosCount,
            liquidacionTipo: liquidacion.tipo,
            liquidacionMonto: liquidacion.monto,
          },
        });
        updatedSessions += 1;
      }

      const saldoDisponible = session.capitalPropio + ventasTotal - pagosTotal;

      const franchiseBucket =
        franchiseSummary.get(session.franquiciaId) ??
        {
          nombre: session.franquicia.nombre,
          ventas: 0,
          pagos: 0,
          saldo: 0,
          sesiones: 0,
        };
      franchiseBucket.ventas += ventasTotal;
      franchiseBucket.pagos += pagosTotal;
      franchiseBucket.saldo += saldoDisponible;
      franchiseBucket.sesiones += 1;
      franchiseSummary.set(session.franquiciaId, franchiseBucket);

      const userBucket =
        userSummary.get(session.trabajadorId) ??
        {
          nombre: session.trabajador.displayName,
          ventas: 0,
          pagos: 0,
          saldo: 0,
          sesiones: 0,
        };
      userBucket.ventas += ventasTotal;
      userBucket.pagos += pagosTotal;
      userBucket.saldo += saldoDisponible;
      userBucket.sesiones += 1;
      userSummary.set(session.trabajadorId, userBucket);
    }
  }

  return {
    updatedSessions,
    franchiseSummary: Array.from(franchiseSummary.values()),
    userSummary: Array.from(userSummary.entries()).map(([id, bucket]) => ({
      id,
      ...bucket,
    })),
  };
}

function formatCurrency(value: number) {
  return value.toLocaleString("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function main() {
  const now = new Date();
  const expiredTickets = await expireStaleTickets(now);

  const { updatedSessions, franchiseSummary, userSummary } = await recalcSessions(now);


  console.log("==== Mantenimiento de caja completado ====");
  console.log(`Tickets vencidos actualizados: ${expiredTickets}`);
  console.log(`Sesiones recalculadas: ${updatedSessions}`);
  console.log("\nTotales por sede:");
  for (const item of franchiseSummary.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    console.log(
      `- ${item.nombre}: Ventas $${formatCurrency(item.ventas)} | Pagos $${formatCurrency(item.pagos)} | Saldo ${formatCurrency(item.saldo)} | Sesiones ${item.sesiones}`,
    );
  }

  console.log("\nTotales por usuario:");
  for (const item of userSummary.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    console.log(
      `- ${item.nombre}: Ventas $${formatCurrency(item.ventas)} | Pagos $${formatCurrency(item.pagos)} | Saldo ${formatCurrency(item.saldo)} | Sesiones ${item.sesiones}`,
    );
  }
}

main()
  .catch((error) => {
    console.error("Error durante el mantenimiento:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

