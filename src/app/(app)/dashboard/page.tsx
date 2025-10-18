import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CajaMovimientoTipo,
  CajaSesionEstado,
  MercadoEstado,
  MercadoTipo,
  TicketEstado,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

function computeSaldoSistema(movimientos: Array<{ tipo: CajaMovimientoTipo; monto: number }>) {
  return movimientos.reduce((sum, movimiento) => {
    switch (movimiento.tipo) {
      case CajaMovimientoTipo.EGRESO:
        return sum - movimiento.monto;
      case CajaMovimientoTipo.AJUSTE:
        return sum + movimiento.monto;
      default:
        return sum + movimiento.monto;
    }
  }, 0);
}

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value = typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [
    ticketsAgg,
    pagosAgg,
    ticketsToday,
    paymentsToday,
    activeMarkets,
    pendingTicketCandidates,
    openSessions,
    promotionEvery,
    upcomingApostadores,
  ] = await Promise.all([
    prisma.ticket.aggregate({
      _sum: { monto: true },
      _count: { _all: true },
    }),
    prisma.pago.aggregate({ _sum: { monto: true } }),
    prisma.ticket.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.pago.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.mercado.findMany({
      where: { estado: MercadoEstado.ABIERTO },
      select: {
        id: true,
        nombre: true,
        tipo: true,
        montoDesdeRecalc: true,
        umbralRecalcMonto: true,
      },
    }),
    prisma.ticket.findMany({
      where: {
        estado: TicketEstado.ACTIVO,
        pagado: null,
        mercado: {
          estado: MercadoEstado.CERRADO,
          ganadoraId: { not: null },
        },
      },
      select: {
        opcionId: true,
        mercado: {
          select: {
            ganadoraId: true,
          },
        },
      },
    }),
    prisma.cajaSesion.findMany({
      where: { estado: CajaSesionEstado.ABIERTA },
      include: {
        trabajador: { select: { displayName: true } },
        franquicia: { select: { nombre: true, codigo: true } },
        movimientos: {
          select: { tipo: true, monto: true },
        },
      },
    }),
    getPromotionThreshold(),
    prisma.apostador.findMany({
      include: {
        rango: { select: { nombre: true } },
      },
      orderBy: [
        { apuestasAcumuladas: "desc" },
        { updatedAt: "desc" },
      ],
      take: 20,
    }),
  ]);

  const handleTotal = ticketsAgg._sum.monto ?? 0;
  const payoutTotal = pagosAgg._sum.monto ?? 0;
  const holdPct = handleTotal > 0 ? ((handleTotal - payoutTotal) / handleTotal) * 100 : 0;
  const totalTickets = ticketsAgg._count._all ?? 0;

  const pendingWinnersCount = pendingTicketCandidates.filter((ticket) => ticket.mercado.ganadoraId === ticket.opcionId).length;
  const openCashCount = openSessions.length;

  const oddsAlerts = activeMarkets
    .filter((market) => market.tipo === MercadoTipo.ODDS && market.umbralRecalcMonto > 0)
    .map((market) => {
      const progress = market.montoDesdeRecalc / market.umbralRecalcMonto;
      return {
        id: market.id,
        nombre: market.nombre,
        progress,
        monto: market.montoDesdeRecalc,
        umbral: market.umbralRecalcMonto,
      };
    })
    .filter((item) => item.progress >= 0.8)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 6);

  const negativeSessions = openSessions
    .map((session) => {
      const saldo = computeSaldoSistema(session.movimientos);
      return {
        id: session.id,
        saldo,
        trabajador: session.trabajador?.displayName ?? "Sin usuario",
        franquicia: session.franquicia?.nombre ?? "Sin franquicia",
        codigo: session.franquicia?.codigo ?? "",
      };
    })
    .filter((item) => item.saldo < 0)
    .sort((a, b) => a.saldo - b.saldo)
    .slice(0, 6);

  const upcomingPromotions = promotionEvery > 0
    ? upcomingApostadores
        .map((apostador) => {
          const remaining = promotionEvery - apostador.apuestasAcumuladas;
          return {
            id: apostador.id,
            alias: apostador.alias,
            rangoNombre: apostador.rango?.nombre ?? "",
            apuestasAcumuladas: apostador.apuestasAcumuladas,
            apuestasTotal: apostador.apuestasTotal,
            remaining,
          };
        })
        .filter((item) => item.remaining > 0 && item.remaining <= Math.max(5, Math.floor(promotionEvery / 4)))
        .slice(0, 6)
    : [];

  const metricCards = [
    { label: "Handle acumulado", value: `$${formatCurrency(handleTotal)}` },
    { label: "Payouts", value: `$${formatCurrency(payoutTotal)}` },
    { label: "Hold", value: formatPercent(holdPct) },
    { label: "Tickets totales", value: totalTickets.toLocaleString() },
    { label: "Tickets hoy", value: ticketsToday.toLocaleString() },
    { label: "Pagos hoy", value: paymentsToday.toLocaleString() },
    { label: "Mercados abiertos", value: activeMarkets.length.toLocaleString() },
    { label: "Ganadores pendientes", value: pendingWinnersCount.toLocaleString() },
    { label: "Cajas abiertas", value: openCashCount.toLocaleString() },
  ];

  return (
    <section className="space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bienvenido, {session.displayName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Resumen operativo y alertas del dia.</p>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Indicadores generales</CardTitle>
          <CardDescription>Estado actual de ventas, pagos y actividad.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metricCards.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-border/30 bg-background/60 p-4">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Alertas ODDS</CardTitle>
            <CardDescription>Mercados con acumulado cercano al umbral de recalc.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {oddsAlerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin alertas por ahora.</p>
            ) : (
              oddsAlerts.map((alert) => (
                <div key={alert.id} className="rounded border border-border/40 bg-background/60 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">{alert.nombre}</p>
                    <span className="text-xs text-muted-foreground">{Math.round(alert.progress * 100)}%</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {alert.monto.toLocaleString()} / {alert.umbral.toLocaleString()} USD acumulado
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Cajas en seguimiento</CardTitle>
            <CardDescription>Sesiones abiertas con saldo negativo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {negativeSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay cajas en negativo.</p>
            ) : (
              negativeSessions.map((item) => (
                <div key={item.id} className="rounded border border-border/40 bg-background/60 p-3 text-sm">
                  <p className="font-semibold text-foreground">{item.trabajador}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.franquicia}
                    {item.codigo ? ` (${item.codigo})` : ""}
                  </p>
                  <p className="mt-1 text-xs text-destructive">Saldo: -${Math.abs(item.saldo).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Proximos ascensos</CardTitle>
          <CardDescription>Apostadores cerca del limite de promocion.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {upcomingPromotions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay apostadores cercanos al ascenso.</p>
          ) : (
            upcomingPromotions.map((apostador) => (
              <div key={apostador.id} className="rounded border border-border/30 bg-background/60 p-4 text-sm">
                <p className="font-semibold text-foreground">{apostador.alias}</p>
                <p className="text-xs text-muted-foreground">{apostador.rangoNombre || "Sin rango"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Apuestas acumuladas: {apostador.apuestasAcumuladas.toLocaleString()} / {promotionEvery.toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">Total historial: {apostador.apuestasTotal.toLocaleString()}</p>
                <p className="mt-2 text-xs font-semibold text-amber-300">Faltan {apostador.remaining.toLocaleString()} apuestas</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </section>
  );
}


