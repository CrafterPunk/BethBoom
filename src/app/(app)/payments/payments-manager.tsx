"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { payTicketAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PaymentTicket = {
  id: string;
  codigo: string;
  alias: string;
  mercadoNombre: string;
  mercadoTipo: "POOL" | "ODDS";
  opcionNombre: string;
  monto: number;
  cuota: number | null;
  payout: number;
  createdAt: string;
};

type PaymentsManagerProps = {
  data: {
    tickets: PaymentTicket[];
    canPay: boolean;
    hasOpenSession: boolean;
  };
};

type MessageState = {
  content: string;
  variant: "success" | "error" | "info";
};

export function PaymentsManager({ data }: PaymentsManagerProps) {
  const { tickets, canPay, hasOpenSession } = data;
  const router = useRouter();

  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();

  const onPay = (ticketId: string) => {
    setPendingId(ticketId);
    setMessage(null);
    startTransition(async () => {
      const result = await payTicketAction({ ticketId });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setPendingId(null);
    });
  };

  return (
    <div className="space-y-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Pagos pendientes</CardTitle>
          <CardDescription>Confirma los tickets ganadores y registra el egreso correspondiente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasOpenSession ? (
            <div className="rounded-md border border-amber-400/40 bg-amber-950/30 p-3 text-sm text-amber-200">
              Debes abrir tu caja antes de realizar pagos.
            </div>
          ) : null}

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

          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tickets pendientes de pago.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="grid gap-3 rounded-lg border border-border/40 bg-background/40 p-4 md:grid-cols-[1fr_auto_auto] md:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{ticket.codigo}</p>
                    <p className="text-xs text-muted-foreground">
                      {ticket.mercadoNombre} ({ticket.mercadoTipo}) - {ticket.opcionNombre}
                    </p>
                    <p className="text-xs text-muted-foreground">Alias: {ticket.alias}</p>
                  </div>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div>Monto apostado: ${formatCurrency(ticket.monto)}</div>
                    <div>
                      {ticket.mercadoTipo === "ODDS"
                        ? `Cuota: ${ticket.cuota?.toFixed(2) ?? "--"}`
                        : "Modo POOL"}
                    </div>
                    <div className="font-semibold text-foreground">Payout a entregar: ${formatCurrency(ticket.payout)}</div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onPay(ticket.id)}
                      disabled={!canPay || !hasOpenSession || isPending || pendingId === ticket.id}
                    >
                      {pendingId === ticket.id ? "Pagando..." : "Pagar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}






