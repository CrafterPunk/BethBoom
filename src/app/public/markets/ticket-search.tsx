"use client";

import { useState, useTransition } from "react";

import { searchTicketAction, type PublicTicketResult } from "./actions";
import { MARKET_TYPE_INFO } from "./market-info";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  string,
  {
    label: string;
    tone: string;
  }
> = {
  ACTIVO: { label: "Pendiente", tone: "text-amber-300" },
  PAGADO: { label: "Pagado", tone: "text-emerald-300" },
  VENCIDO: { label: "Vencido", tone: "text-red-400" },
  ANULADO: { label: "Anulado", tone: "text-muted-foreground" },
};

export function TicketSearch({ className }: { className?: string }) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<PublicTicketResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) {
      setError("Ingresa un código válido");
      setResult(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await searchTicketAction({ code: code.trim() });
      setResult(response);
      if (response.status === "not-found") {
        setError("No encontramos un ticket con ese código.");
      } else {
        setError(null);
      }
    });
  };

  const renderResult = () => {
    if (!result || result.status === "not-found") {
      return null;
    }

    const ticket = result.ticket;
    const statusMeta = STATUS_META[ticket.estado] ?? STATUS_META.ACTIVO;
    const typeInfo = MARKET_TYPE_INFO[ticket.mercado.tipo];

    return (
      <div className="mt-4 space-y-3 rounded-lg border border-border/40 bg-background/60 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-base font-semibold text-foreground">{ticket.codigo}</p>
            <p className="text-xs text-muted-foreground">
              Registrado el {new Date(ticket.createdAt).toLocaleString()}
            </p>
          </div>
          <span className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase", statusMeta.tone)}>
            {statusMeta.label}
          </span>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <p className="text-xs uppercase text-muted-foreground">Mercado</p>
            <p className="text-sm font-medium text-foreground">{ticket.mercado.nombre}</p>
            <p className="text-xs text-muted-foreground">
              {typeInfo.label} · {typeInfo.summary}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Opción</p>
            <p className="text-sm font-medium text-foreground">{ticket.opcionNombre}</p>
            {ticket.cuotaBase ? (
              <p className="text-xs text-muted-foreground">Cuota fijada: {ticket.cuotaBase.toFixed(2)}</p>
            ) : (
              <p className="text-xs text-muted-foreground">Modalidad pozo compartido</p>
            )}
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Monto apostado</p>
            <p className="text-sm font-semibold text-foreground">${formatCurrency(ticket.monto)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Estado del mercado</p>
            <p className="text-sm font-medium text-foreground">
              {ticket.mercado.estado === "SUSPENDIDO" ? "Suspendido" : ticket.mercado.estado === "CERRADO" ? "Cerrado" : "Abierto"}
            </p>
            {ticket.mercado.endsAt ? (
              <p className="text-xs text-muted-foreground">
                Cierra {formatDuration(Math.max(new Date(ticket.mercado.endsAt).getTime() - Date.now(), 0))}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Sin fecha definida</p>
            )}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-xs uppercase text-muted-foreground">Payout potencial</p>
            <p className="text-sm font-semibold text-foreground">
              {ticket.payoutPotencial !== null ? `$${formatCurrency(ticket.payoutPotencial)}` : "Se define al cierre"}
            </p>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <p className="text-xs uppercase text-muted-foreground">Payout entregado</p>
            <p className="text-sm font-semibold text-foreground">
              {ticket.payoutReal !== null ? `$${formatCurrency(ticket.payoutReal)}` : "Sin pago registrado"}
            </p>
            {ticket.pagadoAt ? (
              <p className="text-xs text-muted-foreground">Pagado el {new Date(ticket.pagadoAt).toLocaleString()}</p>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("border-border/60 bg-card/80", className)}>
      <CardHeader>
        <CardTitle>Busca tu ticket</CardTitle>
        <CardDescription>Ingresa el código impreso en tu ticket para revisar su estado.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="BB-20251022-1234"
            className="flex-1"
            autoComplete="off"
            maxLength={40}
            disabled={isPending}
          />
          <Button type="submit" disabled={isPending}>
            {isPending ? "Buscando..." : "Consultar"}
          </Button>
        </form>
        {error ? <p className="mt-3 text-sm text-amber-300">{error}</p> : null}
        {renderResult()}
      </CardContent>
    </Card>
  );
}
