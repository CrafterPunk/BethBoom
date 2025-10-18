"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { UserRole } from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const deleteSchema = z.object({ id: z.string().uuid() });

export async function deleteAuditLogAction(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Solicitud invalida" };
  }

  try {
    await prisma.auditLog.delete({ where: { id: parsed.data.id } });
  } catch (error) {
    console.error("Error eliminando log", error);
    return { ok: false, message: "No se pudo eliminar el log" };
  }

  revalidatePath("/audits");
  return { ok: true, message: "Log eliminado" };
}
