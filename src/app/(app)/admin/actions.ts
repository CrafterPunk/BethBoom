"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  Prisma,
  UserRole,
  UserStatus,
} from "@prisma/client";

import { hashAccessCode } from "@/lib/auth/access-code";
import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const franquiciaSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().min(3),
  codigo: z.string().min(2).max(10),
  share: z.number().min(0).max(100),
  activa: z.boolean().optional(),
});

const userSchema = z.object({
  displayName: z.string().min(3),
  role: z.nativeEnum(UserRole),
  accessCode: z.string().min(6),
  franquiciaId: z.string().uuid().optional(),
  auditorFranquiciaId: z.string().uuid().optional(),
});

const userStatusSchema = z.object({
  userId: z.string().uuid(),
  estado: z.nativeEnum(UserStatus),
});

const parametroSchema = z.object({
  clave: z.string().min(3),
  valor: z.string().min(1),
  descripcion: z.string().optional(),
});

const purgeLogsSchema = z.object({
  before: z.string().datetime().optional(),
});

async function ensureAdmin() {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

export async function saveFranquiciaAction(input: unknown): Promise<ActionResult> {
  try {
    await ensureAdmin();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = franquiciaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const { id, nombre, codigo, share, activa } = parsed.data;

  try {
    if (id) {
      await prisma.franquicia.update({
        where: { id },
        data: {
          nombre,
          codigo,
          franchiseSharePctDefault: share,
          ...(typeof activa === "boolean" ? { activa } : {}),
        },
      });
    } else {
      await prisma.franquicia.create({
        data: {
          nombre,
          codigo,
          franchiseSharePctDefault: share,
          activa: activa ?? true,
        },
      });
    }
  } catch (error) {
    console.error("Error guardando franquicia", error);
    return { ok: false, message: "No se pudo guardar la franquicia" };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Franquicia guardada" };
}

export async function createUserAction(input: unknown): Promise<ActionResult> {
  let session;
  try {
    session = await ensureAdmin();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = userSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const { displayName, role, accessCode, franquiciaId, auditorFranquiciaId } = parsed.data;

  if (role === UserRole.TRABAJADOR && !franquiciaId) {
    return { ok: false, message: "El trabajador requiere una franquicia" };
  }

  if (role === UserRole.AUDITOR_FRANQUICIA && !auditorFranquiciaId) {
    return { ok: false, message: "El auditor requiere franquicia asignada" };
  }

  const hashed = await hashAccessCode(accessCode);

  try {
    await prisma.user.create({
      data: {
        displayName,
        role,
        estado: UserStatus.ACTIVE,
        accessCodeHash: hashed,
        franquiciaId: role === UserRole.TRABAJADOR ? franquiciaId ?? null : null,
        auditorFranquiciaId: role === UserRole.AUDITOR_FRANQUICIA ? auditorFranquiciaId ?? null : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        accion: "CREATE",
        entidad: "User",
        entidadId: displayName,
        antes: Prisma.JsonNull,
        despues: {
          displayName,
          role,
        },
      },
    });
  } catch (error) {
    console.error("Error creando usuario", error);
    return { ok: false, message: "No se pudo crear el usuario" };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Usuario creado" };
}

export async function setUserStatusAction(input: unknown): Promise<ActionResult> {
  let session;
  try {
    session = await ensureAdmin();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = userStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const { userId, estado } = parsed.data;

  try {
    const previous = await prisma.user.update({
      where: { id: userId },
      data: { estado },
      select: { displayName: true, estado: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        accion: "UPDATE",
        entidad: "User",
        entidadId: userId,
        antes: { estado: previous.estado },
        despues: { estado },
      },
    });
  } catch (error) {
    console.error("Error actualizando usuario", error);
    return { ok: false, message: "No se pudo actualizar el usuario" };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Usuario actualizado" };
}

export async function saveParametroAction(input: unknown): Promise<ActionResult> {
  try {
    await ensureAdmin();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = parametroSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  const { clave, valor, descripcion } = parsed.data;

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(valor);
  } catch {
    return { ok: false, message: "Valor JSON invalido" };
  }

  try {
    await prisma.parametroGlobal.upsert({
      where: { clave },
      update: {
        valor: (parsedValue === null ? Prisma.JsonNull : (parsedValue as Prisma.InputJsonValue)),
        descripcion,
      },
      create: {
        clave,
        valor: (parsedValue === null ? Prisma.JsonNull : (parsedValue as Prisma.InputJsonValue)),
        descripcion,
      },
    });
  } catch (error) {
    console.error("Error guardando parametro", error);
    return { ok: false, message: "No se pudo guardar el parametro" };
  }

  revalidatePath("/admin");
  return { ok: true, message: "Parametro guardado" };
}

export async function purgeAuditLogsAction(input: unknown): Promise<ActionResult> {
  try {
    await ensureAdmin();
  } catch {
    return { ok: false, message: "No autorizado" };
  }

  const parsed = purgeLogsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos" };
  }

  if (!parsed.data.before) {
    return { ok: false, message: "Debes indicar una fecha" };
  }

  const cutoff = new Date(parsed.data.before);
  if (Number.isNaN(cutoff.getTime())) {
    return { ok: false, message: "Fecha invalida" };
  }

  try {
    const result = await prisma.auditLog.deleteMany({
      where: { createdAt: { lte: cutoff } },
    });
    revalidatePath("/admin");
    return { ok: true, message: `Logs eliminados: ${result.count}` };
  } catch (error) {
    console.error("Error eliminando logs", error);
    return { ok: false, message: "No se pudo eliminar" };
  }
}


















