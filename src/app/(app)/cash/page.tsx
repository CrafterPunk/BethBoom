import {
  CajaSesionEstado,
  UserRole,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

import { CashManager } from "./cash-manager";

export default async function CashPage() {
  const session = await requireSession();
  const isAdmin = session.role === UserRole.ADMIN_GENERAL;

  const mySession = await prisma.cajaSesion.findFirst({
    where: {
      trabajadorId: session.userId,
      estado: { in: [CajaSesionEstado.ABIERTA, CajaSesionEstado.SOLICITADA] },
    },
    include: {
      franquicia: true,
      movimientos: {
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingSessions = isAdmin
    ? await prisma.cajaSesion.findMany({
        where: { estado: CajaSesionEstado.SOLICITADA },
        include: {
          franquicia: true,
          trabajador: true,
          movimientos: {
            select: {
              tipo: true,
              monto: true,
            },
          },
        },
        orderBy: { solicitadoAt: "asc" },
      })
    : [];

  const franquicias = isAdmin
    ? await prisma.franquicia.findMany({
        where: { activa: true },
        select: {
          id: true,
          nombre: true,
        },
        orderBy: { nombre: "asc" },
      })
    : session.franquiciaId
        ? await prisma.franquicia.findMany({
            where: { id: session.franquiciaId },
            select: {
              id: true,
              nombre: true,
            },
          })
        : [];

  const franquiciaOptions = franquicias.map((item) => ({ id: item.id, nombre: item.nombre }));
  const defaultFranquiciaId =
    mySession?.franquicia?.id ?? session.franquiciaId ?? (franquiciaOptions[0]?.id ?? null);

  const sessionDto = mySession
    ? {
        id: mySession.id,
        estado: mySession.estado,
        capitalPropio: mySession.capitalPropio,
        ventasTotal: mySession.ventasTotal,
        pagosTotal: mySession.pagosTotal,
        saldoDisponible: mySession.capitalPropio + mySession.ventasTotal - mySession.pagosTotal,
        liquidacionTipo: mySession.liquidacionTipo ?? null,
        liquidacionMonto: mySession.liquidacionMonto ?? 0,
        reporteCierre:
          mySession.reporteCierre && typeof mySession.reporteCierre === "object" && !Array.isArray(mySession.reporteCierre)
            ? (mySession.reporteCierre as Record<string, unknown>)
            : null,
        franquiciaNombre: mySession.franquicia?.nombre ?? "",
        movimientos: mySession.movimientos.slice(-50).map((movimiento) => ({
          id: movimiento.id,
          tipo: movimiento.tipo,
          monto: movimiento.monto,
          notas: movimiento.notas,
          createdAt: movimiento.createdAt.toISOString(),
        })),
      }
    : null;

  const pendingDtos = pendingSessions.map((item) => {
    const saldoDisponible = item.capitalPropio + item.ventasTotal - item.pagosTotal;
    return {
      id: item.id,
      trabajador: item.trabajador.displayName,
      franquiciaNombre: item.franquicia?.nombre ?? "",
      capitalPropio: item.capitalPropio,
      ventasTotal: item.ventasTotal,
      pagosTotal: item.pagosTotal,
      saldoDisponible,
      liquidacionTipo: item.liquidacionTipo ?? null,
      liquidacionMonto: item.liquidacionMonto ?? 0,
      reporteCierre:
        item.reporteCierre && typeof item.reporteCierre === "object" && !Array.isArray(item.reporteCierre)
          ? (item.reporteCierre as Record<string, unknown>)
          : null,
    };
  });

  return (
    <CashManager
      data={{
        session: sessionDto,
        pending: pendingDtos,
        canOpen: session.role === UserRole.ADMIN_GENERAL || session.role === UserRole.TRABAJADOR,
        canApprove: isAdmin,
        canChooseFranquicia: isAdmin,
        franquicias: franquiciaOptions,
        defaultFranquiciaId,
      }}
    />
  );
}


