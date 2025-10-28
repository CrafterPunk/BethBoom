import {
  CajaSesionEstado,
  TicketEstado,
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

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const [salesToday, paymentsToday] = await Promise.all([
    prisma.ticket.aggregate({
      _sum: { monto: true },
      _count: { _all: true },
      where: {
        trabajadorId: session.userId,
        estado: { not: TicketEstado.ANULADO },
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
    prisma.pago.aggregate({
      _sum: { monto: true },
      _count: { _all: true },
      where: {
        pagadorId: session.userId,
        pagadoAt: { gte: startOfDay, lte: endOfDay },
      },
    }),
  ]);

  const ventasTodayTotal = Number(salesToday._sum.monto ?? 0);
  const ventasTodayCount = (salesToday._count?._all ?? 0) as number;
  const pagosTodayTotal = Number(paymentsToday._sum.monto ?? 0);
  const pagosTodayCount = (paymentsToday._count?._all ?? 0) as number;

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
        ventasTotal: ventasTodayTotal,
        ventasCount: ventasTodayCount,
        pagosTotal: pagosTodayTotal,
        pagosCount: pagosTodayCount,
        saldoDisponible: mySession.capitalPropio + ventasTodayTotal - pagosTodayTotal,
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
      ventasCount: item.ventasCount,
      pagosTotal: item.pagosTotal,
      pagosCount: item.pagosCount,
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






