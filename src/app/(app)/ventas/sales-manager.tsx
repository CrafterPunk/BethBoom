"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy } from "lucide-react";

import { createTicketAction, type TicketActionResponse } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDuration, parseDigitsAmount } from "@/lib/format";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { cn } from "@/lib/utils";

type SalesOption = {
  id: string;
  nombre: string;
  cuotaInicial: number | null;
  cuotaActual: number | null;
};

type SalesMarket = {
  id: string;
  nombre: string;
  tipo: "POOL" | "ODDS";
  descripcion: string;
  estado: "ABIERTO" | "SUSPENDIDO" | "CERRADO";
  endsAt: string | null;
  timeRemainingMs: number | null;
  opciones: SalesOption[];
};

type RankRuleLite = {
  id: string;
  nombre: string;
  orden: number;
  minMonto: number;
  maxMonto: number;
};

type SalesManagerProps = {
  data: {
    markets: SalesMarket[];
    rankRules: RankRuleLite[];
    promotionEvery: number;
    canSell: boolean;
  };
};

type ConfirmationState = {
  updates: Array<{ optionId: string; nombre: string; before: number; after: number }>;
  payload: {
    marketId: string;
    optionId: string;
    alias: string;
    monto: number;
  };
};

type MessageState = {
  content: string;
  variant: "success" | "error" | "info";
  copyValue?: string;
};

export function SalesManager({ data }: SalesManagerProps) {
  const { markets, rankRules, promotionEvery, canSell } = data;
  const toast = useToast();

  const [selectedMarketId, setSelectedMarketId] = useState(() => {
    const firstActive = markets.find((market) => market.timeRemainingMs === null || market.timeRemainingMs > 0);
    return firstActive?.id ?? markets[0]?.id ?? "";
  });
  const [selectedOptionId, setSelectedOptionId] = useState(() => {
    const firstActive = markets.find((market) => market.timeRemainingMs === null || market.timeRemainingMs > 0);
    return firstActive?.opciones[0]?.id ?? markets[0]?.opciones[0]?.id ?? "";
  });
  const [alias, setAlias] = useState("");
  const [amountDigits, setAmountDigits] = useState("1000");
  const [message, setMessage] = useState<MessageState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedMarket = useMemo(() => markets.find((item) => item.id === selectedMarketId) ?? null, [markets, selectedMarketId]);
  const selectedOption = useMemo(
    () => selectedMarket?.opciones.find((item) => item.id === selectedOptionId) ?? null,
    [selectedMarket, selectedOptionId],
  );
  const { remainingMs: selectedRemainingMs, isElapsed: isSelectedElapsed } = useCountdown(
    selectedMarket?.endsAt ?? null,
    selectedMarket?.timeRemainingMs ?? null,
  );
  const isMarketSuspended = selectedMarket?.estado === "SUSPENDIDO" || isSelectedElapsed;
  const selectedTimeLabel = formatDuration(selectedRemainingMs);

  const resetForm = () => {
    setAlias("");
    setAmountDigits("1000");
    const firstActive = markets.find((market) => market.timeRemainingMs === null || market.timeRemainingMs > 0) ?? markets[0];
    setSelectedMarketId(firstActive?.id ?? "");
    setSelectedOptionId(firstActive?.opciones[0]?.id ?? "");
  };

  const handleMarketChange = (value: string) => {
    setSelectedMarketId(value);
    const market = markets.find((item) => item.id === value);
    if (market?.opciones[0]) {
      setSelectedOptionId(market.opciones[0].id);
    } else {
      setSelectedOptionId("");
    }
  };

  const submit = (payload: {
    marketId: string;
    optionId: string;
    alias: string;
    monto: number;
    confirm?: boolean;
    expectedUpdates?: Array<{ optionId: string; before: number; after: number }>;
  }) => {
    startTransition(async () => {
      const response = await createTicketAction(payload);
      handleResponse(response, payload);
    });
  };
  const handleCopyCode = async (code: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
        toast.push({ message: "Código copiado", intent: "success" });
      } else {
        throw new Error("clipboard_unavailable");
      }
    } catch {
      toast.push({ message: "No se pudo copiar el código", intent: "error" });
    }
  };


  const handleResponse = (
    response: TicketActionResponse,
    basePayload: { marketId: string; optionId: string; alias: string; monto: number },
  ) => {
    if (response.status === "success") {
      setConfirmation(null);
      setMessage({
        content: `Ticket creado: ${response.data.codigo}`,
        variant: "success",
        copyValue: response.data.codigo,
      });
      resetForm();
      return;
    }

    if (response.status === "needs-confirmation") {
      setConfirmation({
        updates: response.updates,
        payload: basePayload,
      });
      setMessage({ content: response.message, variant: "info" });
      return;
    }

    setMessage({ content: response.message, variant: "error" });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    if (!selectedMarket || !selectedOption) {
      setMessage({ content: "Selecciona un mercado y una opcion", variant: "error" });
      return;
    }

    if (isMarketSuspended) {
      setMessage({ content: "Este mercado ya no admite nuevas apuestas.", variant: "error" });
      return;
    }

    const montoValue = parseDigitsAmount(amountDigits);
    if (!montoValue || montoValue <= 0) {
      setMessage({ content: "Monto invalido", variant: "error" });
      return;
    }

    const payload = {
      marketId: selectedMarket.id,
      optionId: selectedOption.id,
      alias,
      monto: montoValue,
    };

    submit(payload);
  };

  const onConfirm = () => {
    if (!confirmation) return;
    const { payload, updates } = confirmation;
    submit({ ...payload, confirm: true, expectedUpdates: updates.map(({ optionId, before, after }) => ({ optionId, before, after })) });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Ventas</h1>
          <p className="text-sm text-muted-foreground">Registra tickets y controla los limites por rango.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Registrar ticket</CardTitle>
            <CardDescription>Completa los campos para confirmar la venta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="market">Mercado</Label>
                <select
                  id="market"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedMarketId}
                  onChange={(event) => handleMarketChange(event.target.value)}
                  disabled={!canSell || pending || isMarketSuspended}
                >
                  {markets.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.nombre} ({market.tipo})
                    </option>
                  ))}
                </select>
                {selectedMarket ? (
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 font-semibold uppercase tracking-wide",
                          isMarketSuspended ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200",
                        )}
                      >
                        {isMarketSuspended ? "Suspendido" : "Abierto"}
                      </span>
                      <span
                        className={cn(
                          "rounded-full bg-muted/40 px-2 py-1",
                          isMarketSuspended ? "text-amber-300" : "text-muted-foreground",
                        )}
                      >
                        {selectedTimeLabel}
                      </span>
                    </div>
                    {selectedMarket.descripcion ? (
                      <p className="text-muted-foreground">{selectedMarket.descripcion}</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="option">Opcion</Label>
                <select
                  id="option"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedOptionId}
                  onChange={(event) => setSelectedOptionId(event.target.value)}
                  disabled={!canSell || pending || !selectedMarket || isMarketSuspended}
                >
                  {selectedMarket?.opciones.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.nombre}
                      {selectedMarket.tipo === "ODDS" && option.cuotaActual
                        ? ` (cuota ${option.cuotaActual.toFixed(2)})`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="alias">Alias del apostador</Label>
                <Input
                  id="alias"
                  placeholder="Alias o apodo"
                  value={alias}
                  onChange={(event) => setAlias(event.target.value)}
                  required
                  disabled={!canSell || pending || isMarketSuspended}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Monto (USD)</Label>
                <CurrencyInput
                  id="amount"
                  value={amountDigits}
                  onValueChange={setAmountDigits}
                  placeholder="1,000"
                  required
                  disabled={!canSell || pending || isMarketSuspended}
                />
              </div>

              {message ? (
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
                    message.variant === "success"
                      ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-100"
                      : message.variant === "info"
                        ? "border-amber-500/40 bg-amber-900/30 text-amber-100"
                        : "border-destructive/50 bg-destructive/10 text-destructive",
                  )}
                >
                  <span className="flex-1">{message.content}</span>
                  {message.copyValue ? (
                    <button
                      type="button"
                      className="rounded-md border border-border/40 bg-background/20 p-1 text-xs text-muted-foreground transition hover:bg-background/40"
                      onClick={() => handleCopyCode(message.copyValue ?? "")}
                      aria-label="Copiar código del ticket"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              ) : null}

              {confirmation ? (
                <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-950/40 p-4 text-sm">
                  <p className="font-medium text-amber-200">Se detecto un recalculo de cuotas. Revisa los cambios:</p>
                  <ul className="space-y-1 text-amber-100">
                    {confirmation.updates.map((update) => (
                      <li key={update.optionId}>
                        {update.nombre}: {update.before.toFixed(2)} {'->'} {update.after.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                  <Button type="button" onClick={onConfirm} disabled={pending}>
                    {pending ? "Confirmando..." : "Confirmar y registrar"}
                  </Button>
                </div>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetForm} disabled={pending}>
                  Limpiar
                </Button>
                <Button type="submit" disabled={!canSell || pending || isMarketSuspended}>
                  {pending ? "Registrando..." : "Registrar ticket"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60">
          <CardHeader>
            <CardTitle>Limites por rango</CardTitle>
            <CardDescription>
              Promocion automatica cada {promotionEvery} apuestas registradas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm text-muted-foreground">
              {rankRules.map((rule) => (
                <div key={rule.id} className="flex items-center justify-between rounded border border-border/30 px-3 py-2">
                  <span className="font-medium text-foreground">
                    {rule.orden}. {rule.nombre}
                  </span>
                  <span>
                    {formatCurrency(rule.minMonto)} - {formatCurrency(rule.maxMonto)} USD
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 bg-card/60">
        <CardHeader>
          <CardTitle>Mercados disponibles</CardTitle>
          <CardDescription>Resumen rapido de cuotas y opciones activas.</CardDescription>
        </CardHeader>
        <CardContent>
          {markets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay mercados abiertos por ahora.</p>
          ) : (
            <div className="grid gap-4">
              {markets.map((market) => (
                <SalesMarketSummary key={market.id} market={market} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
const SALES_TYPE_LABELS: Record<SalesMarket["tipo"], string> = {
  POOL: "Pozo compartido",
  ODDS: "Cuotas dinámicas",
};

function SalesMarketSummary({ market }: { market: SalesMarket }) {
  const { remainingMs, isElapsed } = useCountdown(market.endsAt ?? null, market.timeRemainingMs ?? null);
  const isSuspended = market.estado === "SUSPENDIDO" || isElapsed;
  const timerLabel = formatDuration(remainingMs);

  return (
    <div className="rounded-lg border border-border/30 bg-background/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{market.nombre}</p>
          <p className="text-xs text-muted-foreground">{SALES_TYPE_LABELS[market.tipo]}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-xs">
          <span
            className={cn(
              "rounded-full px-2 py-1 font-semibold uppercase tracking-wide",
              isSuspended ? "bg-amber-500/20 text-amber-200" : "bg-emerald-500/20 text-emerald-200",
            )}
          >
            {isSuspended ? "Suspendido" : "Abierto"}
          </span>
          <span
            className={cn(
              "rounded-full bg-muted/40 px-2 py-1",
              isSuspended ? "text-amber-300" : "text-muted-foreground",
            )}
          >
            {timerLabel}
          </span>
        </div>
      </div>
      {market.descripcion ? <p className="mt-2 text-xs text-muted-foreground">{market.descripcion}</p> : null}
      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {market.opciones.map((option) => (
          <div key={option.id} className="flex items-center justify-between rounded border border-border/20 px-3 py-2">
            <span>{option.nombre}</span>
            {market.tipo === "ODDS" ? (
              <span>{option.cuotaActual?.toFixed(2) ?? option.cuotaInicial?.toFixed(2) ?? "--"}</span>
            ) : (
              <span>Pozo compartido</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}





