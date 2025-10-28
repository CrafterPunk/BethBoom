import {
  CajaSesionEstado,
  MercadoEstado,
  MercadoTipo,
  Prisma,
  TicketEstado,
  UserRole,
} from "@prisma/client";

import { calculatePoolPayout, clamp } from "@/lib/business/odds";
import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { PaymentsManager, type PaymentTicket } from "./payments-manager";

function numberFromDecimal(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

function normalizeOdd(value: number | null) {
  if (value === null) {
    return null;
  }
  return Number(value);
}

export default async function PaymentsPage() {
  const session = await requireSession();

  const [tickets, activeSession] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        estado: TicketEstado.ACTIVO,
        pagado: null,
        mercado: {
          estado: MercadoEstado.CERRADO,
          ganadoraId: { not: null },
        },
      },
      include: {
        mercado: true,
        opcion: true,
        apostador: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cajaSesion.findFirst({
      where: {
        trabajadorId: session.userId,
        estado: CajaSesionEstado.ABIERTA,
      },
    }),
  ]);

  const isAdmin = session.role === UserRole.ADMIN_GENERAL;

  const winners = tickets.filter((ticket) => ticket.mercado.ganadoraId === ticket.opcionId);

  const filtered = winners.filter((ticket) => {
    if (isAdmin) {
      return true;
    }
    if (!session.franquiciaId) {
      return true;
    }
    return ticket.franquiciaId === session.franquiciaId;
  });

  const poolMarketIds = Array.from(
    new Set(
      filtered
        .filter((ticket) => ticket.mercado.tipo === MercadoTipo.POOL)
        .map((ticket) => ticket.mercadoId),
    ),
  );

  let poolTotals = new Map<string, { total: number; ganadores: number }>();

  if (poolMarketIds.length > 0) {
    const winningOptionByMarket = new Map<string, string>();
    filtered.forEach((ticket) => {
      if (ticket.mercado.tipo === MercadoTipo.POOL && ticket.mercado.ganadoraId) {
        winningOptionByMarket.set(ticket.mercadoId, ticket.mercado.ganadoraId);
      }
    });

    const relatedTickets = await prisma.ticket.findMany({
      where: {
        mercadoId: { in: poolMarketIds },
        estado: { in: [TicketEstado.ACTIVO, TicketEstado.PAGADO] },
      },
      select: {
        mercadoId: true,
        opcionId: true,
        monto: true,
      },
    });

    poolTotals = relatedTickets.reduce((map, current) => {
      const record = map.get(current.mercadoId) ?? { total: 0, ganadores: 0 };
      record.total += current.monto;
      if (winningOptionByMarket.get(current.mercadoId) === current.opcionId) {
        record.ganadores += current.monto;
      }
      map.set(current.mercadoId, record);
      return map;
    }, new Map<string, { total: number; ganadores: number }>());
  }

  const ticketDtos = filtered.map((ticket) => {
    let cuota: number | null = null;
    let payout = 0;

    if (ticket.mercado.tipo === MercadoTipo.ODDS) {
      const cuotaBase =
      normalizeOdd(numberFromDecimal(ticket.cuotaFijada ? ticket.cuotaFijada : null)) ??
      normalizeOdd(numberFromDecimal(ticket.opcion.cuotaActual ? ticket.opcion.cuotaActual : null)) ??
      normalizeOdd(numberFromDecimal(ticket.opcion.cuotaInicial ? ticket.opcion.cuotaInicial : null)) ??
      2;
      cuota = Number(clamp(cuotaBase, 1.2, 5).toFixed(2));
      payout = Math.floor(ticket.monto * cuota);
    } else {
      const totals = poolTotals.get(ticket.mercadoId) ?? { total: 0, ganadores: 0 };
      payout = calculatePoolPayout({
        totalApostado: totals.total,
        feePct: Number(ticket.mercado.feePct),
        ganadoresSuma: totals.ganadores,
        montoTicket: ticket.monto,
      });
    }

    const fee = Math.floor(payout * 0.05);
    const net = Math.max(payout - fee, 0);

    return {
      id: ticket.id,
      codigo: ticket.codigo,
      alias: ticket.apostador.alias,
      mercadoNombre: ticket.mercado.nombre,
      mercadoTipo: ticket.mercado.tipo,
      opcionNombre: ticket.opcion.nombre,
      monto: ticket.monto,
      cuota,
      payout,
      fee,
      net,
      createdAt: ticket.createdAt.toISOString(),
    } satisfies PaymentTicket;
  });

  return (
    <PaymentsManager
      data={{
        tickets: ticketDtos,
        canPay: session.role === UserRole.ADMIN_GENERAL || session.role === UserRole.TRABAJADOR,
        hasOpenSession: Boolean(activeSession),
      }}
    />
  );
}



