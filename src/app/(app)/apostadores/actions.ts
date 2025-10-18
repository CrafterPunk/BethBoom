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

  const apostador = await prisma.apostador.findUnique({
    where: { id: apostadorId },
    include: { rango: true },
  });

  if (!apostador) {
    return { ok: false, message: "Apostador no encontrado" };
  }

  const rankRules = await prisma.rankRegla.findMany({ orderBy: { orden: "asc" } });
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

  const nextRank = rankRules[targetIndex];
  if (!nextRank) {
    return { ok: false, message: "No se pudo determinar el nuevo rango" };
  }

  await prisma.apostador.update({
    where: { id: apostadorId },
    data: {
      rangoId: nextRank.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.userId,
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
        motivo: direction === "up" ? "manual_promote" : "manual_demote",
      },
    },
  });

  revalidatePath("/apostadores");

  return {
    ok: true,
    message: `Rango actualizado a ${nextRank.nombre}`,
  };
}
