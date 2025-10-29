"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { TicketEstado } from "@prisma/client";
import {
  addApostadorNoteAction,
  assignApostadorTagAction,
  createApostadorTagAction,
  removeApostadorTagAction,
  setApostadorAutoModeAction,
  setApostadorRankAction,
} from "./actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ApostadorNote = {
  id: string;
  contenido: string;
  createdAt: string;
  autor: string;
};

type ApostadorTag = {
  assignmentId: string;
  tagId: string;
  nombre: string;
  color: string;
};

type ApostadorPromotion = {
  id: string;
  rangoAnteriorNombre: string | null;
  rangoNuevoNombre: string;
  motivo: string | null;
  createdAt: string;
  actor: string | null;
};

type TicketUIState = "PENDIENTE" | "GANADOR_PENDIENTE" | "CERRADO_PERDIDO" | "PAGADO" | "PERDIDO" | "ANULADO";

type ApostadorTicket = {
  id: string;
  codigo: string;
  mercado: string;
  tipoMercado: "POOL" | "ODDS";
  monto: number;
  estado: TicketEstado;
  uiEstado: TicketUIState;
  venceAt: string | null;
  pagoMonto: number | null;
  pagadoAt: string | null;
  createdAt: string;
};

type ApostadorHistory = {
  tickets: ApostadorTicket[];
  totals: {
    apostado: number;
    pagado: number;
    expirado: number;
    balance: number;
  };
};

const TICKET_STATE_STYLES: Record<TicketUIState, { label: string; tone: string }> = {
  PENDIENTE: { label: "Pendiente", tone: "text-amber-300" },
  GANADOR_PENDIENTE: { label: "Pendiente de pago", tone: "text-sky-300" },
  CERRADO_PERDIDO: { label: "Cerrado - perdido", tone: "text-red-400" },
  PAGADO: { label: "Pagado", tone: "text-emerald-300" },
  PERDIDO: { label: "Perdido", tone: "text-red-400" },
  ANULADO: { label: "Anulado", tone: "text-muted-foreground" },
};

type ApostadorItem = {
  id: string;
  alias: string;
  rangoId: string;
  rangoNombre: string;
  rangoOrden: number;
  rangoManualId: string | null;
  rangoManualNombre: string | null;
  promocionAutomatica: boolean;
  apuestasTotal: number;
  apuestasAcumuladas: number;
  updatedAt: string;
  createdAt: string;
  notas: ApostadorNote[];
  etiquetas: ApostadorTag[];
  promociones: ApostadorPromotion[];
  history: ApostadorHistory;
};

type RankRuleItem = {
  id: string;
  nombre: string;
  orden: number;
  minMonto: number;
  maxMonto: number;
};

type TagCatalogItem = {
  id: string;
  nombre: string;
  color: string;
  descripcion: string | null;
};

type ApostadoresManagerProps = {
  data: {
    apostadores: ApostadorItem[];
    rankRules: RankRuleItem[];
    tags: TagCatalogItem[];
    canManage: boolean;
    canWriteNotes: boolean;
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

function formatCurrency(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}


export function ApostadoresManager({ data }: ApostadoresManagerProps) {
  const { apostadores, rankRules, tags, canManage, canWriteNotes, total, query, promotionEvery } = data;
  const router = useRouter();

  const [selectedId, setSelectedId] = useState<string | null>(apostadores[0]?.id ?? null);
  const [selectedRankId, setSelectedRankId] = useState<string>(apostadores[0]?.rangoManualId ?? apostadores[0]?.rangoId ?? "");
  const [noteContent, setNoteContent] = useState("");
  const [tagSelection, setTagSelection] = useState<string>("");
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#a855f7");
  const [newTagDescription, setNewTagDescription] = useState("");
  const [message, setMessage] = useState<MessageState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [focusedAction, setFocusedAction] = useState<string | null>(null);

  const selected = useMemo(() => apostadores.find((item) => item.id === selectedId) ?? null, [apostadores, selectedId]);

  useEffect(() => {
    if (selected) {
      setSelectedRankId(selected.rangoManualId ?? selected.rangoId);
      setTagSelection("");
      setNoteContent("");
    }
  }, [selected]);

  const availableTags = useMemo(() => {
    if (!selected) return tags;
    const assigned = new Set(selected.etiquetas.map((item) => item.tagId));
    return tags.filter((tag) => !assigned.has(tag.id));
  }, [selected, tags]);

  const handleSearchReset = () => router.replace("/apostadores");

  const handleAddNote = () => {
    if (!selected || !noteContent.trim()) return;
    setMessage(null);
    setFocusedAction("note");
    startTransition(async () => {
      const result = await addApostadorNoteAction({ apostadorId: selected.id, contenido: noteContent.trim() });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        setNoteContent("");
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  const handleAssignTag = () => {
    if (!selected || !tagSelection) return;
    setMessage(null);
    setFocusedAction(`assign:${tagSelection}`);
    startTransition(async () => {
      const result = await assignApostadorTagAction({ apostadorId: selected.id, tagId: tagSelection });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        setTagSelection("");
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  const handleRemoveTag = (assignmentId: string) => {
    setMessage(null);
    setFocusedAction(`remove:${assignmentId}`);
    startTransition(async () => {
      const result = await removeApostadorTagAction({ assignmentId });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  const handleCreateTag = () => {
    if (!newTagName.trim()) {
      setMessage({ content: "Define un nombre para la etiqueta", variant: "error" });
      return;
    }
    setMessage(null);
    setFocusedAction("createTag");
    startTransition(async () => {
      const result = await createApostadorTagAction({
        nombre: newTagName.trim(),
        color: newTagColor,
        descripcion: newTagDescription.trim() || undefined,
      });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        setNewTagName("");
        setNewTagDescription("");
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  const handleApplyRank = () => {
    if (!selected || !selectedRankId) return;
    setMessage(null);
    setFocusedAction("setRank");
    startTransition(async () => {
      const result = await setApostadorRankAction({ apostadorId: selected.id, rankId: selectedRankId });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  const handleToggleAuto = (enabled: boolean) => {
    if (!selected) return;
    setMessage(null);
    setFocusedAction("toggleAuto");
    startTransition(async () => {
      const result = await setApostadorAutoModeAction({ apostadorId: selected.id, enabled });
      if (result.ok) {
        setMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setMessage({ content: result.message, variant: "error" });
      }
      setFocusedAction(null);
    });
  };

  return (
    <div className="space-y-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Apostadores</CardTitle>
          <CardDescription>
            Resultados {apostadores.length} de {total}. Promoción automática cada {promotionEvery} apuestas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/apostadores" method="get" className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="flex-1">
              <Input name="q" defaultValue={query} placeholder="Buscar alias" />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending}>
                Buscar
              </Button>
              {query ? (
                <Button type="button" variant="ghost" onClick={handleSearchReset} disabled={isPending}>
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="border-border/60 bg-card/80">
          <CardHeader>
            <CardTitle>Listado</CardTitle>
            <CardDescription>Selecciona un apostador para ver detalles.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[560px] overflow-y-auto">
            <ul className="divide-y divide-border/30">
              {apostadores.map((apostador) => {
                const isActive = apostador.id === selectedId;
                return (
                  <li
                    key={apostador.id}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1 px-3 py-3 text-sm transition",
                      isActive ? "rounded-md bg-primary/10" : "hover:bg-muted/30",
                    )}
                    onClick={() => {
                      setSelectedId(apostador.id);
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{apostador.alias}</span>
                      <span className="text-xs text-muted-foreground">{apostador.rangoNombre}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {apostador.etiquetas.slice(0, 3).map((tag) => (
                        <span
                          key={tag.assignmentId}
                          className="rounded-full border border-border/40 px-2 py-0.5 text-[10px]"
                          style={{ borderColor: `${tag.color}33`, backgroundColor: `${tag.color}20`, color: tag.color }}
                        >
                          {tag.nombre}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{apostador.apuestasTotal.toLocaleString()} apuestas</span>
                      <span>
                        {apostador.promocionAutomatica ? "Auto" : "Manual"}
                      </span>
                    </div>
                  </li>
                );
              })}
              {apostadores.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">Sin resultados</li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selected ? (
            <>
              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle className="flex flex-col gap-1">
                    <span className="text-lg font-semibold text-foreground">{selected.alias}</span>
                    <span className="text-xs text-muted-foreground">
                      Actualizado {formatDate(selected.updatedAt)} . Creado {formatDate(selected.createdAt)}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    {selected.promocionAutomatica
                      ? "La promoción automática está activa"
                      : `Rango fijo en ${selected.rangoManualNombre ?? selected.rangoNombre}`}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={selectedRankId}
                      onChange={(event) => setSelectedRankId(event.target.value)}
                      disabled={!canManage || isPending}
                    >
                      {rankRules.map((rule) => (
                        <option key={rule.id} value={rule.id}>
                          {rule.nombre}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleApplyRank}
                      disabled={!canManage || isPending || focusedAction === "setRank"}
                    >
                      {focusedAction === "setRank" ? "Aplicando..." : "Fijar rango"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={selected.promocionAutomatica ? "outline" : "secondary"}
                      onClick={() => handleToggleAuto(!selected.promocionAutomatica)}
                      disabled={!canManage || isPending || focusedAction === "toggleAuto"}
                    >
                      {selected.promocionAutomatica
                        ? focusedAction === "toggleAuto" ? "Actualizando..." : "Desactivar auto"
                        : focusedAction === "toggleAuto" ? "Actualizando..." : "Activar auto"}
                    </Button>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Etiquetas</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.etiquetas.length === 0 ? (
                        <span className="text-xs text-muted-foreground">Sin etiquetas asignadas.</span>
                      ) : (
                        selected.etiquetas.map((item) => (
                          <span
                            key={item.assignmentId}
                            className="flex items-center gap-2 rounded-full border border-border/40 px-3 py-1 text-xs"
                            style={{ borderColor: `${item.color}33`, backgroundColor: `${item.color}20`, color: item.color }}
                          >
                            {item.nombre}
                            {canManage ? (
                              <button
                                type="button"
                                className="text-xs"
                                onClick={() => handleRemoveTag(item.assignmentId)}
                                disabled={isPending && focusedAction === `remove:${item.assignmentId}`}
                              >
                                X
                              </button>
                            ) : null}
                          </span>
                        ))
                      )}
                    </div>
                    {canManage ? (
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <select
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                          value={tagSelection}
                          onChange={(event) => setTagSelection(event.target.value)}
                          disabled={isPending}
                        >
                          <option value="">Selecciona etiqueta</option>
                          {availableTags.map((tag) => (
                            <option key={tag.id} value={tag.id}>
                              {tag.nombre}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAssignTag}
                          disabled={!tagSelection || (isPending && focusedAction?.startsWith("assign"))}
                        >
                          {focusedAction?.startsWith("assign") ? "Asignando..." : "Asignar"}
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  {canManage ? (
                    <div className="rounded-md border border-border/40 bg-background/50 p-4">
                      <h4 className="text-sm font-semibold text-foreground">Crear nueva etiqueta</h4>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Input
                          placeholder="Nombre"
                          value={newTagName}
                          onChange={(event) => setNewTagName(event.target.value)}
                          className="sm:flex-1"
                          disabled={isPending}
                        />
                        <input
                          type="color"
                          value={newTagColor}
                          onChange={(event) => setNewTagColor(event.target.value)}
                          className="h-10 w-24 rounded border border-input"
                          disabled={isPending}
                        />
                      </div>
                      <Input
                        placeholder="Descripcion (opcional)"
                        value={newTagDescription}
                        onChange={(event) => setNewTagDescription(event.target.value)}
                        className="mt-2"
                        disabled={isPending}
                      />
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3"
                        onClick={handleCreateTag}
                        disabled={isPending && focusedAction === "createTag"}
                      >
                        {focusedAction === "createTag" ? "Creando..." : "Crear etiqueta"}
                      </Button>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle>Historial de apuestas</CardTitle>
                  <CardDescription>Ultimas 25 operaciones registradas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase">Total apostado</p>
                      <p className="text-lg font-semibold text-foreground">${formatCurrency(selected.history.totals.apostado)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase">Total pagado</p>
                      <p className="text-lg font-semibold text-foreground">${formatCurrency(selected.history.totals.pagado)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase">Tickets vencidos</p>
                      <p className="text-lg font-semibold text-foreground">${formatCurrency(selected.history.totals.expirado)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase">Balance jugador</p>
                      <p className={cn("text-lg font-semibold", selected.history.totals.balance > 0 ? "text-emerald-300" : selected.history.totals.balance < 0 ? "text-red-400" : "text-muted-foreground")}>${formatCurrency(selected.history.totals.balance)}</p>
                      <p className="text-xs text-muted-foreground">{selected.history.totals.balance >= 0 ? "Jugador en positivo" : "Jugador en negativo"}</p>
                    </div>
                  </div>

                  {selected.history.tickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin apuestas registradas.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs md:text-sm">
                        <thead className="text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1 text-left font-medium">Código</th>
                            <th className="px-2 py-1 text-left font-medium">Mercado</th>
                            <th className="px-2 py-1 text-left font-medium">Monto</th>
                            <th className="px-2 py-1 text-left font-medium">Estado</th>
                            <th className="px-2 py-1 text-left font-medium">Pago</th>
                            <th className="px-2 py-1 text-left font-medium">Vence</th>
                            <th className="px-2 py-1 text-left font-medium">Registrado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {selected.history.tickets.map((ticket) => {
                            const stateInfo = TICKET_STATE_STYLES[ticket.uiEstado];
                            return (
                              <tr key={ticket.id} className="align-top">
                                <td className="px-2 py-2 font-medium text-foreground">{ticket.codigo}</td>
                                <td className="px-2 py-2 text-muted-foreground">
                                  <div className="flex flex-col">
                                    <span>{ticket.mercado}</span>
                                    <span className="text-xs uppercase">{ticket.tipoMercado}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-foreground">${formatCurrency(ticket.monto)}</td>
                                <td className={cn("px-2 py-2 font-medium", stateInfo.tone)}>{stateInfo.label}</td>
                                <td className="px-2 py-2 text-foreground">{ticket.pagoMonto !== null ? `$${formatCurrency(ticket.pagoMonto)}` : "--"}</td>
                                <td className="px-2 py-2 text-muted-foreground">{ticket.venceAt ? formatDate(ticket.venceAt) : "--"}</td>
                                <td className="px-2 py-2 text-muted-foreground">{formatDate(ticket.createdAt)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle>Notas internas</CardTitle>
                  <CardDescription>Registrar observaciones para el equipo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {selected.notas.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Sin notas registradas.</p>
                    ) : (
                      selected.notas.map((nota) => (
                        <div key={nota.id} className="rounded border border-border/30 bg-background/60 p-3 text-sm">
                          <p className="text-foreground">{nota.contenido}</p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {nota.autor} . {formatDate(nota.createdAt)}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {canWriteNotes ? (
                    <div className="space-y-2">
                      <textarea
                        value={noteContent}
                        onChange={(event) => setNoteContent(event.target.value)}
                        placeholder="Agregar nueva nota"
                        className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        maxLength={600}
                        disabled={isPending && focusedAction === "note"}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddNote}
                          disabled={!noteContent.trim() || (isPending && focusedAction === "note")}
                        >
                          {focusedAction === "note" ? "Guardando..." : "Guardar nota"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-card/80">
                <CardHeader>
                  <CardTitle>Historial de promociones</CardTitle>
                  <CardDescription>Cambios recientes de rango y acciones manuales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {selected.promociones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin promociones registradas.</p>
                  ) : (
                    selected.promociones.map((hist) => (
                      <div key={hist.id} className="rounded border border-border/30 bg-background/60 p-3 text-sm">
                        <p className="font-semibold text-foreground">
                          {hist.rangoAnteriorNombre ?? "--"} ? {hist.rangoNuevoNombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(hist.createdAt)}
                          {hist.actor ? ` . ${hist.actor}` : ""}
                        </p>
                        {hist.motivo ? (
                          <p className="mt-1 text-xs text-muted-foreground">Motivo: {hist.motivo}</p>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-border/60 bg-card/80">
              <CardHeader>
                <CardTitle>Sin apostadores</CardTitle>
                <CardDescription>Ajusta los filtros o registra nuevas ventas.</CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}








