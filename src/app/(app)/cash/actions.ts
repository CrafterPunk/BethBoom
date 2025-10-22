"use server";

import { buildAppEvent, emitAppEvent } from "@/lib/events";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  CajaMovimientoTipo,
  CajaSesionEstado,
  Prisma,
  UserRole,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

const openSchema = z.object({
  saldoInicial: z.number().int().nonnegative(),
  franquiciaId: z.string().uuid().optional(),
});

const requestCloseSchema = z.object({
  saldoDeclarado: z.number().int().nonnegative(),
});

const approveSchema = z.object({
  sessionId: z.string().uuid(),
});

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

function computeSaldoSistema(movimientos: Array<{ tipo: CajaMovimientoTipo; monto: number }>) {
  return movimientos.reduce((sum, movimiento) => {
    switch (movimiento.tipo) {
      case CajaMovimientoTipo.EGRESO:
        return sum - movimiento.monto;
      case CajaMovimientoTipo.AJUSTE:
        return sum + movimiento.monto;
      default:
        return sum + movimiento.monto;
    }
  }, 0);
}

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
        saldoInicial: parsed.data.saldoInicial,
      },
    });

    if (parsed.data.saldoInicial > 0) {
      await tx.cajaMovimiento.create({
        data: {
          franquiciaId,
          trabajadorId: session.userId,
          cajaSesionId: cajaSesion.id,
          tipo: CajaMovimientoTipo.APERTURA,
          monto: parsed.data.saldoInicial,
          refTipo: "CAJA",
          refId: cajaSesion.id,
          notas: "Apertura de caja",
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
          saldoInicial: parsed.data.saldoInicial,
          franquiciaId,
        },
      },
    });
  });

  revalidatePath("/cash");
  return { ok: true, message: "Caja abierta" };
}

export async function requestCashCloseAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.TRABAJADOR && session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = requestCloseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }


  try {
    await prisma.$transaction(async (tx) => {
      const cajaSesion = await tx.cajaSesion.findFirst({
        where: {
          trabajadorId: session.userId,
          estado: CajaSesionEstado.ABIERTA,
        },
        include: {
          movimientos: {
            select: {
              tipo: true,
              monto: true,
            },
          },
        },
      });

      if (!cajaSesion) {
        throw new Error("SESSION_NOT_FOUND");
      }

      const saldoSistema = computeSaldoSistema(cajaSesion.movimientos);
      const diferencia = parsed.data.saldoDeclarado - saldoSistema;

      await tx.cajaSesion.update({
        where: { id: cajaSesion.id },
        data: {
          estado: CajaSesionEstado.SOLICITADA,
          saldoDeclarado: parsed.data.saldoDeclarado,
          saldoSistema,
          diferencia,
          solicitadoAt: new Date(),
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
            saldoDeclarado: parsed.data.saldoDeclarado,
            saldoSistema,
            diferencia,
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
      payload: { saldoDeclarado: parsed.data.saldoDeclarado },
    }),
);


  revalidatePath("/cash");
  return { ok: true, message: "Cierre solicitado" };
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

  let declaredSaldo = 0;

  try {
    await prisma.$transaction(async (tx) => {
      const cajaSesion = await tx.cajaSesion.findUnique({
        where: { id: parsed.data.sessionId },
        include: {
          movimientos: {
            select: {
              tipo: true,
              monto: true,
            },
          },
        },
      });

      if (!cajaSesion || cajaSesion.estado !== CajaSesionEstado.SOLICITADA) {
        throw new Error("SESSION_NOT_READY");
      }

      const saldoSistema = computeSaldoSistema(cajaSesion.movimientos);
      const diferencia = (cajaSesion.saldoDeclarado ?? 0) - saldoSistema;

      await tx.cajaSesion.update({
        where: { id: cajaSesion.id },
        data: {
          estado: CajaSesionEstado.CERRADA,
          saldoSistema,
          diferencia,
          aprobadoPorId: session.userId,
          aprobadoAt: new Date(),
          cerradoAt: new Date(),
        },
      });
      declaredSaldo = cajaSesion.saldoDeclarado ?? 0;

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
            saldoSistema,
            diferencia,
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

  emitAppEvent(
    buildAppEvent({
      type: "CASH_CLOSE_REQUESTED",
      message: `Cierre solicitado por ${session.displayName}`,
      payload: { saldoDeclarado: declaredSaldo },
    }),
  );

  revalidatePath("/cash");
  return { ok: true, message: "Caja cerrada" };
}




