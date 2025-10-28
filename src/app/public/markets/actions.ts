"use server";

import { z } from "zod";
import { MercadoTipo } from "@prisma/client";

import prisma from "@/lib/prisma";

const searchSchema = z.object({
  code: z.string().trim().min(4).max(60),
});

export type PublicTicketResult =
  | { status: "not-found" }
  | {
      status: "found";
      ticket: {
        codigo: string;
        estado: string;
        monto: number;
        mercado: {
          nombre: string;
          tipo: MercadoTipo;
          estado: string;
          endsAt: string | null;
        };
        opcionNombre: string;
        cuotaBase: number | null;
        payoutPotencial: number | null;
        payoutReal: number | null;
        pagadoAt: string | null;
        createdAt: string;
      };
    };

export async function searchTicketAction(input: unknown): Promise<PublicTicketResult> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "not-found" };
  }

  const code = parsed.data.code.toUpperCase();

  const ticket = await prisma.ticket.findUnique({
    where: { codigo: code },
    include: {
      mercado: {
        select: {
          nombre: true,
          tipo: true,
          estado: true,
          endsAt: true,
        },
      },
      opcion: {
        select: {
          nombre: true,
          cuotaActual: true,
          cuotaInicial: true,
        },
      },
      pagado: {
        select: {
          monto: true,
          pagadoAt: true,
        },
      },
    },
  });

  if (!ticket) {
    return { status: "not-found" };
  }

  const cuotaBaseRaw =
    ticket.cuotaFijada !== null
      ? Number(ticket.cuotaFijada)
      : ticket.opcion.cuotaActual !== null
        ? Number(ticket.opcion.cuotaActual)
        : ticket.opcion.cuotaInicial !== null
          ? Number(ticket.opcion.cuotaInicial)
          : null;

  let payoutPotencial: number | null = null;
  if (ticket.pagado) {
    payoutPotencial = ticket.pagado.monto;
  } else if (ticket.mercado.tipo === MercadoTipo.ODDS && cuotaBaseRaw) {
    payoutPotencial = Math.floor(ticket.monto * cuotaBaseRaw);
  }

  return {
    status: "found",
    ticket: {
      codigo: ticket.codigo,
      estado: ticket.estado,
      monto: ticket.monto,
      mercado: {
        nombre: ticket.mercado.nombre,
        tipo: ticket.mercado.tipo,
        estado: ticket.mercado.estado,
        endsAt: ticket.mercado.endsAt ? ticket.mercado.endsAt.toISOString() : null,
      },
      opcionNombre: ticket.opcion.nombre,
      cuotaBase: cuotaBaseRaw,
      payoutPotencial,
      payoutReal: ticket.pagado?.monto ?? null,
      pagadoAt: ticket.pagado?.pagadoAt ? ticket.pagado.pagadoAt.toISOString() : null,
      createdAt: ticket.createdAt.toISOString(),
    },
  };
}
