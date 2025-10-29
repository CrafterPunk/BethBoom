import { UserRole } from "@prisma/client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { AdminManager } from "./admin-manager";

export default async function AdminPage() {
  const session = await requireSession();
  if (session.role !== UserRole.ADMIN_GENERAL) {
    return (
      <section className="py-8">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Acceso restringido</CardTitle>
            <CardDescription>Solo un Admin General puede gestionar esta seccion.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Contacta al administrador para obtener permisos.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  const [franquicias, users, parametros, totalLogs, latestLog] = await Promise.all([
    prisma.franquicia.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        franquicia: { select: { nombre: true } },
        auditorFranquicia: { select: { nombre: true } },
      },
    }),
    prisma.parametroGlobal.findMany({ orderBy: { clave: "asc" } }),
    prisma.auditLog.count(),
    prisma.auditLog.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);

  const data = {
    franquicias: franquicias.map((item) => ({
      id: item.id,
      nombre: item.nombre,
      codigo: item.codigo,
      share: Number(item.franchiseSharePctDefault),
      activa: item.activa,
    })),
    users: users.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      estado: user.estado,
      franquiciaNombre: user.franquicia?.nombre ?? null,
      auditorFranquiciaNombre: user.auditorFranquicia?.nombre ?? null,
    })),
    parametros: parametros
      .filter((parametro) => parametro.clave !== "ticket_limits_default")
      .map((parametro) => ({
      id: parametro.id,
      clave: parametro.clave,
      descripcion: parametro.descripcion ?? null,
      valor: JSON.stringify(parametro.valor, null, 2),
    })),
    totalLogs,
    latestLog: latestLog?.createdAt ? latestLog.createdAt.toISOString() : null,
  };

  return <AdminManager data={data} />;
}
