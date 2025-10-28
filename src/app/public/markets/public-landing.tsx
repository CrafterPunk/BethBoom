"use client";

import type { MercadoEstado, MercadoTipo } from "@prisma/client";
import { ExternalLink, Info } from "lucide-react";
import Link from "next/link";

import { AccessForm } from "@/app/(auth)/access/access-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/format";
import { useCountdown } from "@/lib/hooks/use-countdown";
import { cn } from "@/lib/utils";

import { MARKET_TYPE_INFO } from "./market-info";
import { TicketSearch } from "./ticket-search";

type PublicMarketOption = {
  id: string;
  nombre: string;
  cuotaActual: number | null;
  cuotaInicial: number | null;
};

export type PublicMarket = {
  id: string;
  nombre: string;
  descripcion: string;
  tipo: MercadoTipo;
  estado: MercadoEstado;
  endsAt: string | null;
  timeRemainingMs: number | null;
  opciones: PublicMarketOption[];
};

type PublicMarketsLandingProps = {
  markets: PublicMarket[];
  sessionDisplayName?: string | null;
};

const STATE_STYLE: Record<"ABIERTO" | "SUSPENDIDO", string> = {
  ABIERTO: "bg-emerald-500/15 text-emerald-200 border border-emerald-500/40",
  SUSPENDIDO: "bg-amber-500/15 text-amber-200 border border-amber-500/40",
};

function MarketCard({ market }: { market: PublicMarket }) {
  const { remainingMs, isElapsed } = useCountdown(market.endsAt, market.timeRemainingMs);
  const displayState: "ABIERTO" | "SUSPENDIDO" =
    market.estado === "SUSPENDIDO" || isElapsed ? "SUSPENDIDO" : "ABIERTO";
  const typeInfo = MARKET_TYPE_INFO[market.tipo];
  const timerLabel = formatDuration(remainingMs);

  return (
    <div className="space-y-3 rounded-xl border border-border/40 bg-background/60 p-5 shadow-sm transition hover:border-primary/50 hover:shadow-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">{market.nombre}</h3>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase", STATE_STYLE[displayState])}>
              {displayState === "ABIERTO" ? "Abierto" : "Suspendido"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{market.descripcion}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-1 font-medium uppercase tracking-wide">
              <Info className="h-3 w-3" />
              {typeInfo.label}
            </span>
            <span>{typeInfo.summary}</span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-center gap-2 text-right text-xs">
          <span className={cn("rounded-full px-2 py-1 text-[11px] font-semibold text-primary/90", remainingMs === null ? "bg-primary/10" : "bg-primary/20")}>
            {timerLabel}
          </span>
          {market.endsAt ? (
            <span className="text-muted-foreground">
              Cierra el {new Date(market.endsAt).toLocaleString("es-MX")}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin fecha exacta</span>
          )}
        </div>
      </div>

      <details className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer list-none text-sm font-medium text-foreground">
          ¿Cómo funciona esta modalidad?
        </summary>
        <p className="mt-2 leading-relaxed">{typeInfo.details}</p>
      </details>

      <div className="space-y-2 text-sm">
        {market.opciones.length === 0 ? (
          <p className="text-muted-foreground">Aún no hay opciones publicadas.</p>
        ) : (
          market.opciones.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2"
            >
              <div>
                <p className="font-medium text-foreground">{option.nombre}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                {market.tipo === "ODDS" ? (
                  <>
                    <p className="font-semibold text-foreground">
                      Cuota {option.cuotaActual?.toFixed(2) ?? option.cuotaInicial?.toFixed(2) ?? "--"}
                    </p>
                    <p>Pagas monto x cuota</p>
                  </>
                ) : (
                  <p>Premio depende del pozo final</p>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function PublicMarketsLanding({ markets, sessionDisplayName }: PublicMarketsLandingProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background/80 to-background">
      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <p className="text-2xl font-semibold text-primary">BethBoom Markets</p>
            <p className="text-xs text-muted-foreground">Consulta mercados activos y verifica el estado de tus tickets.</p>
          </div>
          {sessionDisplayName ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Sesión activa: {sessionDisplayName}</span>
              <Button asChild variant="secondary" size="sm">
                <Link href="/dashboard">
                  Ir al panel
                  <ExternalLink className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <div className="space-y-4">
            <AccessForm className="max-w-md" />
            <TicketSearch />
          </div>
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle>Mercados activos para jugadores</CardTitle>
              <CardDescription>
                Visualiza las opciones disponibles y el tiempo restante antes del cierre. Los mercados cerrados se
                ocultan automáticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {markets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No hay mercados abiertos para el público en este momento. Vuelve a intentar más tarde.
                </p>
              ) : (
                <div className="space-y-4">
                  {markets.map((market) => (
                    <MarketCard key={market.id} market={market} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

