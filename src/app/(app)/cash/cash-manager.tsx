"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import {
  approveCashSessionAction,
  openCashSessionAction,
  requestCashCloseAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Tone = "positive" | "negative" | "warning" | "neutral";

const VALUE_TONE_CLASSES: Record<Tone, string> = {
  positive: "text-emerald-300",
  negative: "text-red-400",
  warning: "text-amber-300",
  neutral: "text-foreground",
};

const formatCurrency = (value: number) =>
  value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function summarizeWorkerDifference(diff: number | null): { label: string; tone: Tone; hint?: string } {
  if (diff === null) {
    return {
      label: "Pendiente de conciliaciÃ³n",
      tone: "warning",
      hint: "Declara el saldo final para solicitar el cierre.",
    };
  }
  if (diff === 0) {
    return {
      label: "Cuadre exacto",
      tone: "positive",
      hint: "No hay diferencias frente al sistema.",
    };
  }
  if (diff > 0) {
    return {
      label: `Debes entregar $${formatCurrency(diff)}`,
      tone: "negative",
      hint: "Entrega el excedente a central durante el cierre.",
    };
  }
  return {
    label: `Sistema te debe $${formatCurrency(Math.abs(diff))}`,
    tone: "warning",
    hint: "Coordina el ajuste con Admin antes de cerrar.",
  };
}

function summarizeAdminDifference(diff: number): { label: string; tone: Tone } {
  if (diff === 0) {
    return { label: "Cuadre exacto", tone: "neutral" };
  }
  if (diff > 0) {
    return { label: `Recibir $${formatCurrency(diff)}`, tone: "positive" };
  }
  return { label: `Entregar $${formatCurrency(Math.abs(diff))}`, tone: "warning" };
}

type SummaryCardProps = {
  label: string;
  value: ReactNode;
  tone?: Tone;
  hint?: string;
  className?: string;
};

function SummaryCard({ label, value, tone = "neutral", hint, className }: SummaryCardProps) {
  return (
    <div className={cn("rounded-lg border border-border/30 bg-background/60 p-4 text-sm", className)}>
      <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-lg font-semibold", VALUE_TONE_CLASSES[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
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
  saldoInicial: number;
  saldoDeclarado: number | null;
  saldoSistema: number;
  diferencia: number | null;
  franquiciaNombre: string;
  movimientos: CashMovement[];
};

type PendingSession = {
  id: string;
  trabajador: string;
  franquiciaNombre: string;
  saldoInicial: number;
  saldoDeclarado: number;
  saldoSistema: number;
  diferencia: number | null;
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

  const [openAmount, setOpenAmount] = useState("0");
  const [closeAmount, setCloseAmount] = useState(() => {
    if (!session) return "0";
    const base = session.saldoDeclarado ?? session.saldoSistema;
    return base.toString();
  });
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedFranquiciaId, setSelectedFranquiciaId] = useState(
    defaultFranquiciaId ?? (franquicias[0]?.id ?? ""),
  );

  useEffect(() => {
    if (session) {
      const base = session.saldoDeclarado ?? session.saldoSistema;
      setCloseAmount(base.toString());
    }
  }, [session?.id, session?.saldoDeclarado, session?.saldoSistema]);

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
    const saldoInicial = Number.parseInt(openAmount, 10) || 0;
    startTransition(async () => {
      if (canChooseFranquicia && !selectedFranquiciaId) {
        setMessage({ content: "Selecciona la franquicia para abrir la caja.", variant: "error" });
        return;
      }

      const payload: { saldoInicial: number; franquiciaId?: string } = { saldoInicial };
      if (canChooseFranquicia && selectedFranquiciaId) {
        payload.franquiciaId = selectedFranquiciaId;
      }

      const result = await openCashSessionAction(payload);
      resetAndRefresh({ content: result.message, variant: result.ok ? "success" : "error" });
    });
  };

  const handleRequestClose = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!session || session.estado !== "ABIERTA") return;
    const saldoDeclarado = Number.parseInt(closeAmount, 10) || 0;
    startTransition(async () => {
      const result = await requestCashCloseAction({ saldoDeclarado });
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

  const renderMovements = (movimientos: CashMovement[]) => (
    <div className="mt-4 space-y-2">
      {movimientos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
      ) : (
        movimientos
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
              <span className={cn(movimiento.tipo === "EGRESO" ? "text-rose-300" : "text-emerald-300")}>
                {movimiento.tipo === "EGRESO" ? "-" : "+"}
                {movimiento.monto.toLocaleString()} USD
              </span>
            </div>
          ))
      )}
    </div>
  );

  const sessionDifference = session
    ? session.diferencia ?? (session.saldoDeclarado !== null ? session.saldoDeclarado - session.saldoSistema : null)
    : null;
  const workerSummary = summarizeWorkerDifference(sessionDifference);

  const pendingSummaries = pendingSessions.map((item) => {
    const difference = item.diferencia ?? item.saldoDeclarado - item.saldoSistema;
    return {
      ...item,
      difference,
      summary: summarizeAdminDifference(difference),
    };
  });

  const totalAdminDiff = pendingSummaries.reduce((acc, item) => acc + item.difference, 0);
  const totalSummary = summarizeAdminDifference(totalAdminDiff);

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
          <CardDescription>Gestiona la apertura y cierre de tu turno.</CardDescription>
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
                <Label htmlFor="saldo-inicial">Saldo inicial (USD)</Label>
                <Input
                  id="saldo-inicial"
                  type="number"
                  min={0}
                  step={1}
                  value={openAmount}
                  onChange={(event) => setOpenAmount(event.target.value)}
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
                <SummaryCard label="Estado" value={session.estado} />
                <SummaryCard label="Franquicia" value={session.franquiciaNombre || "Sin asignar"} />
                <SummaryCard label="Capital inicial" value={`$${formatCurrency(session.saldoInicial)}`} />
                <SummaryCard
                  label="Saldo sistema"
                  value={`$${formatCurrency(session.saldoSistema)}`}
                  hint="Resultado segun movimientos registrados."
                />
                <SummaryCard
                  label="Saldo declarado"
                  value={
                    session.saldoDeclarado !== null
                      ? `$${formatCurrency(session.saldoDeclarado)}`
                      : "Pendiente"
                  }
                  tone={session.saldoDeclarado === null ? "warning" : "neutral"}
                  hint={
                    session.saldoDeclarado === null
                      ? "Ingresa el monto contado para solicitar el cierre."
                      : undefined
                  }
                />
                <SummaryCard
                  label="Resultado"
                  value={workerSummary.label}
                  tone={workerSummary.tone}
                  hint={workerSummary.hint}
                />
              </div>

              {session.estado === "ABIERTA" ? (
                <form className="grid gap-4 md:max-w-sm" onSubmit={handleRequestClose}>
                  <div className="space-y-2">
                    <Label htmlFor="saldo-declarado">Saldo declarado (USD)</Label>
                    <Input
                      id="saldo-declarado"
                      type="number"
                      min={0}
                      step={1}
                      value={closeAmount}
                      onChange={(event) => setCloseAmount(event.target.value)}
                      required
                      disabled={isPending}
                    />
                  </div>
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Enviando..." : "Solicitar cierre"}
                  </Button>
                </form>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Cierre solicitado. Espera la aprobaciÃ³n del Administrador.
                </p>
              )}

              <div>
                <h3 className="text-sm font-semibold text-foreground">Movimientos recientes</h3>
                {renderMovements(session.movimientos)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {canApprove ? (
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Solicitudes pendientes</CardTitle>
            <CardDescription>Aprueba los cierres de caja enviados por los vendedores.</CardDescription>
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
                      <p className="text-xs text-muted-foreground">
                        {item.franquiciaNombre || "Sin asignar"}
                      </p>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                      <SummaryCard label="Capital inicial" value={`$${formatCurrency(item.saldoInicial)}`} />
                      <SummaryCard label="Saldo sistema" value={`$${formatCurrency(item.saldoSistema)}`} />
                      <SummaryCard label="Saldo declarado" value={`$${formatCurrency(item.saldoDeclarado)}`} />
                      <SummaryCard
                        label="Resultado"
                        value={item.summary.label}
                        tone={item.summary.tone}
                        hint="Conciliar este monto antes de aprobar."
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






