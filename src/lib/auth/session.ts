import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "bb_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8; // 8 horas

export type SessionPayload = {
  userId: string;
  displayName: string;
  role: UserRole;
  franquiciaId?: string | null;
  auditorFranquiciaId?: string | null;
  issuedAt: number;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET no configurado");
  }
  return secret;
}

export async function createSession(payload: SessionPayload) {
  const secret = getSecret();
  const token = await new Promise<string>((resolve, reject) => {
    jwt.sign(
      payload,
      secret,
      { expiresIn: SESSION_DURATION_SECONDS },
      (error, encoded) => {
        if (error || !encoded) {
          reject(error ?? new Error("No se pudo firmar token"));
          return;
        }
        resolve(encoded);
      },
    );
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_DURATION_SECONDS,
    path: "/",
  });
}

export function clearSession() {
  cookies().delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  try {
    const secret = getSecret();
    const decoded = await new Promise<SessionPayload>((resolve, reject) => {
      jwt.verify(token, secret, (error, payload) => {
        if (error || !payload) {
          reject(error ?? new Error("Token invalido"));
          return;
        }
        resolve(payload as SessionPayload);
      });
    });

    return decoded;
  } catch (error) {
    console.warn("Token invalido", error);
    clearSession();
    return null;
  }
}

export async function requireSession() {
  const session = await readSession();
  if (!session) {
    redirect("/access");
  }
  return session;
}

