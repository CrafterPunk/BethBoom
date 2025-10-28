"use server";

import { buildAppEvent, emitAppEvent } from "@/lib/events";
import { formatDeltaMessage } from "@/lib/format";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CajaLiquidacionTipo,
  CajaMovimientoTipo,
  CajaSesionEstado,
  Prisma,
  TicketEstado,
  UserRole,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

const openSchema = z.object({
  capitalPropio: z.number().int().nonnegative(),
  franquiciaId: z.string().uuid().optional(),
});

const requestCloseSchema = z.object({}).strict();

const approveSchema = z.object({
  sessionId: z.string().uuid(),
});

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

export async function openCashSessionAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.TRABAJADOR && session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = openSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const existing = await prisma.cajaSesion.findFirst({
    where: {
      trabajadorId: session.userId,
      estado: { in: [CajaSesionEstado.ABIERTA, CajaSesionEstado.SOLICITADA] },
    },
  });

  if (existing) {
    return { ok: false, message: "Ya tienes una caja abierta o en aprobacion" };
  }

  const franquiciaId = session.franquiciaId ?? parsed.data.franquiciaId;
  if (!franquiciaId) {
    return { ok: false, message: "Debes seleccionar una franquicia" };
  }

  const franquicia = await prisma.franquicia.findUnique({ where: { id: franquiciaId } });
  if (!franquicia || !franquicia.activa) {
    return { ok: false, message: "Franquicia invalida" };
  }

  await prisma.$transaction(async (tx) => {
    const cajaSesion = await tx.cajaSesion.create({
      data: {
        franquiciaId,
        trabajadorId: session.userId,
        capitalPropio: parsed.data.capitalPropio,
      },
    });

    if (parsed.data.capitalPropio > 0) {
      await tx.cajaMovimiento.create({
        data: {
          franquiciaId,
          trabajadorId: session.userId,
          cajaSesionId: cajaSesion.id,
          tipo: CajaMovimientoTipo.APERTURA,
          monto: parsed.data.capitalPropio,
          refTipo: "CAJA",
          refId: cajaSesion.id,
          notas: "Capital propio declarado",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: session.userId,
        accion: "CREATE",
        entidad: "CajaSesion",
        entidadId: cajaSesion.id,
        antes: Prisma.JsonNull,
        despues: {
          capitalPropio: parsed.data.capitalPropio,
          franquiciaId,
        },
      },
    });
  });

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { ok: true, message: "Caja abierta" };
}

export async function requestCashCloseAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.TRABAJADOR && session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = requestCloseSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }


  let cierreResumen: {
    capitalPropio: number;
    ventas: number;
    pagos: number;
    saldoDisponible: number;
    liquidacionTipo: CajaLiquidacionTipo;
    liquidacionMonto: number;
    ventasCount: number;
    pagosCount: number;
    delta?: number;
    deltaMensaje?: string;
  } | null = null;
  let cierreDeltaMensaje: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const cajaSesion = await tx.cajaSesion.findFirst({
        where: {
          trabajadorId: session.userId,
          estado: CajaSesionEstado.ABIERTA,
        },
      });

      if (!cajaSesion) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const now = new Date();

      const [ventasAgg, pagosAgg] = await Promise.all([
        tx.ticket.aggregate({
          _sum: { monto: true },
          _count: { _all: true },
          where: {
            trabajadorId: cajaSesion.trabajadorId,
            franquiciaId: cajaSesion.franquiciaId,
            estado: { in: [TicketEstado.ACTIVO, TicketEstado.PAGADO] },
            createdAt: { gte: cajaSesion.createdAt, lte: now },
          },
        }),
        tx.pago.aggregate({
          _sum: { monto: true },
          _count: { _all: true },
          where: {
            pagadorId: cajaSesion.trabajadorId,
            franquiciaId: cajaSesion.franquiciaId,
            pagadoAt: { gte: cajaSesion.createdAt, lte: now },
          },
        }),
      ]);

      const ventasTotal = Number(ventasAgg._sum.monto ?? 0);
      const ventasCount = ventasAgg._count._all ?? 0;
      const pagosTotal = Number(pagosAgg._sum.monto ?? 0);
      const pagosCount = pagosAgg._count._all ?? 0;

      const saldoDisponible = cajaSesion.capitalPropio + ventasTotal - pagosTotal;
      const neto = ventasTotal - pagosTotal;

      let liquidacionTipo: CajaLiquidacionTipo = CajaLiquidacionTipo.BALANCEADO;
      let liquidacionMonto = 0;

      if (neto > 0) {
        liquidacionTipo = CajaLiquidacionTipo.WORKER_OWES;
        liquidacionMonto = neto;
      } else if (neto < 0) {
        liquidacionTipo = CajaLiquidacionTipo.HQ_OWES;
        liquidacionMonto = Math.abs(neto);
      }

      const delta = liquidacionTipo === CajaLiquidacionTipo.WORKER_OWES
        ? liquidacionMonto
        : liquidacionTipo === CajaLiquidacionTipo.HQ_OWES
          ? -liquidacionMonto
          : 0;
      const deltaMensaje = formatDeltaMessage(delta);

      const reporteCierre = {
        capitalPropio: cajaSesion.capitalPropio,
        ventas: ventasTotal,
        pagos: pagosTotal,
        saldoDisponible,
        liquidacionTipo,
        liquidacionMonto,
        delta,
        deltaMensaje,
        ventasCount,
        pagosCount,
      } as const;

      cierreResumen = {
        capitalPropio: cajaSesion.capitalPropio,
        ventas: ventasTotal,
        pagos: pagosTotal,
        saldoDisponible,
        liquidacionTipo,
        liquidacionMonto,
        delta,
        deltaMensaje,
        ventasCount,
        pagosCount,
      };
      cierreDeltaMensaje = deltaMensaje;

      await tx.cajaSesion.update({
        where: { id: cajaSesion.id },
        data: {
          estado: CajaSesionEstado.SOLICITADA,
          ventasTotal,
          ventasCount,
          pagosTotal,
          pagosCount,
          liquidacionTipo,
          liquidacionMonto,
          reporteCierre,
          solicitadoAt: now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "UPDATE",
          entidad: "CajaSesion",
          entidadId: cajaSesion.id,
          antes: {
            estado: CajaSesionEstado.ABIERTA,
          },
          despues: {
            estado: CajaSesionEstado.SOLICITADA,
            liquidacionTipo,
            liquidacionMonto,
            saldoDisponible,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_NOT_FOUND") {
      return { ok: false, message: "No tienes una caja abierta" };
    }
    console.error("Error solicitando cierre de caja", error);
    return { ok: false, message: "No se pudo solicitar el cierre" };
  }

  emitAppEvent(
    buildAppEvent({
      type: "CASH_CLOSE_REQUESTED",
      message: `Cierre solicitado por ${session.displayName}`,
      payload: cierreResumen ?? undefined,
    }),
  );

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { ok: true, message: `Cierre solicitado. ${cierreDeltaMensaje ?? formatDeltaMessage(0)}` };
}

export async function approveCashSessionAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  let operadorNombre: string | null = null;
  let resumen: {
    capitalPropio: number;
    ventas: number;
    pagos: number;
    saldoDisponible: number;
    liquidacionTipo: CajaLiquidacionTipo;
    liquidacionMonto: number;
    ventasCount: number;
    pagosCount: number;
    delta: number;
    deltaMensaje: string;
  } | null = null;
  let approveDeltaMensaje: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const cajaSesion = await tx.cajaSesion.findUnique({
        where: { id: parsed.data.sessionId },
        include: {
          trabajador: {
            select: { displayName: true },
          },
        },
      });

      if (!cajaSesion || cajaSesion.estado !== CajaSesionEstado.SOLICITADA) {
        throw new Error("SESSION_NOT_READY");
      }

      operadorNombre = cajaSesion.trabajador?.displayName ?? null;

      const liquidacionTipo = cajaSesion.liquidacionTipo ?? CajaLiquidacionTipo.BALANCEADO;
      const liquidacionMonto = cajaSesion.liquidacionMonto ?? 0;
      const saldoDisponible = cajaSesion.capitalPropio + cajaSesion.ventasTotal - cajaSesion.pagosTotal;
      const delta = liquidacionTipo === CajaLiquidacionTipo.WORKER_OWES
        ? liquidacionMonto
        : liquidacionTipo === CajaLiquidacionTipo.HQ_OWES
          ? -liquidacionMonto
          : 0;
      const deltaMensaje = formatDeltaMessage(delta);

      resumen = {
        capitalPropio: cajaSesion.capitalPropio,
        ventas: cajaSesion.ventasTotal,
        pagos: cajaSesion.pagosTotal,
        saldoDisponible,
        liquidacionTipo,
        liquidacionMonto,
        ventasCount: cajaSesion.ventasCount,
        pagosCount: cajaSesion.pagosCount,
        delta,
        deltaMensaje,
      };
      approveDeltaMensaje = deltaMensaje;

      await tx.cajaSesion.update({
        where: { id: cajaSesion.id },
        data: {
          estado: CajaSesionEstado.CERRADA,
          aprobadoPorId: session.userId,
          aprobadoAt: new Date(),
          cerradoAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "UPDATE",
          entidad: "CajaSesion",
          entidadId: cajaSesion.id,
          antes: {
            estado: CajaSesionEstado.SOLICITADA,
          },
          despues: {
            estado: CajaSesionEstado.CERRADA,
            liquidacionTipo,
            liquidacionMonto,
          },
        },
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "SESSION_NOT_READY") {
      return { ok: false, message: "La sesion no esta lista para aprobar" };
    }
    console.error("Error aprobando cierre de caja", error);
    return { ok: false, message: "No se pudo aprobar el cierre" };
  }

  let payload: Record<string, unknown> | undefined;
  if (resumen) {
    payload = {
      trabajador: operadorNombre,
      resumen,
    };
  } else if (operadorNombre) {
    payload = { trabajador: operadorNombre };
  }

  emitAppEvent(
    buildAppEvent({
      type: "CASH_CLOSE_APPROVED",
      message: `Cierre aprobado${operadorNombre ? ` para ${operadorNombre}` : ""}`,
      payload,
    }),
  );

  revalidatePath("/cash");
  revalidatePath("/dashboard");
  return { ok: true, message: `Cierre aprobado. ${approveDeltaMensaje ?? formatDeltaMessage(0)}` };
}
























