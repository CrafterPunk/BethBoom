"use client";

import type { ReactNode } from "react";
import type { CajaLiquidacionTipo } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  approveCashSessionAction,
  openCashSessionAction,
  requestCashCloseAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { formatCurrency, formatDeltaMessage, parseDigitsAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

type Tone = "positive" | "negative" | "warning" | "neutral";

const VALUE_TONE_CLASSES: Record<Tone, string> = {
  positive: "text-emerald-300",
  negative: "text-red-400",
  warning: "text-amber-300",
  neutral: "text-foreground",
};

function computeLiquidacion(
  capitalPropio: number,
  ventasTotal: number,
  pagosTotal: number,
): { tipo: CajaLiquidacionTipo; monto: number } {
  const neto = ventasTotal - pagosTotal;

  if (neto > 0) {
    return {
      tipo: "WORKER_OWES",
      monto: neto,
    };
  }

  if (neto < 0) {
    return {
      tipo: "HQ_OWES",
      monto: Math.abs(neto),
    };
  }

  return { tipo: "BALANCEADO", monto: 0 };
}

function summarizeLiquidacion(
  tipo: CajaLiquidacionTipo,
  monto: number,
): { label: string; tone: Tone; hint?: string; delta: number } {
  const delta = tipo === "WORKER_OWES" ? monto : tipo === "HQ_OWES" ? -monto : 0;
  const message = formatDeltaMessage(delta);

  if (delta === 0) {
    return {
      label: message,
      tone: "neutral",
      hint: "No hay transferencias pendientes.",
      delta,
    };
  }

  if (tipo === "WORKER_OWES") {
    return {
      label: message,
      tone: "negative",
      hint: "Transfiere ese monto a la sede para cerrar la jornada.",
      delta,
    };
  }

  return {
    label: message,
    tone: "warning",
    hint: "Solicita la reposicion desde central antes de continuar.",
    delta,
  };
}

type SummaryCardProps = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: ReactNode;
  className?: string;
};

function SummaryCard({ label, value, tone = "neutral", hint, className }: SummaryCardProps) {
  return (
    <div className={cn("rounded-lg border border-border/30 bg-background/60 p-4 text-sm", className)}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-lg font-semibold", VALUE_TONE_CLASSES[tone])}>{value}</p>
      {hint ? (typeof hint === "string" ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : (
        <div className="mt-2">{hint}</div>
      )) : null}
    </div>
  );
}

type CashMovement = {
  id: string;
  tipo: string;
  monto: number;
  notas: string | null;
  createdAt: string;
};

type CashSessionSummary = {
  id: string;
  estado: "ABIERTA" | "SOLICITADA" | "CERRADA";
  capitalPropio: number;
  ventasTotal: number;
  ventasCount: number;
  pagosTotal: number;
  pagosCount: number;
  saldoDisponible: number;
  liquidacionTipo: CajaLiquidacionTipo | null;
  liquidacionMonto: number;
  reporteCierre: Record<string, unknown> | null;
  franquiciaNombre: string;
  movimientos: CashMovement[];
};

type PendingSession = {
  id: string;
  trabajador: string;
  franquiciaNombre: string;
  capitalPropio: number;
  ventasTotal: number;
  ventasCount: number;
  pagosTotal: number;
  pagosCount: number;
  saldoDisponible: number;
  liquidacionTipo: CajaLiquidacionTipo | null;
  liquidacionMonto: number;
  reporteCierre: Record<string, unknown> | null;
};

type CashManagerProps = {
  data: {
    session: CashSessionSummary | null;
    pending: PendingSession[];
    canOpen: boolean;
    canApprove: boolean;
    canChooseFranquicia: boolean;
    franquicias: Array<{ id: string; nombre: string }>;
    defaultFranquiciaId: string | null;
  };
};

type MessageState = {
  content: string;
  variant: "success" | "error" | "info";
};

export function CashManager({ data }: CashManagerProps) {
  const {
    session,
    pending: pendingSessions,
    canOpen,
    canApprove,
    canChooseFranquicia,
    franquicias,
    defaultFranquiciaId,
  } = data;
  const router = useRouter();

  const [capitalDigits, setCapitalDigits] = useState(() => (session?.capitalPropio ?? 0).toString());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedFranquiciaId, setSelectedFranquiciaId] = useState(
    defaultFranquiciaId ?? (franquicias[0]?.id ?? ""),
  );

  useEffect(() => {
    if (session) {
      setCapitalDigits((session.capitalPropio ?? 0).toString());
    }
  }, [session]);

  useEffect(() => {
    if (defaultFranquiciaId) {
      setSelectedFranquiciaId(defaultFranquiciaId);
      return;
    }
    if (franquicias.length > 0) {
      setSelectedFranquiciaId((current) => current || franquicias[0].id);
    }
  }, [defaultFranquiciaId, franquicias]);

  const resetAndRefresh = (resultMessage: MessageState) => {
    setMessage(resultMessage);
    setPendingId(null);
    router.refresh();
  };

  const handleOpen = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canOpen) return;
    const capitalPropio = parseDigitsAmount(capitalDigits) ?? 0;
    startTransition(async () => {
      if (canChooseFranquicia && !selectedFranquiciaId) {
        setMessage({ content: "Selecciona la franquicia para abrir la caja.", variant: "error" });
        return;
      }

      const payload: { capitalPropio: number; franquiciaId?: string } = { capitalPropio };
      if (canChooseFranquicia && selectedFranquiciaId) {
        payload.franquiciaId = selectedFranquiciaId;
      }

      const result = await openCashSessionAction(payload);
      resetAndRefresh({ content: result.message, variant: result.ok ? "success" : "error" });
    });
  };

  const handleRequestClose = () => {
    startTransition(async () => {
      const result = await requestCashCloseAction({});
      resetAndRefresh({ content: result.message, variant: result.ok ? "success" : "error" });
    });
  };

  const handleApprove = (sessionId: string) => {
    setPendingId(sessionId);
    startTransition(async () => {
      const result = await approveCashSessionAction({ sessionId });
      resetAndRefresh({ content: result.message, variant: result.ok ? "success" : "error" });
    });
  };

  const pendingSummaries = pendingSessions.map((item) => {
    const tipo = item.liquidacionTipo ?? "BALANCEADO";
    const monto = item.liquidacionMonto ?? 0;
    const summary = summarizeLiquidacion(tipo, monto);

    return {
      ...item,
      liquidacionTipo: tipo,
      liquidacionMonto: monto,
      summary,
    };
  });

  const totalAdminNet = pendingSummaries.reduce((acc, item) => {
    if (item.liquidacionTipo === "WORKER_OWES") {
      return acc + item.liquidacionMonto;
    }
    if (item.liquidacionTipo === "HQ_OWES") {
      return acc - item.liquidacionMonto;
    }
    return acc;
  }, 0);

  const totalSummary = summarizeLiquidacion(
    totalAdminNet > 0 ? "WORKER_OWES" : totalAdminNet < 0 ? "HQ_OWES" : "BALANCEADO",
    Math.abs(totalAdminNet),
  );

  const liveLiquidacion = session
    ? computeLiquidacion(session.capitalPropio, session.ventasTotal, session.pagosTotal)
    : { tipo: "BALANCEADO" as CajaLiquidacionTipo, monto: 0 };

  const liquidacionSummary = summarizeLiquidacion(
    session?.estado === "SOLICITADA"
      ? (session.liquidacionTipo ?? "BALANCEADO")
      : liveLiquidacion.tipo,
    session?.estado === "SOLICITADA"
      ? session.liquidacionMonto ?? 0
      : liveLiquidacion.monto,
  );

  return (
    <div className="space-y-6">
      {message ? (
        <p
          className={cn(
            "text-sm",
            message.variant === "success"
              ? "text-emerald-400"
              : message.variant === "info"
                ? "text-amber-300"
                : "text-destructive",
          )}
        >
          {message.content}
        </p>
      ) : null}

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Mi caja</CardTitle>
          <CardDescription>Gestiona la apertura diaria y el cierre de tu turno.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!session ? (
            <form className="grid gap-4 md:max-w-sm" onSubmit={handleOpen}>
              {canChooseFranquicia ? (
                <div className="space-y-2">
                  <Label htmlFor="franquicia">Franquicia</Label>
                  <select
                    id="franquicia"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={selectedFranquiciaId}
                    onChange={(event) => setSelectedFranquiciaId(event.target.value)}
                    disabled={isPending}
                  >
                    <option value="">Selecciona una franquicia</option>
                    {franquicias.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="capital-propio">Capital propio (USD)</Label>
                <CurrencyInput
                  id="capital-propio"
                  value={capitalDigits}
                  onValueChange={setCapitalDigits}
                  placeholder="1,000"
                  required
                  disabled={!canOpen || isPending}
                />
              </div>
              <Button
                type="submit"
                disabled={
                  !canOpen ||
                  isPending ||
                  (canChooseFranquicia && franquicias.length > 0 && !selectedFranquiciaId)
                }
              >
                {isPending ? "Abriendo..." : "Abrir caja"}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <SummaryCard label="Capital propio" value={`$${formatCurrency(session.capitalPropio)}`} />
                <SummaryCard
                  label="Ventas del dia"
                  value={`$${formatCurrency(session.ventasTotal)}`}
                  hint={
                  <span className="inline-flex items-center rounded-full bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
                    {session.ventasCount} ticket{session.ventasCount === 1 ? "" : "s"}
                  </span>
                }
                />
                <SummaryCard
                  label="Pagos del dia"
                  value={`$${formatCurrency(session.pagosTotal)}`}
                  hint={
                  <span className="inline-flex items-center rounded-full bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
                    {session.pagosCount} pago{session.pagosCount === 1 ? "" : "s"}
                  </span>
                }
                />
                <SummaryCard
                  label="Saldo disponible"
                  value={`$${formatCurrency(session.saldoDisponible)}`}
                  hint="Capital propio + ventas - pagos registrados."
                />
                <SummaryCard
                  label="Liquidacion estimada"
                  value={liquidacionSummary.label}
                  tone={liquidacionSummary.tone}
                  hint={liquidacionSummary.hint}
                />
                <SummaryCard
                  label="Estado"
                  value={session.estado}
                  hint={
                    session.estado === "SOLICITADA"
                      ? "Espera la aprobacion para volver a abrir con cualquier capital disponible."
                      : undefined
                  }
                />
              </div>

              {session.estado === "ABIERTA" ? (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Cuando finalices el turno, solicita el cierre. El sistema calculará automáticamente cuánto debes
                    entregar o recibir.
                  </p>
                  <Button type="button" onClick={handleRequestClose} disabled={isPending}>
                    {isPending ? "Enviando..." : "Solicitar cierre"}
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-border/30 bg-background/60 p-4 text-sm text-muted-foreground">
                  <p>Solicitud enviada. Coordina la transferencia in-game y espera la aprobación del administrador.</p>
                  <p className="mt-2 text-xs">Una vez aprobada podrás abrir una caja nueva con el capital que tengas disponible.</p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground">Movimientos recientes</h3>
                <div className="mt-4 space-y-2">
                  {session.movimientos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
                  ) : (
                    session.movimientos
                      .slice()
                      .reverse()
                      .map((movimiento) => (
                        <div
                          key={movimiento.id}
                          className="flex items-center justify-between rounded border border-border/20 px-3 py-2 text-sm"
                        >
                          <span>
                            {movimiento.tipo} - {new Date(movimiento.createdAt).toLocaleString()}
                            {movimiento.notas ? ` - ${movimiento.notas}` : ""}
                          </span>
                          <span
                            className={cn(
                              movimiento.tipo === "EGRESO" ? "text-rose-300" : "text-emerald-300",
                            )}
                          >
                            {movimiento.tipo === "EGRESO" ? "-" : "+"}
                            {movimiento.monto.toLocaleString()} USD
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canApprove ? (
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Solicitudes pendientes</CardTitle>
            <CardDescription>Aprueba los cierres luego de conciliar los montos in-game.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin solicitudes en espera.</p>
            ) : (
              <>
                {pendingSummaries.map((item) => (
                  <div key={item.id} className="space-y-3 rounded border border-border/40 bg-background/40 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-foreground">{item.trabajador}</p>
                      <p className="text-xs text-muted-foreground">{item.franquiciaNombre || "Sin asignar"}</p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                      <SummaryCard label="Capital propio" value={`$${formatCurrency(item.capitalPropio)}`} />
                      <SummaryCard
                        label="Ventas"
                        value={`$${formatCurrency(item.ventasTotal)}`}
                        hint={
                        <span className="inline-flex items-center rounded-full bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
                          {item.ventasCount} ticket{item.ventasCount === 1 ? "" : "s"}
                        </span>
                      }
                      />
                      <SummaryCard
                        label="Pagos"
                        value={`$${formatCurrency(item.pagosTotal)}`}
                        hint={
                        <span className="inline-flex items-center rounded-full bg-muted/30 px-2 py-0.5 font-medium text-muted-foreground">
                          {item.pagosCount} pago{item.pagosCount === 1 ? "" : "s"}
                        </span>
                      }
                      />
                      <SummaryCard label="Saldo disponible" value={`$${formatCurrency(item.saldoDisponible)}`} />
                      <SummaryCard
                        label="Liquidacion"
                        value={item.summary.label}
                        tone={item.summary.tone}
                        hint={item.summary.hint}
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApprove(item.id)}
                        disabled={isPending || pendingId === item.id}
                      >
                        {pendingId === item.id ? "Aprobando..." : "Aprobar"}
                      </Button>
                    </div>
                  </div>
                ))}

                <SummaryCard
                  label="Resumen general"
                  value={totalSummary.label}
                  tone={totalSummary.tone}
                  hint="Usa este monto para conciliar y reiniciar las cajas aprobadas."
                  className="border-border/40 bg-background/40"
                />
              </>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}














