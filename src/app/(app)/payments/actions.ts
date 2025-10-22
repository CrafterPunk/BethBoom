"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CajaMovimientoTipo,
  CajaSesionEstado,
  MercadoEstado,
  MercadoScope,
  MercadoTipo,
  Prisma,
  TicketEstado,
  UserRole,
} from "@prisma/client";

import { calculatePoolPayout, clamp } from "@/lib/business/odds";
import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { buildAppEvent, emitAppEvent } from "@/lib/events";

const payTicketSchema = z.object({
  ticketId: z.string().uuid(),
});

const HIGH_PAYOUT_THRESHOLD = 50_000;

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

function computeOddsPayout(monto: number, cuota: number | null) {
  if (!cuota) {
    return 0;
  }
  return Math.floor(monto * cuota);
}

function normalizeOdd(value: Prisma.Decimal | null) {
  return value ? Number(value) : null;
}

export async function payTicketAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.TRABAJADOR && session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado para registrar pagos" };
  }

  const parsed = payTicketSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id: parsed.data.ticketId },
    include: {
      mercado: true,
      opcion: true,
      pagado: true,
    },
  });

  if (!ticket) {
    return { ok: false, message: "Ticket no encontrado" };
  }

  if (ticket.estado !== TicketEstado.ACTIVO) {
    return { ok: false, message: "El ticket no esta disponible para pago" };
  }

  if (ticket.pagado) {
    return { ok: false, message: "El ticket ya fue pagado" };
  }

  const market = ticket.mercado;
  if (market.estado !== MercadoEstado.CERRADO || !market.ganadoraId) {
    return { ok: false, message: "El mercado aun no esta cerrado" };
  }

  if (market.ganadoraId !== ticket.opcionId) {
    return { ok: false, message: "Este ticket no corresponde a la opcion ganadora" };
  }

  const activeSession = await prisma.cajaSesion.findFirst({
    where: {
      trabajadorId: session.userId,
      estado: CajaSesionEstado.ABIERTA,
    },
  });

  if (!activeSession) {
    return { ok: false, message: "Debes abrir caja antes de realizar pagos" };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const cajaSesion = await tx.cajaSesion.findUnique({ where: { id: activeSession.id } });
      if (!cajaSesion || cajaSesion.estado !== CajaSesionEstado.ABIERTA) {
        throw new Error("CAJA_SESSION_MISSING");
      }

      const freshTicket = await tx.ticket.findUnique({
        where: { id: ticket.id },
        include: {
          mercado: true,
          opcion: true,
          pagado: true,
        },
      });

      if (!freshTicket || freshTicket.estado !== TicketEstado.ACTIVO) {
        throw new Error("TICKET_UNAVAILABLE");
      }

      if (freshTicket.pagado) {
        throw new Error("TICKET_ALREADY_PAID");
      }

      const freshMarket = freshTicket.mercado;
      if (freshMarket.estado !== MercadoEstado.CERRADO || !freshMarket.ganadoraId) {
        throw new Error("MARKET_NOT_CLOSED");
      }

      if (freshMarket.ganadoraId !== freshTicket.opcionId) {
        throw new Error("NOT_WINNER");
      }

      if (freshMarket.franquiciaScope === MercadoScope.SEDE && freshMarket.sedeId && freshMarket.sedeId !== cajaSesion.franquiciaId) {
        throw new Error("MARKET_FRANQUICIA_MISMATCH");
      }

      let payoutAmount = 0;

      if (freshMarket.tipo === MercadoTipo.ODDS) {
        const cuotaBase = normalizeOdd(freshTicket.cuotaFijada) ?? normalizeOdd(freshTicket.opcion.cuotaActual) ?? normalizeOdd(freshTicket.opcion.cuotaInicial) ?? 2;
        const cuotaToUse = Number(clamp(cuotaBase, 1.2, 5).toFixed(2));
        payoutAmount = computeOddsPayout(freshTicket.monto, cuotaToUse);
      } else {
        const relatedTickets = await tx.ticket.findMany({
          where: {
            mercadoId: freshMarket.id,
            estado: { in: [TicketEstado.ACTIVO, TicketEstado.PAGADO] },
          },
          select: {
            monto: true,
            opcionId: true,
          },
        });

        const totalApostado = relatedTickets.reduce((sum, current) => sum + current.monto, 0);
        const totalGanadores = relatedTickets
          .filter((item) => item.opcionId === freshMarket.ganadoraId)
          .reduce((sum, current) => sum + current.monto, 0);

        payoutAmount = calculatePoolPayout({
          totalApostado,
          feePct: Number(freshMarket.feePct),
          ganadoresSuma: totalGanadores,
          montoTicket: freshTicket.monto,
        });
      }

      const pago = await tx.pago.create({
        data: {
          ticketId: freshTicket.id,
          pagadorId: session.userId,
          franquiciaId: cajaSesion.franquiciaId,
          monto: payoutAmount,
        },
      });

      await tx.ticket.update({
        where: { id: freshTicket.id },
        data: {
          estado: TicketEstado.PAGADO,
        },
      });

      await tx.cajaMovimiento.create({
        data: {
          franquiciaId: cajaSesion.franquiciaId,
          trabajadorId: session.userId,
          cajaSesionId: cajaSesion.id,
          tipo: CajaMovimientoTipo.EGRESO,
          monto: payoutAmount,
          refTipo: "PAGO",
          refId: pago.id,
          notas: `Pago ticket ${freshTicket.codigo}`,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "UPDATE",
          entidad: "Ticket",
          entidadId: freshTicket.id,
          antes: {
            estado: TicketEstado.ACTIVO,
          },
          despues: {
            estado: TicketEstado.PAGADO,
            pagoId: pago.id,
            montoPagado: payoutAmount,
          },
        },
      });

      return { amount: payoutAmount, ticket: freshTicket, market: freshMarket.nombre };
    });

    if (result.amount >= HIGH_PAYOUT_THRESHOLD) {
      emitAppEvent(
        buildAppEvent({
          type: "HIGH_PAYOUT",
          message: `Pago mayor registrado: ${result.amount.toLocaleString()} USD`,
          payload: { ticketId: parsed.data.ticketId, mercado: result.market, codigo: result.ticket.codigo },
        }),
      );
    }

    revalidatePath("/payments");
    revalidatePath("/cash");

    return { ok: true, message: `Ticket pagado. Monto entregado: ${result.amount.toLocaleString()} USD` };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "CAJA_SESSION_MISSING") {
        return { ok: false, message: "Tu caja activa ya no esta disponible. Abre una nueva caja." };
      }
      if (error.message === "TICKET_UNAVAILABLE" || error.message === "TICKET_ALREADY_PAID") {
        return { ok: false, message: "El ticket ya fue atendido" };
      }
      if (error.message === "MARKET_NOT_CLOSED") {
        return { ok: false, message: "El mercado aun no esta cerrado" };
      }
      if (error.message === "NOT_WINNER") {
        return { ok: false, message: "El ticket no corresponde al ganador" };
      }
      if (error.message === "MARKET_FRANQUICIA_MISMATCH") {
        return { ok: false, message: "Este ticket pertenece a otra sede" };
      }
    }

    console.error("Error pagando ticket", error);
    return { ok: false, message: "No se pudo completar el pago" };
  }
}






