"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { adjustApostadorRankAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ApostadorItem = {
  id: string;
  alias: string;
  rangoNombre: string;
  rangoOrden: number;
  apuestasTotal: number;
  apuestasAcumuladas: number;
  updatedAt: string;
  createdAt: string;
};

type RankRuleItem = {
  id: string;
  nombre: string;
  orden: number;
  minMonto: number;
  maxMonto: number;
};

type ApostadoresManagerProps = {
  data: {
    apostadores: ApostadorItem[];
    rankRules: RankRuleItem[];
    canAdjust: boolean;
    total: number;
    query: string;
    promotionEvery: number;
  };
};

type MessageState = {
  content: string;
  variant: "success" | "error";
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function ApostadoresManager({ data }: ApostadoresManagerProps) {
  const { apostadores, rankRules, canAdjust, total, query, promotionEvery } = data;

  const router = useRouter();
  const [message, setMessage] = useState<MessageState | null>(null);
  const [pending, startTransition] = useTransition();
  const [focusedAction, setFocusedAction] = useState<string | null>(null);

  const { minOrden, maxOrden } = useMemo(() => {
    if (rankRules.length === 0) {
      return { minOrden: 0, maxOrden: 0 };
    }
    const ordenes = rankRules.map((rule) => rule.orden);
    return {
      minOrden: Math.min(...ordenes),
      maxOrden: Math.max(...ordenes),
    };
  }, [rankRules]);

  const handleAdjust = (apostadorId: string, direction: "up" | "down") => {
    if (!canAdjust) return;
    setMessage(null);
    setFocusedAction(`${apostadorId}:${direction}`);
    startTransition(async () => {
      try {
        const result = await adjustApostadorRankAction({ apostadorId, direction });
        if (result.ok) {
          setMessage({ content: result.message, variant: "success" });
          router.refresh();
        } else {
          setMessage({ content: result.message, variant: "error" });
        }
      } catch (error) {
        console.error("Error ajustando rango", error);
        setMessage({ content: "No se pudo actualizar el rango", variant: "error" });
      } finally {
        setFocusedAction(null);
      }
    });
  };

  return (
    <div className="space-y-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Apostadores</CardTitle>
          <CardDescription>
            Resultados {apostadores.length} de {total}. Promocion automatica cada {promotionEvery} apuestas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/apostadores" method="get" className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <Input name="q" defaultValue={query} placeholder="Buscar alias" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={pending}>
                Buscar
              </Button>
              {query ? (
                <Button type="button" variant="ghost" onClick={() => router.replace("/apostadores")} disabled={pending}>
                  Limpiar
                </Button>
              ) : null}
            </div>
          </form>
          {message ? (
            <p
              className={cn(
                "mt-4 text-sm",
                message.variant === "success" ? "text-emerald-400" : "text-destructive",
              )}
            >
              {message.content}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Listado</CardTitle>
          <CardDescription>Gestiona rangos y revisa el historial de apuestas por alias.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Alias</th>
                <th className="py-2 pr-4">Rango</th>
                <th className="py-2 pr-4">Apuestas</th>
                <th className="py-2 pr-4">Acumuladas</th>
                <th className="py-2 pr-4">Actualizado</th>
                <th className="py-2 pr-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {apostadores.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No se encontraron apostadores con los filtros actuales.
                  </td>
                </tr>
              ) : (
                apostadores.map((apostador) => {
                  const canPromote = apostador.rangoOrden < maxOrden;
                  const canDemote = apostador.rangoOrden > minOrden;
                  const promotePending = pending && focusedAction === `${apostador.id}:up`;
                  const demotePending = pending && focusedAction === `${apostador.id}:down`;

                  return (
                    <tr key={apostador.id} className="border-b border-border/20">
                      <td className="py-3 pr-4 font-medium text-foreground">{apostador.alias}</td>
                      <td className="py-3 pr-4">
                        <span className="rounded bg-secondary/30 px-2 py-1 text-xs font-semibold text-secondary-foreground">
                          {apostador.rangoNombre}
                        </span>
                      </td>
                      <td className="py-3 pr-4">{apostador.apuestasTotal.toLocaleString()}</td>
                      <td className="py-3 pr-4">{apostador.apuestasAcumuladas.toLocaleString()}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(apostador.updatedAt)}</td>
                      <td className="py-3 pl-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={!canAdjust || !canDemote || demotePending}
                            onClick={() => handleAdjust(apostador.id, "down")}
                          >
                            {demotePending ? "Aplicando..." : "Degradar"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={!canAdjust || !canPromote || promotePending}
                            onClick={() => handleAdjust(apostador.id, "up")}
                          >
                            {promotePending ? "Aplicando..." : "Promover"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Rangos configurados</CardTitle>
          <CardDescription>Referencias de limites por rango.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {rankRules.map((rule) => (
            <div key={rule.id} className="rounded border border-border/30 bg-background/60 p-4 text-sm">
              <p className="font-semibold text-foreground">
                {rule.orden}. {rule.nombre}
              </p>
              <p className="mt-1 text-muted-foreground">
                Limite: {rule.minMonto.toLocaleString()} - {rule.maxMonto.toLocaleString()} USD
              </p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
