"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { authenticateAccessCode } from "@/lib/auth/access-code";
import { clearSession, createSession, readSession } from "@/lib/auth/session";

const loginSchema = z.object({
  accessCode: z.string().min(4, "Codigo muy corto").max(64, "Codigo muy largo"),
});

export type LoginState = {
  status: "idle" | "error";
  message?: string;
};

export async function loginAction(_: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ accessCode: formData.get("accessCode") });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "AccessCode invalido" };
  }

  const user = await authenticateAccessCode(parsed.data.accessCode);
  if (!user) {
    return { status: "error", message: "AccessCode no reconocido o usuario inactivo" };
  }

  await createSession({
    userId: user.id,
    displayName: user.displayName,
    role: user.role,
    franquiciaId: user.franquiciaId ?? null,
    auditorFranquiciaId: user.auditorFranquiciaId ?? null,
    issuedAt: Date.now(),
  });

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      accion: "LOGIN",
      entidad: "User",
      entidadId: user.id,
      antes: Prisma.JsonNull,
      despues: { login: "success" },
      ip: headers().get("x-forwarded-for")?.split(",")[0] ?? null,
      userAgent: headers().get("user-agent"),
    },
  });

  redirect("/dashboard");
}

export async function logoutAction() {
  const session = await readSession();
  if (session) {
    await prisma.auditLog.create({
      data: {
        actorId: session.userId,
        accion: "LOGOUT",
        entidad: "User",
        entidadId: session.userId,
        antes: { logout: "requested" },
        despues: Prisma.JsonNull,
        ip: headers().get("x-forwarded-for")?.split(",")[0] ?? null,
        userAgent: headers().get("user-agent"),
      },
    });
  }

  clearSession();
  redirect("/access");
}
