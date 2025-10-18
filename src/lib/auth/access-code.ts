import type { User, Franquicia } from "@prisma/client";
import { UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

import prisma from "@/lib/prisma";

const ACCESS_CODE_PEPPER = process.env.ACCESS_CODE_PEPPER ?? "bethboom-pepper";

export type AuthenticatedUser = User & {
  franquicia: Franquicia | null;
  auditorFranquicia: Franquicia | null;
};

export async function authenticateAccessCode(code: string): Promise<AuthenticatedUser | null> {
  const trimmed = code.trim();
  if (!trimmed) {
    return null;
  }

  const users = await prisma.user.findMany({
    where: {
      estado: UserStatus.ACTIVE,
    },
    include: {
      franquicia: true,
      auditorFranquicia: true,
    },
  });

  for (const user of users) {
    const isMatch = await bcrypt.compare(`${ACCESS_CODE_PEPPER}${trimmed}`, user.accessCodeHash);
    if (isMatch) {
      return user;
    }
  }

  return null;
}
export async function hashAccessCode(code: string) {
  const trimmed = code.trim();
  if (!trimmed) {
    throw new Error("AccessCode vacio");
  }
  return bcrypt.hash(`${ACCESS_CODE_PEPPER}${trimmed}`, 10);
}

