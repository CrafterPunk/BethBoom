import {
  CajaLiquidacionTipo,
  CajaSesionEstado,
  MercadoEstado,
  MercadoTipo,
  TicketEstado,
  UserRole,
} from "@prisma/client";

import { requireSession } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { DashboardWidget, MetricsGrid, SimpleList } from "./widgets";
import type { MetricItem, ListItem } from "./widgets";

async function getPromotionThreshold() {
  const param = await prisma.parametroGlobal.findUnique({ where: { clave: "promocion_apuestas" } });
  const value =
    typeof param?.valor === "object" && param?.valor !== null ? (param.valor as { conteo?: number }).conteo : undefined;
  return value ?? 30;
}

const ROLE_SUBTITLE: Record<UserRole, string> = {
  [UserRole.ADMIN_GENERAL]: "Vista global del negocio.",
  [UserRole.TRABAJADOR]: "Resumen operativo para tu turno.",
  [UserRole.AUDITOR_GENERAL]: "Monitoreo de operaciones y alertas.",
  [UserRole.AUDITOR_FRANQUICIA]: "Actividad de la franquicia asignada.",
};

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function computeLiquidacion(capitalPropio: number, ventasTotal: number, pagosTotal: number) {
  const ventasMenosPagos = ventasTotal - pagosTotal;

  if (ventasMenosPagos > capitalPropio) {
    return { tipo: CajaLiquidacionTipo.WORKER_OWES, monto: ventasMenosPagos - capitalPropio } as const;
  }

  if (pagosTotal > capitalPropio + ventasTotal) {
    return { tipo: CajaLiquidacionTipo.HQ_OWES, monto: pagosTotal - (capitalPropio + ventasTotal) } as const;
  }

  return { tipo: CajaLiquidacionTipo.BALANCEADO, monto: 0 } as const;
}

function describeWorkerDifference(capitalPropio: number, ventasTotal: number, pagosTotal: number) {

  const liquidacion = computeLiquidacion(capitalPropio, ventasTotal, pagosTotal);



  if (liquidacion.tipo === CajaLiquidacionTipo.WORKER_OWES) {

    return {

      text: `Debes entregar $${formatCurrency(liquidacion.monto)}`,

      toneClass: "text-red-400",

      hint: "Entrega el excedente a central al cerrar.",

    };

  }



  if (liquidacion.tipo === CajaLiquidacionTipo.HQ_OWES) {

    return {

      text: `Sistema te debe $${formatCurrency(liquidacion.monto)}`,

      toneClass: "text-amber-300",

      hint: "Registra el ajuste con Admin antes de finalizar.",

    };

  }



  const saldoDisponible = capitalPropio + ventasTotal - pagosTotal;

  return {

    text: "Balance controlado",

    toneClass: "text-emerald-300",

    hint: `Saldo disponible $${formatCurrency(saldoDisponible)}`

  };

}



function describeAdminDifference(diff: number) {
  if (diff === 0) {
    return { label: "Cuadre exacto", tone: undefined } as const;
  }
  if (diff > 0) {
    return { label: `Recibir $${formatCurrency(diff)}`, tone: "positive" as const };
  }
  return { label: `Entregar $${formatCurrency(Math.abs(diff))}`, tone: "warning" as const };
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
    openSessionsRaw,
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

  const pendingWinnersCount = pendingTicketCandidates.filter(
    (ticket) => ticket.mercado.ganadoraId === ticket.opcionId,
  ).length;

  const normalizedSessions = openSessionsRaw.map((item) => {
    const saldoDisponible = item.capitalPropio + item.ventasTotal - item.pagosTotal;
    const liquidacion = computeLiquidacion(item.capitalPropio, item.ventasTotal, item.pagosTotal);
    return {
      id: item.id,
      trabajador: item.trabajador.displayName,
      trabajadorId: item.trabajadorId,
      franquicia: item.franquicia?.nombre ?? "",
      codigo: item.franquicia?.codigo ?? null,
      capitalPropio: item.capitalPropio,
      ventasTotal: item.ventasTotal,
      pagosTotal: item.pagosTotal,
      saldoDisponible,
      liquidacionTipo: item.liquidacionTipo ?? liquidacion.tipo,
      liquidacionMonto: item.liquidacionMonto ?? liquidacion.monto,
    };
  });

  const openCashCount = normalizedSessions.length;
  const myOpenSession = normalizedSessions.find((item) => item.trabajadorId === session.userId) ?? null;

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
    .sort((a, b) => b.progress - a.progress);

  const negativeSessionItems: ListItem[] = normalizedSessions
    .filter((item) => item.saldoDisponible < 0)
    .map((item) => ({
      id: item.id,
      title: item.trabajador,
      subtitle: item.codigo ? `${item.franquicia} (${item.codigo})` : item.franquicia,
      meta: `-$${formatCurrency(Math.abs(item.saldoDisponible))} USD`,
      tone: "negative" as const,
    }));

  const oddsAlertItems: ListItem[] = oddsAlerts.map((alert) => ({
    id: alert.id,
    title: alert.nombre,
    subtitle: `${formatCurrency(alert.monto)} / ${formatCurrency(alert.umbral)} USD acumulado`,
    meta: `${Math.round(alert.progress * 100)}%`,
    tone: alert.progress >= 1 ? "warning" : undefined,
  }));

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

  const upcomingPromotionItems: ListItem[] = upcomingPromotions.map((apostador) => ({
    id: apostador.id,
    title: apostador.alias,
    subtitle: `${apostador.rangoNombre || "Sin rango"} Â· ${apostador.apuestasAcumuladas.toLocaleString()} / ${promotionEvery.toLocaleString()} apuestas`,
    meta: `Faltan ${apostador.remaining.toLocaleString()}`,
    tone: "warning" as const,
  }));

  const ownerMetrics: MetricItem[] = [
    { label: "Handle acumulado", value: `$${formatCurrency(handleTotal)}` },
    { label: "Payouts", value: `$${formatCurrency(payoutTotal)}` },
    { label: "Hold", value: formatPercent(holdPct) },
    { label: "Tickets totales", value: totalTickets.toLocaleString() },
    { label: "Tickets hoy", value: ticketsToday.toLocaleString() },
    { label: "Pagos hoy", value: paymentsToday.toLocaleString() },
    { label: "Mercados abiertos", value: activeMarkets.length.toLocaleString() },
    {
      label: "Ganadores pendientes",
      value: pendingWinnersCount.toLocaleString(),
      tone: pendingWinnersCount > 0 ? "warning" : undefined,
    },
    { label: "Cajas abiertas", value: openCashCount.toLocaleString() },
  ];

  const workerMetrics: MetricItem[] = [
    { label: "Ventas del dia", value: `$${formatCurrency(myOpenSession?.ventasTotal ?? 0)}` },
    { label: "Pagos del dia", value: `$${formatCurrency(myOpenSession?.pagosTotal ?? 0)}` },
    {
      label: "Saldo disponible",
      value: `$${formatCurrency(myOpenSession ? myOpenSession.capitalPropio + myOpenSession.ventasTotal - myOpenSession.pagosTotal : 0)}`,
      tone:
        !myOpenSession
          ? undefined
          : myOpenSession.capitalPropio + myOpenSession.ventasTotal - myOpenSession.pagosTotal < 0
            ? "warning"
            : "positive",
    },
  ];

  const auditorMetrics: MetricItem[] = [
    { label: "Hold", value: formatPercent(holdPct) },
    {
      label: "Ganadores pendientes",
      value: pendingWinnersCount.toLocaleString(),
      tone: pendingWinnersCount > 0 ? "warning" : undefined,
    },
    { label: "Cajas abiertas", value: openCashCount.toLocaleString() },
    { label: "Mercados abiertos", value: activeMarkets.length.toLocaleString() },
  ];

  const workerDifference = myOpenSession    ? describeWorkerDifference(myOpenSession.capitalPropio, myOpenSession.ventasTotal, myOpenSession.pagosTotal)
    : null;

  const layout = (() => {
    if (session.role === UserRole.TRABAJADOR) {
      return (
        <>
          <DashboardWidget title="Tu resumen de hoy" description="Ventas y pagos registrados">
            <MetricsGrid metrics={workerMetrics} columnsClassName="sm:grid-cols-3" />
          </DashboardWidget>

          <DashboardWidget title="Tu caja" description="Capital propio, ventas y pagos del turno">
            {myOpenSession ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm">
                  <p className="text-muted-foreground">Capital propio</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">${formatCurrency(myOpenSession.capitalPropio)}</p>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm">
                  <p className="text-muted-foreground">Ventas del d�a</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">${formatCurrency(myOpenSession.ventasTotal)}</p>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm">
                  <p className="text-muted-foreground">Pagos del d�a</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">${formatCurrency(myOpenSession.pagosTotal)}</p>
                </div>
                <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm">
                  <p className="text-muted-foreground">Saldo disponible</p>
                  <p className="mt-2 text-xl font-semibold text-foreground">${formatCurrency(myOpenSession.saldoDisponible)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Capital propio + ventas - pagos registrados.</p>
                </div>
                {workerDifference ? (
                  <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm">
                    <p className="text-muted-foreground">Liquidaci�n estimada</p>
                    <p className={`mt-2 text-xl font-semibold ${workerDifference.toneClass}`}>{workerDifference.text}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{workerDifference.hint}</p>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No tienes una caja abierta. Abre una nueva caja desde la secci�n Caja para iniciar tu turno.
              </p>
            )}
          </DashboardWidget>

          <DashboardWidget title="Alertas de mercados" description="Mercados cercanos a recÃ¡lculo de cuotas">
            <SimpleList items={oddsAlertItems.slice(0, 4)} emptyMessage="Sin alertas por ahora." />
          </DashboardWidget>
        </>
      );
    }

    if (session.role === UserRole.AUDITOR_GENERAL || session.role === UserRole.AUDITOR_FRANQUICIA) {
      return (
        <>
          <DashboardWidget title="Indicadores clave" description="KPIs de control y seguimiento">
            <MetricsGrid metrics={auditorMetrics} columnsClassName="sm:grid-cols-2 lg:grid-cols-4" />
          </DashboardWidget>

          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardWidget title="Alertas ODDS" description="Mercados con acumulado cercano al umbral">
              <SimpleList items={oddsAlertItems} emptyMessage="Sin alertas por ahora." />
            </DashboardWidget>
            <DashboardWidget title="Cajas en seguimiento" description="Sesiones abiertas con saldo negativo">
              <SimpleList items={negativeSessionItems} emptyMessage="No hay cajas en negativo." />
            </DashboardWidget>
          </div>

          <DashboardWidget title="PrÃ³ximos ascensos" description="Apostadores prÃ³ximos al cambio de rango">
            <SimpleList items={upcomingPromotionItems} emptyMessage="No hay apostadores cercanos al ascenso." />
          </DashboardWidget>
        </>
      );
    }

    return (
      <>
        <DashboardWidget title="Indicadores generales" description="Estado actual de ventas, pagos y actividad">
          <MetricsGrid metrics={ownerMetrics} />
        </DashboardWidget>

        <div className="grid gap-6 lg:grid-cols-2">
          <DashboardWidget title="Alertas ODDS" description="Mercados con acumulado cercano al umbral de recÃ¡lculo">
            <SimpleList items={oddsAlertItems} emptyMessage="Sin alertas por ahora." />
          </DashboardWidget>
          <DashboardWidget title="Cajas en seguimiento" description="Sesiones abiertas con saldo negativo">
            <SimpleList items={negativeSessionItems} emptyMessage="No hay cajas en negativo." />
          </DashboardWidget>
        </div>

        <DashboardWidget title="PrÃ³ximos ascensos" description="Apostadores cerca del lÃ­mite de promociÃ³n">
          <SimpleList items={upcomingPromotionItems} emptyMessage="No hay apostadores cercanos al ascenso." />
        </DashboardWidget>
      </>
    );
  })();

  return (
    <section className="space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Bienvenido, {session.displayName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{ROLE_SUBTITLE[session.role]}</p>
      </div>

      {layout}
    </section>
  );
}


