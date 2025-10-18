"use client";

import { useMemo, useState, useTransition } from "react";

import { createTicketAction, type TicketActionResponse } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
};

export function SalesManager({ data }: SalesManagerProps) {
  const { markets, rankRules, promotionEvery, canSell } = data;

  const [selectedMarketId, setSelectedMarketId] = useState(markets[0]?.id ?? "");
  const [selectedOptionId, setSelectedOptionId] = useState(markets[0]?.opciones[0]?.id ?? "");
  const [alias, setAlias] = useState("");
  const [monto, setMonto] = useState("1000");
  const [message, setMessage] = useState<MessageState | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedMarket = useMemo(() => markets.find((item) => item.id === selectedMarketId) ?? null, [markets, selectedMarketId]);
  const selectedOption = useMemo(() => selectedMarket?.opciones.find((item) => item.id === selectedOptionId) ?? null, [selectedMarket, selectedOptionId]);

  const resetForm = () => {
    setAlias("");
    setMonto("1000");
    if (markets.length > 0) {
      setSelectedMarketId(markets[0].id);
      setSelectedOptionId(markets[0].opciones[0]?.id ?? "");
    }
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

  const handleResponse = (response: TicketActionResponse, basePayload: { marketId: string; optionId: string; alias: string; monto: number }) => {
    if (response.status === "success") {
      setConfirmation(null);
      setMessage({ content: `${response.message}. Codigo: ${response.data.codigo}`, variant: "success" });
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

    const montoValue = Number.parseInt(monto, 10);
    if (Number.isNaN(montoValue) || montoValue <= 0) {
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
                  disabled={!canSell || pending}
                >
                  {markets.map((market) => (
                    <option key={market.id} value={market.id}>
                      {market.nombre} ({market.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="option">Opcion</Label>
                <select
                  id="option"
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedOptionId}
                  onChange={(event) => setSelectedOptionId(event.target.value)}
                  disabled={!canSell || pending || !selectedMarket}
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
                  disabled={!canSell || pending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Monto (USD)</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  step={1}
                  value={monto}
                  onChange={(event) => setMonto(event.target.value)}
                  required
                  disabled={!canSell || pending}
                />
              </div>

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
                <Button type="submit" disabled={!canSell || pending}>
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
                    {rule.minMonto.toLocaleString()} - {rule.maxMonto.toLocaleString()} USD
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
                <div key={market.id} className="rounded-lg border border-border/30 bg-background/40 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {market.nombre} ({market.tipo})
                    </p>
                    <p className="text-xs text-muted-foreground">{market.descripcion}</p>
                  </div>
                  <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
                    {market.opciones.map((option) => (
                      <div key={option.id} className="flex items-center justify-between rounded border border-border/20 px-3 py-2">
                        <span>{option.nombre}</span>
                        {market.tipo === "ODDS" ? (
                          <span>
                            {option.cuotaActual?.toFixed(2) ?? option.cuotaInicial?.toFixed(2) ?? "--"}
                          </span>
                        ) : (
                          <span>POOL</span>
                        )}
                      </div>
                    ))}
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












