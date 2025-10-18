"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import { deleteAuditLogAction } from "./actions";

type MessageState = {
  content: string;
  variant: "success" | "error";
};

type AuditLogRow = {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string;
  actorId: string | null;
  actorNombre: string | null;
  createdAt: string;
  antes: string;
  despues: string;
  ip: string | null;
  userAgent: string | null;
};

type AuditsManagerProps = {
  data: {
    logs: AuditLogRow[];
    pagination: {
      page: number;
      totalPages: number;
      total: number;
    };
    filters: {
      entities: string[];
      actors: Array<{ id: string; nombre: string }>;
      from?: string;
      to?: string;
      entity?: string;
      actor?: string;
    };
    canDelete: boolean;
  };
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function truncateJson(value: string) {
  if (!value) return "-";
  if (value.length > 160) {
    return `${value.slice(0, 160)}...`;
  }
  return value;
}

export function AuditsManager({ data }: AuditsManagerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [message, setMessage] = useState<MessageState | null>(null);
  const [pending, startTransition] = useTransition();

  const queryString = useMemo(() => {
    const params = new URLSearchParams(searchParams?.toString());
    params.delete("page");
    return params.toString();
  }, [searchParams]);

  const handleDelete = (id: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await deleteAuditLogAction({ id });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const { page, totalPages, total } = data.pagination;

  return (
    <section className="space-y-8 py-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
          <CardDescription>Filtra logs por entidad, actor y rango de fechas.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/audits" method="get" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="entity">Entidad</Label>
              <select
                id="entity"
                name="entity"
                defaultValue={data.filters.entity ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
              >
                <option value="">Todas</option>
                {data.filters.entities.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="actor">Actor</Label>
              <select
                id="actor"
                name="actor"
                defaultValue={data.filters.actor ?? ""}
                className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
              >
                <option value="">Todos</option>
                {data.filters.actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {actor.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="from">Desde</Label>
              <Input id="from" name="from" type="date" defaultValue={data.filters.from ?? ""} />
            </div>
            <div>
              <Label htmlFor="to">Hasta</Label>
              <Input id="to" name="to" type="date" defaultValue={data.filters.to ?? ""} />
            </div>
            <div className="md:col-span-4 flex items-center gap-2">
              <Button type="submit" disabled={pending}>
                Aplicar filtros
              </Button>
              <Link href="/audits" className="text-sm text-muted-foreground hover:underline">
                Reset
              </Link>
            </div>
          </form>
          {message ? (
            <p className={cn("mt-4 text-sm", message.variant === "success" ? "text-emerald-400" : "text-destructive")}>{message.content}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Logs ({total.toLocaleString()})</CardTitle>
          <CardDescription>
            Pagina {page} de {totalPages || 1}. Registros ordenados por fecha descendente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Fecha</th>
                  <th className="py-2 pr-4">Actor</th>
                  <th className="py-2 pr-4">Accion</th>
                  <th className="py-2 pr-4">Entidad</th>
                  <th className="py-2 pr-4">Antes</th>
                  <th className="py-2 pr-4">Despues</th>
                  <th className="py-2 pr-4">IP</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-sm text-muted-foreground">
                      No se encontraron logs con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  data.logs.map((log) => (
                    <tr key={log.id} className="border-b border-border/20">
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{formatDate(log.createdAt)}</td>
                      <td className="py-3 pr-4 text-sm text-foreground">{log.actorNombre ?? "Sistema"}</td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{log.accion}</td>
                      <td className="py-3 pr-4 text-xs">
                        {log.entidad}
                        {log.entidadId ? <span className="block text-[10px] text-muted-foreground">{log.entidadId}</span> : null}
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        <pre className="max-w-xs whitespace-pre-wrap break-all">{truncateJson(log.antes)}</pre>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">
                        <pre className="max-w-xs whitespace-pre-wrap break-all">{truncateJson(log.despues)}</pre>
                      </td>
                      <td className="py-3 pr-4 text-xs text-muted-foreground">{log.ip ?? "-"}</td>
                      <td className="py-3 pl-4 text-right">
                        <div className="flex justify-end gap-2">
                          {data.canDelete ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={pending}
                              onClick={() => handleDelete(log.id)}
                            >
                              Borrar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Mostrando {data.logs.length} registros.
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || page <= 1}
                onClick={() => router.push(`/audits?page=${Math.max(1, page - 1)}${queryString ? `&${queryString}` : ""}`)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending || page >= totalPages}
                onClick={() => router.push(`/audits?page=${Math.min(totalPages, page + 1)}${queryString ? `&${queryString}` : ""}`)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
