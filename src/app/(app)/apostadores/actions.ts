"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const adjustSchema = z.object({
  apostadorId: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

const setRankSchema = z.object({
  apostadorId: z.string().uuid(),
  rankId: z.string().uuid(),
  motivo: z.string().trim().max(140).optional(),
});

const toggleAutoSchema = z.object({
  apostadorId: z.string().uuid(),
  enabled: z.boolean(),
});

const noteSchema = z.object({
  apostadorId: z.string().uuid(),
  contenido: z.string().min(2, "La nota es muy corta").max(600, "La nota es muy larga"),
});

const createTagSchema = z.object({
  nombre: z.string().min(2).max(40),
  color: z
    .string()
    .regex(/^#([0-9a-f]{6})$/i, "Color invalido"),
  descripcion: z.string().max(120).optional(),
});

const assignTagSchema = z.object({
  apostadorId: z.string().uuid(),
  tagId: z.string().uuid(),
});

const removeTagSchema = z.object({
  assignmentId: z.string().uuid(),
});

async function logPromotion({
  apostadorId,
  previousId,
  previousName,
  nextId,
  nextName,
  motivo,
  actorId,
}: {
  apostadorId: string;
  previousId: string | null;
  previousName: string | null;
  nextId: string;
  nextName: string;
  motivo: string;
  actorId: string;
}) {
  await prisma.apostadorPromocionHistorial.create({
    data: {
      apostadorId,
      rangoAnteriorId: previousId ?? undefined,
      rangoAnteriorNombre: previousName ?? undefined,
      rangoNuevoId: nextId,
      rangoNuevoNombre: nextName,
      motivo,
      triggeredById: actorId,
    },
  });
}

async function manualRankAdjustment(
  apostadorId: string,
  targetRankId: string,
  motivo: string,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const apostador = await tx.apostador.findUnique({
      where: { id: apostadorId },
      include: { rango: true },
    });
    if (!apostador) {
      throw new Error("APOSTADOR_NOT_FOUND");
    }

    if (apostador.rangoId === targetRankId) {
      return { updated: apostador, nextRank: apostador.rango, previousRank: apostador.rango };
    }

    const nextRank = await tx.rankRegla.findUnique({ where: { id: targetRankId } });
    if (!nextRank) {
      throw new Error("RANK_NOT_FOUND");
    }

    const updated = await tx.apostador.update({
      where: { id: apostadorId },
      data: {
        rangoId: nextRank.id,
        rangoManualId: nextRank.id,
        promocionAutomatica: false,
      },
      include: { rango: true },
    });

    await logPromotion({
      apostadorId,
      previousId: apostador.rangoId,
      previousName: apostador.rango?.nombre ?? null,
      nextId: nextRank.id,
      nextName: nextRank.nombre,
      motivo,
      actorId,
    });

    await tx.auditLog.create({
      data: {
        actorId,
        accion: "UPDATE",
        entidad: "Apostador",
        entidadId: apostadorId,
        antes: {
          rangoId: apostador.rangoId,
          rangoNombre: apostador.rango?.nombre ?? null,
        },
        despues: {
          rangoId: nextRank.id,
          rangoNombre: nextRank.nombre,
          motivo,
        },
      },
    });

    return { updated, nextRank, previousRank: apostador.rango };
  });
}

export async function adjustApostadorRankAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = adjustSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const { apostadorId, direction } = parsed.data;

  const rankRules = await prisma.rankRegla.findMany({ orderBy: { orden: "asc" } });
  const apostador = await prisma.apostador.findUnique({ where: { id: apostadorId } });
  if (!apostador) {
    return { ok: false, message: "Apostador no encontrado" };
  }

  const currentIndex = rankRules.findIndex((rule) => rule.id === apostador.rangoId);
  if (currentIndex === -1) {
    return { ok: false, message: "Rango actual no valido" };
  }

  const targetIndex =
    direction === "up"
      ? Math.min(rankRules.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);

  if (targetIndex === currentIndex) {
    return {
      ok: false,
      message: direction === "up" ? "Ya esta en el rango maximo" : "Ya esta en el rango minimo",
    };
  }

  const targetRank = rankRules[targetIndex];
  try {
    await manualRankAdjustment(apostadorId, targetRank.id, direction === "up" ? "manual_promote" : "manual_demote", session.userId);
  } catch (error) {
    if (error instanceof Error && error.message === "RANK_NOT_FOUND") {
      return { ok: false, message: "Rango destino no disponible" };
    }
    throw error;
  }

  revalidatePath("/apostadores");

  return { ok: true, message: `Rango actualizado a ${targetRank.nombre}` };
}

export async function setApostadorRankAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = setRankSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const { apostadorId, rankId, motivo } = parsed.data;

  try {
    await manualRankAdjustment(apostadorId, rankId, motivo ?? "manual_set", session.userId);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "APOSTADOR_NOT_FOUND") {
        return { ok: false, message: "Apostador no encontrado" };
      }
      if (error.message === "RANK_NOT_FOUND") {
        return { ok: false, message: "Rango no encontrado" };
      }
    }
    throw error;
  }

  revalidatePath("/apostadores");
  return { ok: true, message: "Rango asignado manualmente" };
}

export async function setApostadorAutoModeAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = toggleAutoSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const { apostadorId, enabled } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const apostador = await tx.apostador.findUnique({
        where: { id: apostadorId },
        include: { rango: true },
      });
      if (!apostador) {
        throw new Error("APOSTADOR_NOT_FOUND");
      }

      if (enabled) {
        await tx.apostador.update({
          where: { id: apostadorId },
          data: {
            promocionAutomatica: true,
            rangoManualId: null,
            apuestasAcumuladas: 0,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            accion: "UPDATE",
            entidad: "Apostador",
            entidadId: apostadorId,
            antes: { promocionAutomatica: apostador.promocionAutomatica },
            despues: { promocionAutomatica: true },
          },
        });
      } else {
        await tx.apostador.update({
          where: { id: apostadorId },
          data: {
            promocionAutomatica: false,
            rangoManualId: apostador.rangoId,
          },
        });

        await tx.auditLog.create({
          data: {
            actorId: session.userId,
            accion: "UPDATE",
            entidad: "Apostador",
            entidadId: apostadorId,
            antes: { promocionAutomatica: apostador.promocionAutomatica },
            despues: { promocionAutomatica: false },
          },
        });
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === "APOSTADOR_NOT_FOUND") {
      return { ok: false, message: "Apostador no encontrado" };
    }
    throw error;
  }

  revalidatePath("/apostadores");
  return {
    ok: true,
    message: enabled ? "Promocion automatica activada" : "Promocion automatica desactivada",
  };
}

export async function addApostadorNoteAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL && session.role !== UserRole.TRABAJADOR) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Solicitud invalida" };
  }

  const { apostadorId, contenido } = parsed.data;

  await prisma.apostadorNota.create({
    data: {
      apostadorId,
      contenido,
      createdById: session.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.userId,
      accion: "CREATE",
      entidad: "ApostadorNota",
      entidadId: apostadorId,
      despues: {
        contenido,
      },
    },
  });

  revalidatePath("/apostadores");
  return { ok: true, message: "Nota registrada" };
}

export async function createApostadorTagAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = createTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Solicitud invalida" };
  }

  const { nombre, color, descripcion } = parsed.data;

  await prisma.apostadorTag.upsert({
    where: { nombre },
    update: {
      color,
      descripcion,
      activa: true,
    },
    create: {
      nombre,
      color,
      descripcion,
    },
  });

  revalidatePath("/apostadores");
  return { ok: true, message: "Etiqueta disponible" };
}

export async function assignApostadorTagAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = assignTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const { apostadorId, tagId } = parsed.data;

  await prisma.apostadorTagAssignment.upsert({
    where: {
      apostadorId_tagId: {
        apostadorId,
        tagId,
      },
    },
    update: {},
    create: {
      apostadorId,
      tagId,
      createdById: session.userId,
    },
  });

  revalidatePath("/apostadores");
  return { ok: true, message: "Etiqueta asignada" };
}

export async function removeApostadorTagAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = removeTagSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  const { assignmentId } = parsed.data;

  try {
    await prisma.apostadorTagAssignment.delete({ where: { id: assignmentId } });
  } catch {
    return { ok: false, message: "Asignacion no encontrada" };
  }

  revalidatePath("/apostadores");
  return { ok: true, message: "Etiqueta eliminada" };
}
