"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  MercadoEstado,
  MercadoScope,
  MercadoTipo,
  Prisma,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

export type ActionResult<T = undefined> =
  | { ok: true; message: string; data?: T }
  | { ok: false; message: string };

const optionSchema = z.object({
  nombre: z.string().min(1, "Nombre requerido"),
  cuotaInicial: z.number().min(1.2).max(5).nullable(),
});

const createMarketSchema = z.object({
  nombre: z.string().min(3, "Nombre demasiado corto"),
  descripcion: z.string().min(5, "Descripcion demasiado corta"),
  tipo: z.nativeEnum(MercadoTipo),
  feePct: z.number().min(0).max(100),
  franchiseSharePct: z.number().min(0).max(100),
  umbralRecalcMonto: z.number().min(1000),
  franquiciaScope: z.nativeEnum(MercadoScope),
  sedeId: z.string().uuid().nullable(),
  startsAt: z.string().optional().nullable(),
  endsAt: z.string().optional().nullable(),
  opciones: z.array(optionSchema).min(2, "Se requieren al menos 2 opciones"),
});

const updateStatusSchema = z.object({
  marketId: z.string().uuid(),
  estado: z.nativeEnum(MercadoEstado),
  ganadoraId: z.string().uuid().optional().nullable(),
});

const addOptionSchema = z.object({
  marketId: z.string().uuid(),
  nombre: z.string().min(1),
  cuotaInicial: z.number().min(1.2).max(5).nullable(),
});

const updateOptionSchema = z.object({
  optionId: z.string().uuid(),
  cuotaActual: z.number().min(1.2).max(5),
});

function ensureCanCreateMarket(role: string): ActionResult {
  if (role !== "ADMIN_GENERAL" && role !== "MARKET_MAKER") {
    return { ok: false, message: "Accion permitida solo para Admin o Market Maker" };
  }
  return { ok: true, message: "ok" };
}

export async function createMarketAction(payload: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const allowed = ensureCanCreateMarket(session.role);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = createMarketSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" | "),
    };
  }

  const data = parsed.data;
  if (data.franquiciaScope === MercadoScope.SEDE && !data.sedeId) {
    return { ok: false, message: "Debe seleccionar una sede para el alcance SEDE" };
  }

  const isOdds = data.tipo === MercadoTipo.ODDS;
  if (!isOdds) {
    data.opciones.forEach((option) => {
      option.cuotaInicial = null;
    });
  }

  const startsAt = data.startsAt ? new Date(data.startsAt) : null;
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;

  try {
    await prisma.$transaction(async (tx) => {
      const mercado = await tx.mercado.create({
        data: {
          nombre: data.nombre,
          descripcion: data.descripcion,
          tipo: data.tipo,
          feePct: new Prisma.Decimal(data.feePct),
          franchiseSharePct: new Prisma.Decimal(data.franchiseSharePct),
          umbralRecalcMonto: data.umbralRecalcMonto,
          franquiciaScope: data.franquiciaScope,
          sedeId: data.franquiciaScope === MercadoScope.SEDE ? data.sedeId : null,
          startsAt,
          endsAt,
          createdById: session.userId,
          opciones: {
            createMany: {
              data: data.opciones.map((option) => ({
                nombre: option.nombre,
                cuotaInicial: option.cuotaInicial ? new Prisma.Decimal(option.cuotaInicial) : null,
                cuotaActual: option.cuotaInicial ? new Prisma.Decimal(option.cuotaInicial) : null,
              })),
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "CREATE",
          entidad: "Mercado",
          entidadId: mercado.id,
          antes: Prisma.JsonNull,
          despues: {
            nombre: data.nombre,
            tipo: data.tipo,
            opciones: data.opciones.map((option) => option.nombre),
          },
        },
      });
    });
  } catch (error) {
    console.error("Error creando mercado", error);
    return { ok: false, message: "No se pudo crear el mercado" };
  }

  revalidatePath("/markets");
  return { ok: true, message: "Mercado creado correctamente" };
}

export async function updateMarketStatusAction(payload: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const allowed = ensureCanCreateMarket(session.role);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = updateStatusSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" | "),
    };
  }

  const { marketId, estado, ganadoraId } = parsed.data;

  if (session.role === "MARKET_MAKER" && estado === MercadoEstado.CERRADO) {
    return { ok: false, message: "Solo un Admin puede cerrar y asignar ganadores." };
  }

  try {
    const market = await prisma.mercado.findUnique({
      where: { id: marketId },
      include: { opciones: true },
    });
    if (!market) {
      return { ok: false, message: "Mercado no encontrado" };
    }

    if (estado === MercadoEstado.CERRADO) {
      if (!ganadoraId) {
        return { ok: false, message: "Debe seleccionar una opcion ganadora" };
      }
      const optionExists = market.opciones.some((option) => option.id === ganadoraId);
      if (!optionExists) {
        return { ok: false, message: "La opcion indicada no pertenece al mercado" };
      }
    }

    const previous = {
      estado: market.estado,
      ganadoraId: market.ganadoraId ?? null,
    };

    await prisma.$transaction(async (tx) => {
      await tx.mercado.update({
        where: { id: marketId },
        data: {
          estado,
          ganadoraId: estado === MercadoEstado.CERRADO ? ganadoraId ?? null : null,
          closedAt: estado === MercadoEstado.CERRADO ? new Date() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "UPDATE",
          entidad: "Mercado",
          entidadId: marketId,
          antes: previous,
          despues: {
            estado,
            ganadoraId: estado === MercadoEstado.CERRADO ? ganadoraId ?? null : null,
          },
        },
      });
    });
  } catch (error) {
    console.error("Error actualizando estado del mercado", error);
    return { ok: false, message: "No se pudo actualizar el estado" };
  }

  revalidatePath("/markets");
  return { ok: true, message: "Estado actualizado" };
}

export async function addOptionAction(payload: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const allowed = ensureCanCreateMarket(session.role);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = addOptionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" | "),
    };
  }

  const { marketId, nombre, cuotaInicial } = parsed.data;

  try {
    const market = await prisma.mercado.findUnique({ where: { id: marketId }, select: { tipo: true } });
    if (!market) {
      return { ok: false, message: "Mercado no encontrado" };
    }

    const isOdds = market.tipo === MercadoTipo.ODDS;
    const hasOdds = isOdds ? cuotaInicial ?? null : null;

    if (isOdds && hasOdds === null) {
      return { ok: false, message: "La cuota inicial es obligatoria para mercados ODDS" };
    }

    await prisma.$transaction(async (tx) => {
      const option = await tx.opcion.create({
        data: {
          mercadoId: marketId,
          nombre,
          cuotaInicial: hasOdds ? new Prisma.Decimal(hasOdds) : null,
          cuotaActual: hasOdds ? new Prisma.Decimal(hasOdds) : null,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "CREATE",
          entidad: "Opcion",
          entidadId: option.id,
          antes: Prisma.JsonNull,
          despues: {
            nombre,
            mercadoId: marketId,
            cuotaInicial: hasOdds,
          },
        },
      });
    });
  } catch (error) {
    console.error("Error agregando opcion", error);
    return { ok: false, message: "No se pudo agregar la opcion" };
  }

  revalidatePath("/markets");
  return { ok: true, message: "Opcion creada" };
}

export async function updateOptionOddsAction(payload: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const allowed = ensureCanCreateMarket(session.role);
  if (!allowed.ok) {
    return allowed;
  }

  const parsed = updateOptionSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((issue) => issue.message).join(" | "),
    };
  }

  const { optionId, cuotaActual } = parsed.data;

  try {
    const option = await prisma.opcion.findUnique({
      where: { id: optionId },
      include: { mercado: true },
    });
    if (!option) {
      return { ok: false, message: "Opcion no encontrada" };
    }
    if (option.mercado.tipo !== MercadoTipo.ODDS) {
      return { ok: false, message: "Solo se pueden ajustar cuotas en mercados ODDS" };
    }

    const previous = {
      cuotaActual: option.cuotaActual ? Number(option.cuotaActual) : null,
    };

    await prisma.$transaction(async (tx) => {
      const updated = await tx.opcion.update({
        where: { id: optionId },
        data: { cuotaActual: new Prisma.Decimal(cuotaActual) },
      });

      await tx.oddUpdate.create({
        data: {
          opcionId: optionId,
          sesgo: new Prisma.Decimal(0),
          antes: option.cuotaActual,
          despues: updated.cuotaActual,
          motivo: "AJUSTE_MANUAL",
          actorId: session.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: session.userId,
          accion: "UPDATE",
          entidad: "Opcion",
          entidadId: optionId,
          antes: previous,
          despues: {
            cuotaActual,
          },
        },
      });
    });
  } catch (error) {
    console.error("Error actualizando cuota", error);
    return { ok: false, message: "No se pudo actualizar la cuota" };
  }

  revalidatePath("/markets");
  return { ok: true, message: "Cuota actualizada" };
}




