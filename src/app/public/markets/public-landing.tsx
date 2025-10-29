"use client";

import { useEffect, useMemo, useState } from "react";

import type { MercadoEstado, MercadoTipo } from "@prisma/client";
import { ArrowRight, BarChart3, Clock3, ExternalLink, Info, Sparkles } from "lucide-react";
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

type PromoSlide = {
  id: string;
  title: string;
  subtitle: string;
  accent: string;
  background: string;
  ctaLabel: string;
  ctaHref: string;
};

const FALLBACK_PROMOS: PromoSlide[] = [
  {
    id: "bethboom-experience",
    title: "Apuestas con atmosfera BethBoom",
    subtitle: "Descubre cuotas agresivas y pozos compartidos listos para el fin de semana.",
    accent: "from-[#facc15]/80 to-[#f97316]/70",
    background: "bg-gradient-to-r from-[#0f172a] via-[#101830] to-[#1c2538]",
    ctaLabel: "Explorar mercados",
    ctaHref: "#mercados",
  },
  {
    id: "pool-pot",
    title: "Pozos que crecen en cada jugada",
    subtitle: "Las apuestas POOL reparten todo el bote entre ganadores. Entre mas juegues, mas grande el premio.",
    accent: "from-[#34d399]/80 to-[#22d3ee]/70",
    background: "bg-gradient-to-r from-[#03141f] via-[#03212d] to-[#043649]",
    ctaLabel: "Ver modalidad pool",
    ctaHref: "#filter-pool",
  },
  {
    id: "odds-flash",
    title: "Cuotas dinamicas tiempo real",
    subtitle: "Asegura tu cuota favorita antes que cambie. Los Market Makers mantienen la accion viva.",
    accent: "from-[#f97316]/80 to-[#ef4444]/70",
    background: "bg-gradient-to-r from-[#1a1325] via-[#251433] to-[#3a1442]",
    ctaLabel: "Revisar cuotas",
    ctaHref: "#filter-odds",
  },
];

const STATE_STYLE: Record<"ABIERTO" | "SUSPENDIDO", string> = {
  ABIERTO: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200",
  SUSPENDIDO: "border-amber-400/50 bg-amber-500/10 text-amber-200",
};

function buildPromos(markets: PublicMarket[]): PromoSlide[] {
  const sorted = [...markets].sort((a, b) => {
    const aTime = a.timeRemainingMs ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.timeRemainingMs ?? Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });

  const top = sorted.slice(0, 3).map<PromoSlide>((market, index) => {
    const accentPalette = [
      { accent: "from-[#34d399]/80 to-[#22d3ee]/70", background: "bg-gradient-to-r from-[#03141f] via-[#04283a] to-[#053a4f]" },
      { accent: "from-[#facc15]/80 to-[#f97316]/70", background: "bg-gradient-to-r from-[#111827] via-[#1f2937] to-[#312e81]" },
      { accent: "from-[#fde68a]/70 to-[#f59e0b]/60", background: "bg-gradient-to-r from-[#0f172a] via-[#1e1b4b] to-[#312e81]" },
    ][index % 3];

    return {
      id: `market-${market.id}`,
      title: market.nombre,
      subtitle:
        market.estado === "SUSPENDIDO"
          ? "Temporalmente suspendido. Vuelve pronto para retomar la accion."
          : market.descripcion || "Mercado listo para recibir apuestas.",
      accent: accentPalette.accent,
      background: accentPalette.background,
      ctaLabel: market.estado === "SUSPENDIDO" ? "Revisar estado" : "Apostar ahora",
      ctaHref: `#market-${market.id}`,
    };
  });

  return top.length > 0 ? [...top, ...FALLBACK_PROMOS.slice(top.length)] : FALLBACK_PROMOS;
}

function PromoCarousel({ slides }: { slides: PromoSlide[] }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) {
      return;
    }
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) {
    return null;
  }

  const slide = slides[active];

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-white/10 p-[1px] shadow-lg", slide.background)}>
      <div className="relative flex flex-col gap-6 rounded-2xl bg-gradient-to-br from-black/50 via-black/30 to-black/20 p-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-xl space-y-4">
          <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-widest text-slate-100", `bg-gradient-to-r ${slide.accent}`)}>
            <Sparkles className="h-4 w-4" />
            Destacado
          </span>
          <h2 className="text-3xl font-bold text-slate-50 md:text-4xl">{slide.title}</h2>
          <p className="text-sm text-slate-200/90 md:text-base">{slide.subtitle}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="sm" variant="secondary" className="gap-2">
              <Link href={slide.ctaHref}>
                {slide.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="sm" variant="ghost" className="text-slate-200 hover:text-slate-100">
              <Link href="/access">
                Iniciar sesion
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {slides.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActive(index)}
              className={cn(
                "h-2 w-10 rounded-full transition-all",
                index === active ? "bg-white/90" : "bg-white/20 hover:bg-white/40",
              )}
              aria-label={`Mostrar promo ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const FILTER_TABS: Array<{ id: "ALL" | "POOL" | "ODDS"; label: string; hash: string }> = [
  { id: "ALL", label: "Todos", hash: "#mercados" },
  { id: "POOL", label: "Pool", hash: "#filter-pool" },
  { id: "ODDS", label: "Odds", hash: "#filter-odds" },
];

function MarketCard({ market }: { market: PublicMarket }) {
  const { remainingMs, isElapsed } = useCountdown(market.endsAt, market.timeRemainingMs);
  const displayState: "ABIERTO" | "SUSPENDIDO" =
    market.estado === "SUSPENDIDO" || isElapsed ? "SUSPENDIDO" : "ABIERTO";
  const typeInfo = MARKET_TYPE_INFO[market.tipo];
  const timerLabel = remainingMs === null ? "Sin fecha definida" : formatDuration(remainingMs);
  const closesAt =
    market.endsAt && !isElapsed ? new Date(market.endsAt).toLocaleString("es-MX") : "Sin fecha exacta";

  return (
    <div
      id={`market-${market.id}`}
      className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5 shadow-sm backdrop-blur transition hover:border-primary/50 hover:bg-white/[0.04] hover:shadow-lg"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-slate-50">{market.nombre}</h3>
            <span className={cn("rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide", STATE_STYLE[displayState])}>
              {displayState === "ABIERTO" ? "Abierto" : "Suspendido"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-200/80">{market.descripcion}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-300/80">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 font-medium uppercase tracking-wide">
              <Info className="h-3.5 w-3.5" />
              {typeInfo.label}
            </span>
            <span>{typeInfo.summary}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 text-right text-xs text-slate-300">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold text-primary">
            <Clock3 className="h-3.5 w-3.5" />
            {timerLabel}
          </span>
          <span>{closesAt === "Sin fecha exacta" ? closesAt : `Cierra ${closesAt}`}</span>
        </div>
      </div>

      <details className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-300 open:bg-white/[0.05]">
        <summary className="cursor-pointer select-none text-sm font-medium text-slate-100">
          Como funciona esta modalidad?
        </summary>
        <p className="mt-2 leading-relaxed text-slate-300/90">{typeInfo.details}</p>
      </details>

      <div className="space-y-2">
        {market.opciones.length === 0 ? (
          <p className="text-sm text-slate-300/80">Aun no hay opciones publicadas.</p>
        ) : (
          market.opciones.map((option) => (
            <div
              key={option.id}
              className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-slate-100">{option.nombre}</p>
                <p className="text-xs text-slate-400">Disponible para apostar en sede autorizada.</p>
              </div>
              <div className="text-right text-xs text-slate-300">
                {market.tipo === "ODDS" ? (
                  <>
                    <p className="text-sm font-semibold text-slate-50">
                      Cuota {option.cuotaActual?.toFixed(2) ?? option.cuotaInicial?.toFixed(2) ?? "--"}
                    </p>
                    <p>Monto x cuota</p>
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
  const [filter, setFilter] = useState<"ALL" | "POOL" | "ODDS">("ALL");
  const promos = useMemo(() => buildPromos(markets), [markets]);
  const openMarkets = useMemo(() => markets.filter((market) => market.estado === "ABIERTO"), [markets]);
  const suspendedMarkets = useMemo(
    () => markets.filter((market) => market.estado !== "ABIERTO"),
    [markets],
  );

  const filteredMarkets = useMemo(() => {
    if (filter === "ALL") return markets;
    return markets.filter((market) => market.tipo === filter);
  }, [filter, markets]);

  return (
    <div className="min-h-screen bg-[#050914] text-slate-100">
      <header className="border-b border-white/5 bg-[#070d1d]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-6 sm:px-6 lg:px-8">
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-slate-50">BethBoom Markets</p>
            <p className="text-xs text-slate-300">
              Consulta mercados activos, tiempos de cierre y estado de tus tickets.
            </p>
          </div>
          {sessionDisplayName ? (
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs text-slate-200">
              <span>Sesion activa: {sessionDisplayName}</span>
              <Button asChild size="sm" variant="secondary" className="gap-2">
                <Link href="/dashboard">
                  Ir al panel
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <Button asChild size="sm" variant="secondary" className="gap-2">
              <Link href="/access">
                Acceder operacion
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 lg:px-8">
        <section className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <PromoCarousel slides={promos} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Mercados abiertos
                </div>
                <p className="mt-2 text-3xl font-bold text-slate-50">{openMarkets.length}</p>
                <p className="text-xs text-slate-400">Disponibles para jugadores en sedes autorizadas.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Clock3 className="h-5 w-5 text-primary" />
                  Próximos a cerrar
                </div>
                <p className="mt-2 text-3xl font-bold text-slate-50">
                  {
                    markets.filter(
                      (market) =>
                        (market.timeRemainingMs ?? Number.MAX_SAFE_INTEGER) <= 1000 * 60 * 60 * 4 &&
                        market.estado === "ABIERTO",
                    ).length
                  }
                </p>
                <p className="text-xs text-slate-400">Menos de 4 horas para el cierre.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Mercados suspendidos
                </div>
                <p className="mt-2 text-3xl font-bold text-slate-50">{suspendedMarkets.length}</p>
                <p className="text-xs text-slate-400">Revisiones pendientes de reactivacion.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-center gap-3 text-sm text-slate-300">
                  <Info className="h-5 w-5 text-primary" />
                  Modalidades disponibles
                </div>
                <p className="mt-2 text-3xl font-bold text-slate-50">2</p>
                <p className="text-xs text-slate-400">Pool compartido y cuotas dinamicas.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <AccessForm className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-lg" />
            <TicketSearch className="rounded-2xl border border-white/10 bg-white/[0.04]" />
          </div>
        </section>

        <section id="mercados" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold text-slate-50">Mercados activos para jugadores</h2>
              <p className="text-xs text-slate-300">
                Filtra por modalidad, consulta opciones y revisa fechas de cierre sin necesidad de iniciar sesion.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_TABS.map((tab) => (
                <Button
                  key={tab.id}
                  id={tab.hash.replace("#", "")}
                  type="button"
                  size="sm"
                  variant={filter === tab.id ? "default" : "ghost"}
                  onClick={() => setFilter(tab.id)}
                  className={cn(filter === tab.id ? "shadow-md" : "text-slate-300 hover:text-slate-100")}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          </div>

          {filteredMarkets.length === 0 ? (
            <Card className="border-white/10 bg-white/[0.02]">
              <CardHeader>
                <CardTitle>Sin resultados</CardTitle>
                <CardDescription>
                  No hay mercados abiertos para este filtro. Revisa mas tarde o elige otra categoria.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-5 md:grid-cols-2" role="list">
              {filteredMarkets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
