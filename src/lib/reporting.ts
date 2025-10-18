import {
  Prisma,
  TicketEstado,
} from "@prisma/client";

import prisma from "@/lib/prisma";

export type DateRange = {
  from: Date;
  to: Date;
};

export type FranchiseReportRow = {
  franquiciaId: string;
  nombre: string;
  codigo: string | null;
  handle: number;
  payout: number;
  tickets: number;
  hold: number;
};

export type WorkerReportRow = {
  userId: string;
  nombre: string;
  handle: number;
  payout: number;
  tickets: number;
  hold: number;
};

export type BettorReportRow = {
  apostadorId: string;
  alias: string;
  handle: number;
  payout: number;
  tickets: number;
};

export type ReportData = {
  franchises: FranchiseReportRow[];
  workers: WorkerReportRow[];
  bettors: BettorReportRow[];
};

export async function fetchReportData(range: DateRange): Promise<ReportData> {
  const ticketWhere: Prisma.TicketWhereInput = {
    createdAt: {
      gte: range.from,
      lte: range.to,
    },
    estado: { not: TicketEstado.ANULADO },
  };

  const pagoWhere: Prisma.PagoWhereInput = {
    createdAt: {
      gte: range.from,
      lte: range.to,
    },
  };

  const [
    ticketsByFranquicia,
    pagosByFranquicia,
    ticketsByTrabajador,
    pagosByTrabajador,
    ticketsByApostador,
    pagosPorApostadorRaw,
    franquicias,
    usuarios,
  ] = await Promise.all([
    prisma.ticket.groupBy({
      by: ["franquiciaId"],
      where: ticketWhere,
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.pago.groupBy({
      by: ["franquiciaId"],
      where: pagoWhere,
      _sum: { monto: true },
    }),
    prisma.ticket.groupBy({
      by: ["trabajadorId"],
      where: ticketWhere,
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.pago.groupBy({
      by: ["pagadorId"],
      where: pagoWhere,
      _sum: { monto: true },
    }),
    prisma.ticket.groupBy({
      by: ["apostadorId"],
      where: ticketWhere,
      _sum: { monto: true },
      _count: { _all: true },
      orderBy: { _sum: { monto: "desc" } },
      take: 50,
    }),
    prisma.pago.findMany({
      where: pagoWhere,
      select: {
        monto: true,
        ticket: {
          select: { apostadorId: true },
        },
      },
    }),
    prisma.franquicia.findMany({
      select: { id: true, nombre: true, codigo: true },
    }),
    prisma.user.findMany({
      select: { id: true, displayName: true },
    }),
  ]);

  const franquiciaMap = new Map(franquicias.map((item) => [item.id, { nombre: item.nombre, codigo: item.codigo ?? null }]));
  const usuarioMap = new Map(usuarios.map((user) => [user.id, user.displayName]));

  const pagoFranquiciaMap = new Map(pagosByFranquicia.map((row) => [row.franquiciaId, Number(row._sum.monto ?? 0)]));
  const pagoTrabajadorMap = new Map(pagosByTrabajador.map((row) => [row.pagadorId, Number(row._sum.monto ?? 0)]));

  const apuestasIds = Array.from(new Set(ticketsByApostador.map((row) => row.apostadorId)));
  const apostadores = apuestasIds.length
    ? await prisma.apostador.findMany({
        where: { id: { in: apuestasIds } },
        select: { id: true, alias: true },
      })
    : [];
  const apostadorMap = new Map(apostadores.map((item) => [item.id, item.alias]));

  const pagoApostadorMap = new Map<string, number>();
  pagosPorApostadorRaw.forEach((record) => {
    const apostadorId = record.ticket?.apostadorId;
    if (!apostadorId) return;
    const current = pagoApostadorMap.get(apostadorId) ?? 0;
    pagoApostadorMap.set(apostadorId, current + record.monto);
  });

  const franchises: FranchiseReportRow[] = ticketsByFranquicia
    .map((row) => {
      const handle = Number(row._sum.monto ?? 0);
      const payout = pagoFranquiciaMap.get(row.franquiciaId) ?? 0;
      const info = franquiciaMap.get(row.franquiciaId);
      const hold = handle > 0 ? ((handle - payout) / handle) * 100 : 0;
      return {
        franquiciaId: row.franquiciaId,
        nombre: info?.nombre ?? "Sin franquicia",
        codigo: info?.codigo ?? null,
        handle,
        payout,
        tickets: row._count._all ?? 0,
        hold,
      };
    })
    .sort((a, b) => b.handle - a.handle);

  const workers: WorkerReportRow[] = ticketsByTrabajador
    .map((row) => {
      const handle = Number(row._sum.monto ?? 0);
      const payout = pagoTrabajadorMap.get(row.trabajadorId) ?? 0;
      const nombre = usuarioMap.get(row.trabajadorId) ?? "Sin nombre";
      const hold = handle > 0 ? ((handle - payout) / handle) * 100 : 0;
      return {
        userId: row.trabajadorId,
        nombre,
        handle,
        payout,
        tickets: row._count._all ?? 0,
        hold,
      };
    })
    .sort((a, b) => b.handle - a.handle);

  const bettors: BettorReportRow[] = ticketsByApostador
    .map((row) => {
      const handle = Number(row._sum.monto ?? 0);
      const payout = pagoApostadorMap.get(row.apostadorId) ?? 0;
      const alias = apostadorMap.get(row.apostadorId) ?? "Sin alias";
      return {
        apostadorId: row.apostadorId,
        alias,
        handle,
        payout,
        tickets: row._count._all ?? 0,
      };
    })
    .sort((a, b) => b.handle - a.handle)
    .slice(0, 20);

  return {
    franchises,
    workers,
    bettors,
  };
}
