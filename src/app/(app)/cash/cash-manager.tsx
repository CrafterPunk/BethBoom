"use client";

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
  const [closeAmount, setCloseAmount] = useState(() => (session?.saldoSistema ?? 0).toString());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedFranquiciaId, setSelectedFranquiciaId] = useState(
    defaultFranquiciaId ?? (franquicias[0]?.id ?? ""),
  );

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
            <div key={movimiento.id} className="flex items-center justify-between rounded border border-border/20 px-3 py-2 text-sm">
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
              <div className="grid gap-2 text-sm text-muted-foreground">
                <div>
                  Estado: <span className="text-foreground font-medium">{session.estado}</span>
                </div>
                <div>Franquicia: {session.franquiciaNombre || "Sin asignar"}</div>
                <div>Saldo inicial: {session.saldoInicial.toLocaleString()} USD</div>
                <div>Saldo sistema: {session.saldoSistema.toLocaleString()} USD</div>
                {session.saldoDeclarado !== null ? (
                  <div>Saldo declarado: {session.saldoDeclarado.toLocaleString()} USD</div>
                ) : null}
                {session.diferencia !== null ? (
                  <div>Diferencia: {session.diferencia.toLocaleString()} USD</div>
                ) : null}
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
                  Cierre solicitado. Espera la aprobacion del Administrador.
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
          <CardContent className="space-y-3">
            {pendingSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin solicitudes en espera.</p>
            ) : (
              pendingSessions.map((item) => (
                <div key={item.id} className="grid gap-2 rounded border border-border/40 bg-background/40 px-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="text-sm text-muted-foreground">
                    <div className="text-foreground font-medium">{item.trabajador}</div>
                    <div>Franquicia: {item.franquiciaNombre || "Sin asignar"}</div>
                    <div>Saldo sistema: {item.saldoSistema.toLocaleString()} USD</div>
                    <div>Saldo declarado: {item.saldoDeclarado.toLocaleString()} USD</div>
                    <div>Diferencia: {(item.diferencia ?? 0).toLocaleString()} USD</div>
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
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
