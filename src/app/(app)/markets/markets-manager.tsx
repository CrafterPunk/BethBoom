"use client";

import { useMemo, useState, useTransition } from "react";

import { addOptionAction, createMarketAction, updateMarketStatusAction, updateOptionOddsAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const MARKET_TYPES = ["POOL", "ODDS"] as const;
const MARKET_SCOPES = ["GLOBAL", "SEDE"] as const;

type MarketTipo = (typeof MARKET_TYPES)[number];
type MarketEstado = "ABIERTO" | "SUSPENDIDO" | "CERRADO";
type MarketScope = (typeof MARKET_SCOPES)[number];

type MarketOptionDTO = {
  id: string;
  nombre: string;
  cuotaInicial: number | null;
  cuotaActual: number | null;
  totalApostado: number;
  createdAt: string;
};

type MarketDTO = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: MarketTipo;
  estado: MarketEstado;
  feePct: number;
  franchiseSharePct: number;
  umbralRecalcMonto: number;
  franquiciaScope: MarketScope;
  sede: { id: string; nombre: string; codigo: string } | null;
  startsAt: string | null;
  endsAt: string | null;
  closedAt: string | null;
  ganadoraId: string | null;
  opciones: MarketOptionDTO[];
  createdAt: string;
};

type MarketsManagerProps = {
  data: {
    markets: MarketDTO[];
    franquicias: Array<{ id: string; nombre: string; codigo: string }>;
    canManage: boolean;
    isOddsVisible: boolean;
  };
};

type FormOption = {
  nombre: string;
  cuotaInicial: number | null;
};

type FormState = {
  nombre: string;
  descripcion: string;
  tipo: MarketTipo;
  feePct: number;
  franchiseSharePct: number;
  umbralRecalcMonto: number;
  franquiciaScope: MarketScope;
  sedeId: string | null;
  startsAt: string;
  endsAt: string;
  opciones: FormOption[];
};

const defaultOption = (tipo: MarketTipo): FormOption => ({
  nombre: "",
  cuotaInicial: tipo === "ODDS" ? 2.0 : null,
});

const initialFormState: FormState = {
  nombre: "",
  descripcion: "",
  tipo: "ODDS",
  feePct: 12,
  franchiseSharePct: 50,
  umbralRecalcMonto: 30000,
  franquiciaScope: "GLOBAL",
  sedeId: null,
  startsAt: "",
  endsAt: "",
  opciones: [defaultOption("ODDS"), defaultOption("ODDS")],
};

export function MarketsManager({ data }: MarketsManagerProps) {
  const { markets, franquicias, canManage } = data;
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [feedback, setFeedback] = useState<{ message: string; isError: boolean } | null>(null);
  const [pending, startTransition] = useTransition();
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [winnerState, setWinnerState] = useState<Record<string, string>>({});
  const [optionOddsDraft, setOptionOddsDraft] = useState<Record<string, string>>({});
  const [messageMap, setMessageMap] = useState<Record<string, { message: string; isError: boolean }>>({});

  const oddsDraftValues = useMemo(() => optionOddsDraft, [optionOddsDraft]);

  const resetForm = () => {
    setFormState((prev) => ({
      ...initialFormState,
      tipo: prev.tipo,
      opciones: [defaultOption(prev.tipo), defaultOption(prev.tipo)],
    }));
  };

  const handleFormChange = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((prev) => {
      let next: FormState = {
        ...prev,
        [key]: value,
      };

      if (key === "tipo") {
        const nextTipo = value as MarketTipo;
        const nextOptions = prev.opciones.map((option) => ({
          ...option,
          cuotaInicial: nextTipo === "ODDS" ? option.cuotaInicial ?? 2 : null,
        }));
        next = {
          ...next,
          tipo: nextTipo,
          opciones: nextOptions,
        };
      }

      if (key === "franquiciaScope" && value === "GLOBAL") {
        next = {
          ...next,
          sedeId: null,
        };
      }

      return next;
    });
  };

  const handleOptionChange = (index: number, patch: Partial<FormOption>) => {
    setFormState((prev) => ({
      ...prev,
      opciones: prev.opciones.map((option, idx) => (idx === index ? { ...option, ...patch } : option)),
    }));
  };

  const handleAddOption = () => {
    setFormState((prev) => ({
      ...prev,
      opciones: [...prev.opciones, defaultOption(prev.tipo)],
    }));
  };

  const handleRemoveOption = (index: number) => {
    setFormState((prev) => {
      if (prev.opciones.length <= 2) {
        return prev;
      }
      return {
        ...prev,
        opciones: prev.opciones.filter((_, idx) => idx !== index),
      };
    });
  };

  const submitCreateMarket = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    const payload = {
      nombre: formState.nombre.trim(),
      descripcion: formState.descripcion.trim(),
      tipo: formState.tipo,
      feePct: formState.feePct,
      franchiseSharePct: formState.franchiseSharePct,
      umbralRecalcMonto: formState.umbralRecalcMonto,
      franquiciaScope: formState.franquiciaScope,
      sedeId: formState.franquiciaScope === "SEDE" ? formState.sedeId : null,
      startsAt: formState.startsAt ? new Date(formState.startsAt).toISOString() : null,
      endsAt: formState.endsAt ? new Date(formState.endsAt).toISOString() : null,
      opciones: formState.opciones.map((option) => ({
        nombre: option.nombre.trim(),
        cuotaInicial:
          formState.tipo === "ODDS"
            ? option.cuotaInicial !== null
              ? Number(option.cuotaInicial)
              : null
            : null,
      })),
    };

    const hasEmptyOption = payload.opciones.some((option) => option.nombre.length === 0);
    if (hasEmptyOption) {
      setFeedback({ message: "Todas las opciones deben tener un nombre", isError: true });
      return;
    }

    if (formState.tipo === "ODDS") {
      const invalidOdds = payload.opciones.some((option) => {
        if (option.cuotaInicial === null) return true;
        return option.cuotaInicial < 1.2 || option.cuotaInicial > 5;
      });
      if (invalidOdds) {
        setFeedback({ message: "Cuotas iniciales deben estar entre 1.20 y 5.00", isError: true });
        return;
      }
    }

    startTransition(async () => {
      const result = await createMarketAction(payload);
      setFeedback({ message: result.message, isError: !result.ok });
      if (result.ok) {
        resetForm();
      }
    });
  };

  const updateStatus = (marketId: string, estado: MarketEstado) => {
    setStatusPendingId(marketId);
    setMessageMap((prev) => ({ ...prev, [marketId]: { message: "", isError: false } }));
    const ganadoraId = estado === "CERRADO" ? winnerState[marketId] ?? null : null;

    startTransition(async () => {
      const result = await updateMarketStatusAction({ marketId, estado, ganadoraId });
      setMessageMap((prev) => ({
        ...prev,
        [marketId]: { message: result.message, isError: !result.ok },
      }));
      setStatusPendingId(null);
    });
  };

  const addOption = (market: MarketDTO, nombre: string, cuota: string) => {
    setStatusPendingId(market.id);
    setMessageMap((prev) => ({ ...prev, [market.id]: { message: "", isError: false } }));

    const cuotaValue = cuota ? Number(cuota) : null;
    if (market.tipo === "ODDS" && (cuotaValue === null || Number.isNaN(cuotaValue))) {
      setMessageMap((prev) => ({
        ...prev,
        [market.id]: { message: "Cuota inicial obligatoria", isError: true },
      }));
      setStatusPendingId(null);
      return;
    }

    startTransition(async () => {
      const result = await addOptionAction({
        marketId: market.id,
        nombre: nombre.trim(),
        cuotaInicial: market.tipo === "ODDS" ? cuotaValue : null,
      });
      setMessageMap((prev) => ({
        ...prev,
        [market.id]: { message: result.message, isError: !result.ok },
      }));
      setStatusPendingId(null);
    });
  };

  const updateOptionOdds = (optionId: string, draftValue: string, marketId: string) => {
    const parsed = Number(draftValue);
    if (Number.isNaN(parsed)) {
      setMessageMap((prev) => ({
        ...prev,
        [marketId]: { message: "Ingrese un numero valido", isError: true },
      }));
      return;
    }

    setStatusPendingId(optionId);
    setMessageMap((prev) => ({ ...prev, [marketId]: { message: "", isError: false } }));

    startTransition(async () => {
      const result = await updateOptionOddsAction({ optionId, cuotaActual: parsed });
      setMessageMap((prev) => ({
        ...prev,
        [marketId]: { message: result.message, isError: !result.ok },
      }));
      setStatusPendingId(null);
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Mercados</h1>
          <p className="text-sm text-muted-foreground">
            Administrar mercados POOL y ODDS, opciones y estados operativos.
          </p>
        </div>
      </div>

      {canManage ? (
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Crear nuevo mercado</CardTitle>
            <CardDescription>Completa los campos obligatorios y define al menos dos opciones.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-6" onSubmit={submitCreateMarket}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="market-name">Nombre</Label>
                  <Input
                    id="market-name"
                    value={formState.nombre}
                    onChange={(event) => handleFormChange("nombre", event.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-type">Tipo</Label>
                  <select
                    id="market-type"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formState.tipo}
                    onChange={(event) => handleFormChange("tipo", event.target.value as MarketTipo)}
                  >
                    {MARKET_TYPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-fee">Fee %</Label>
                  <Input
                    id="market-fee"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={formState.feePct}
                    onChange={(event) => handleFormChange("feePct", Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-share">Participacion franquicia %</Label>
                  <Input
                    id="market-share"
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={formState.franchiseSharePct}
                    onChange={(event) => handleFormChange("franchiseSharePct", Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-umbral">Umbral recalculo (USD)</Label>
                  <Input
                    id="market-umbral"
                    type="number"
                    min={1000}
                    step={1000}
                    value={formState.umbralRecalcMonto}
                    onChange={(event) => handleFormChange("umbralRecalcMonto", Number(event.target.value))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-scope">Alcance</Label>
                  <select
                    id="market-scope"
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={formState.franquiciaScope}
                    onChange={(event) => handleFormChange("franquiciaScope", event.target.value as MarketScope)}
                  >
                    {MARKET_SCOPES.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
                {formState.franquiciaScope === "SEDE" ? (
                  <div className="space-y-2">
                    <Label htmlFor="market-sede">Sede</Label>
                    <select
                      id="market-sede"
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={formState.sedeId ?? ""}
                      onChange={(event) => handleFormChange("sedeId", event.target.value || null)}
                      required
                    >
                      <option value="">Selecciona sede</option>
                      {franquicias.map((franquicia) => (
                        <option key={franquicia.id} value={franquicia.id}>
                          {franquicia.nombre} ({franquicia.codigo})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="market-start">Fecha inicio</Label>
                  <Input
                    id="market-start"
                    type="datetime-local"
                    value={formState.startsAt}
                    onChange={(event) => handleFormChange("startsAt", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="market-end">Fecha cierre</Label>
                  <Input
                    id="market-end"
                    type="datetime-local"
                    value={formState.endsAt}
                    onChange={(event) => handleFormChange("endsAt", event.target.value)}
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="market-description">Descripcion</Label>
                  <textarea
                    id="market-description"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    rows={3}
                    value={formState.descripcion}
                    onChange={(event) => handleFormChange("descripcion", event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Opciones ({formState.tipo})</h3>
                  <Button type="button" variant="ghost" size="sm" onClick={handleAddOption}>
                    Agregar opcion
                  </Button>
                </div>
                <div className="grid gap-3">
                  {formState.opciones.map((option, index) => (
                    <div key={`option-${index}`} className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
                      <div className="space-y-1">
                        <Label className="text-xs">Nombre</Label>
                        <Input
                          value={option.nombre}
                          onChange={(event) => handleOptionChange(index, { nombre: event.target.value })}
                          required
                        />
                      </div>
                      {formState.tipo === "ODDS" ? (
                        <div className="space-y-1">
                          <Label className="text-xs">Cuota inicial</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min={1.2}
                            max={5}
                            value={option.cuotaInicial ?? ""}
                            onChange={(event) =>
                              handleOptionChange(index, {
                                cuotaInicial: event.target.value ? Number(event.target.value) : null,
                              })
                            }
                            required
                          />
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">Cuota no aplica (POOL)</div>
                      )}
                      <div className="flex items-end justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveOption(index)}
                          disabled={formState.opciones.length <= 2}
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {feedback ? (
                <p className={cn("text-sm", feedback.isError ? "text-destructive" : "text-emerald-400")}>{feedback.message}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={resetForm} disabled={pending}>
                  Limpiar
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Creando..." : "Crear mercado"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6">
        {markets.length === 0 ? (
          <Card className="border-dashed border-border/60 bg-card/60">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Aun no existen mercados configurados.
            </CardContent>
          </Card>
        ) : (
          markets.map((market) => {
            const marketMessage = messageMap[market.id];
            const pendingForMarket = statusPendingId === market.id;
            return (
              <Card key={market.id} className="border-border/60 bg-card/80">
                <CardHeader className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg text-foreground">{market.nombre}</CardTitle>
                    <span
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium",
                        market.estado === "ABIERTO"
                          ? "bg-emerald-500/20 text-emerald-300"
                          : market.estado === "SUSPENDIDO"
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-rose-500/20 text-rose-300",
                      )}
                    >
                      {market.estado}
                    </span>
                  </div>
                  <CardDescription>{market.descripcion}</CardDescription>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Tipo: {market.tipo}</span>
                    <span>Fee: {market.feePct.toFixed(2)}%</span>
                    <span>Participacion franquicia: {market.franchiseSharePct.toFixed(2)}%</span>
                    <span>Umbral recalculo: ${market.umbralRecalcMonto.toLocaleString()}</span>
                    <span>Alcance: {market.franquiciaScope}</span>
                    {market.sede ? <span>Sede: {market.sede.nombre}</span> : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-foreground">Opciones</h3>
                    <div className="grid gap-2">
                      {market.opciones.map((option) => {
                        const draftValue = oddsDraftValues[option.id] ?? (option.cuotaActual ?? option.cuotaInicial ?? "").toString();
                        const optionPending = statusPendingId === option.id;
                        return (
                          <div
                            key={option.id}
                            className="grid gap-4 rounded-lg border border-border/40 bg-background/40 px-3 py-3 md:grid-cols-[1fr_auto_auto] md:items-center"
                          >
                            <div>
                              <p className="text-sm font-medium text-foreground">{option.nombre}</p>
                              <p className="text-xs text-muted-foreground">
                                Creada el {new Date(option.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Inicio: {option.cuotaInicial?.toFixed(2) ?? "--"} | Actual: {option.cuotaActual?.toFixed(2) ?? "--"}
                            </div>
                            {canManage && market.tipo === "ODDS" ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={1.2}
                                  max={5}
                                  step="0.01"
                                  value={draftValue}
                                  onChange={(event) =>
                                    setOptionOddsDraft((prev) => ({ ...prev, [option.id]: event.target.value }))
                                  }
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => updateOptionOdds(option.id, draftValue, market.id)}
                                  disabled={optionPending}
                                >
                                  {optionPending ? "Guardando" : "Actualizar"}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {canManage ? (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-foreground">Acciones</h3>
                      <div className="flex flex-wrap items-center gap-3">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(market.id, "ABIERTO")}
                          disabled={pendingForMarket}
                        >
                          Reabrir
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => updateStatus(market.id, "SUSPENDIDO")}
                          disabled={pendingForMarket}
                        >
                          Suspender
                        </Button>
                        <div className="flex items-center gap-2">
                          <select
                            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                            value={winnerState[market.id] ?? ""}
                            onChange={(event) => setWinnerState((prev) => ({ ...prev, [market.id]: event.target.value }))}
                          >
                            <option value="">Selecciona ganadora</option>
                            {market.opciones.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.nombre}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => updateStatus(market.id, "CERRADO")}
                            disabled={pendingForMarket}
                          >
                            Cerrar
                          </Button>
                        </div>
                      </div>

                      <AddOptionInline market={market} pending={pendingForMarket} onSubmit={addOption} />
                    </div>
                  ) : null}

                  {marketMessage?.message ? (
                    <p
                      className={cn(
                        "text-sm",
                        marketMessage.isError ? "text-destructive" : "text-emerald-400",
                      )}
                    >
                      {marketMessage.message}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

type AddOptionInlineProps = {
  market: MarketDTO;
  pending: boolean;
  onSubmit: (market: MarketDTO, nombre: string, cuota: string) => void;
};

function AddOptionInline({ market, pending, onSubmit }: AddOptionInlineProps) {
  const [nombre, setNombre] = useState("");
  const [cuota, setCuota] = useState("2.00");

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-3">
      <div className="flex-1 space-y-1">
        <Label className="text-xs">Nueva opcion</Label>
        <Input value={nombre} onChange={(event) => setNombre(event.target.value)} placeholder="Nombre" />
      </div>
      {market.tipo === "ODDS" ? (
        <div className="w-32 space-y-1">
          <Label className="text-xs">Cuota inicial</Label>
          <Input
            type="number"
            min={1.2}
            max={5}
            step="0.01"
            value={cuota}
            onChange={(event) => setCuota(event.target.value)}
          />
        </div>
      ) : null}
      <Button
        type="button"
        size="sm"
        onClick={() => {
          if (!nombre.trim()) {
            return;
          }
          onSubmit(market, nombre, cuota);
          setNombre("");
          setCuota("2.00");
        }}
        disabled={pending}
      >
        Agregar opcion
      </Button>
    </div>
  );
}









