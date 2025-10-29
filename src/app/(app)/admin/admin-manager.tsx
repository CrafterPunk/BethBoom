"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  createUserAction,
  purgeAuditLogsAction,
  saveFranquiciaAction,
  saveParametroAction,
  setUserStatusAction,
} from "./actions";

const roleLabels: Record<string, string> = {
  ADMIN_GENERAL: "Admin",
  TRABAJADOR: "Trabajador",
  MARKET_MAKER: "Market Maker",
  AUDITOR_GENERAL: "Auditor",
  AUDITOR_FRANQUICIA: "Auditor Sede",
};

const statusLabels: Record<string, string> = {
  ACTIVE: "Activo",
  INACTIVE: "Inactivo",
};

type MessageState = {
  content: string;
  variant: "success" | "error";
};

type FranchiseRow = {
  id: string;
  nombre: string;
  codigo: string;
  share: number;
  activa: boolean;
};

type UserRow = {
  id: string;
  displayName: string;
  role: string;
  estado: string;
  franquiciaNombre: string | null;
  auditorFranquiciaNombre: string | null;
};

type ParametroRow = {
  id: string;
  clave: string;
  descripcion: string | null;
  valor: string;
};

type AdminManagerProps = {
  data: {
    franquicias: FranchiseRow[];
    users: UserRow[];
    parametros: ParametroRow[];
    totalLogs: number;
    latestLog: string | null;
  };
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function AdminManager({ data }: AdminManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [franchiseMessage, setFranchiseMessage] = useState<MessageState | null>(null);
  const [userMessage, setUserMessage] = useState<MessageState | null>(null);
  const [paramMessage, setParamMessage] = useState<MessageState | null>(null);
  const [logMessage, setLogMessage] = useState<MessageState | null>(null);

  const handleCreateFranquicia = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nombre = (formData.get("nombre") ?? "").toString().trim();
    const codigo = (formData.get("codigo") ?? "").toString().trim();
    const share = Number(formData.get("share"));

    setFranchiseMessage(null);
    startTransition(async () => {
      const result = await saveFranquiciaAction({ nombre, codigo, share, activa: true });
      if (result.ok) {
        form.reset();
        setFranchiseMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setFranchiseMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const handleUpdateFranquicia = (franquicia: FranchiseRow, payload: Partial<FranchiseRow>) => {
    setFranchiseMessage(null);
    startTransition(async () => {
      const result = await saveFranquiciaAction({
        id: franquicia.id,
        nombre: payload.nombre ?? franquicia.nombre,
        codigo: payload.codigo ?? franquicia.codigo,
        share: payload.share ?? franquicia.share,
        activa: payload.activa ?? franquicia.activa,
      });
      if (result.ok) {
        setFranchiseMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setFranchiseMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const handleCreateUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const displayName = (formData.get("displayName") ?? "").toString().trim();
    const role = (formData.get("role") ?? "TRABAJADOR").toString();
    const accessCode = (formData.get("accessCode") ?? "").toString().trim();
    const franquiciaId = (formData.get("franquiciaId") ?? "").toString() || undefined;
    const auditorFranquiciaId = (formData.get("auditorFranquiciaId") ?? "").toString() || undefined;

    setUserMessage(null);
    startTransition(async () => {
      const result = await createUserAction({ displayName, role, accessCode, franquiciaId, auditorFranquiciaId });
      if (result.ok) {
        form.reset();
        setUserMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setUserMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const handleToggleUserStatus = (user: UserRow) => {
    const nextStatus = user.estado === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setUserMessage(null);
    startTransition(async () => {
      const result = await setUserStatusAction({ userId: user.id, estado: nextStatus });
      if (result.ok) {
        setUserMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setUserMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const handleSaveParametro = (event: React.FormEvent<HTMLFormElement>, clave: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const valor = (formData.get("valor") ?? "").toString();
    const descripcion = (formData.get("descripcion") ?? "").toString() || undefined;

    setParamMessage(null);
    startTransition(async () => {
      const result = await saveParametroAction({ clave, valor, descripcion });
      if (result.ok) {
        setParamMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setParamMessage({ content: result.message, variant: "error" });
      }
    });
  };

  const handlePurgeLogs = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const beforeRaw = (formData.get("before") ?? "").toString();
    if (!beforeRaw) {
      setLogMessage({ content: "Selecciona una fecha", variant: "error" });
      return;
    }
    const parsed = new Date(beforeRaw);
    if (Number.isNaN(parsed.getTime())) {
      setLogMessage({ content: "Fecha invalida", variant: "error" });
      return;
    }

    setLogMessage(null);
    startTransition(async () => {
      const result = await purgeAuditLogsAction({ before: parsed.toISOString() });
      if (result.ok) {
        setLogMessage({ content: result.message, variant: "success" });
        router.refresh();
      } else {
        setLogMessage({ content: result.message, variant: "error" });
      }
    });
  };

  return (
    <section className="space-y-8 py-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Sedes</CardTitle>
          <CardDescription>Administra franquicias y porcentajes por defecto.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleCreateFranquicia} className="grid gap-4 md:grid-cols-[repeat(4,minmax(0,1fr))]">
            <div>
              <Label htmlFor="nombre">Nombre</Label>
              <Input id="nombre" name="nombre" required minLength={3} placeholder="Nombre" />
            </div>
            <div>
              <Label htmlFor="codigo">Codigo</Label>
              <Input id="codigo" name="codigo" required minLength={2} maxLength={10} placeholder="HQ" />
            </div>
            <div>
              <Label htmlFor="share">Share %</Label>
              <Input id="share" name="share" type="number" min={0} max={100} step={1} defaultValue={50} />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={pending} className="w-full">
                Crear sede
              </Button>
            </div>
          </form>
          {franchiseMessage ? (
            <p
              className={cn(
                "text-sm",
                franchiseMessage.variant === "success" ? "text-emerald-400" : "text-destructive",
              )}
            >
              {franchiseMessage.content}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Codigo</th>
                  <th className="py-2 pr-4">Share %</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.franquicias.map((franquicia) => (
                  <tr key={franquicia.id} className="border-b border-border/20">
                    <td className="py-3 pr-4 text-foreground">{franquicia.nombre}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{franquicia.codigo}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <Input
                          defaultValue={franquicia.share}
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className="h-9 w-24"
                          disabled={pending}
                          onBlur={(event) => handleUpdateFranquicia(franquicia, { share: Number(event.target.value) })}
                        />
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-xs font-semibold">
                      {franquicia.activa ? "Activa" : "Inactiva"}
                    </td>
                    <td className="py-3 pl-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => handleUpdateFranquicia(franquicia, { activa: !franquicia.activa })}
                        >
                          {franquicia.activa ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
          <CardDescription>Genera nuevos AccessCodes y controla estados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-[repeat(4,minmax(0,1fr))]">
            <div>
              <Label htmlFor="displayName">Nombre</Label>
              <Input id="displayName" name="displayName" required minLength={3} placeholder="Nuevo usuario" />
            </div>
            <div>
              <Label htmlFor="role">Rol</Label>
              <select
                id="role"
                name="role"
              className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
            >
              <option value="TRABAJADOR">Trabajador</option>
              <option value="ADMIN_GENERAL">Admin</option>
              <option value="MARKET_MAKER">Market Maker</option>
              <option value="AUDITOR_GENERAL">Auditor General</option>
              <option value="AUDITOR_FRANQUICIA">Auditor Sede</option>
            </select>
            </div>
            <div>
              <Label htmlFor="accessCode">AccessCode</Label>
              <Input id="accessCode" name="accessCode" required minLength={6} placeholder="sell-HQ-0000" />
            </div>
            <div className="grid gap-2">
              <div>
                <Label htmlFor="franquiciaId">Franquicia (trabajador)</Label>
                <select
                  id="franquiciaId"
                  name="franquiciaId"
                  className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">--</option>
                  {data.franquicias.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="auditorFranquiciaId">Franquicia auditor</Label>
                <select
                  id="auditorFranquiciaId"
                  name="auditorFranquiciaId"
                  className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm"
                  defaultValue=""
                >
                  <option value="">--</option>
                  {data.franquicias.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nombre}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={pending}>
                Crear usuario
              </Button>
            </div>
          </form>
          {userMessage ? (
            <p
              className={cn(
                "text-sm",
                userMessage.variant === "success" ? "text-emerald-400" : "text-destructive",
              )}
            >
              {userMessage.content}
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-4">Nombre</th>
                  <th className="py-2 pr-4">Rol</th>
                  <th className="py-2 pr-4">Estado</th>
                  <th className="py-2 pr-4">Franquicia</th>
                  <th className="py-2 pr-4">Auditor de</th>
                  <th className="py-2 pr-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => (
                  <tr key={user.id} className="border-b border-border/20">
                    <td className="py-3 pr-4 text-foreground">{user.displayName}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{roleLabels[user.role] ?? user.role}</td>
                    <td className="py-3 pr-4 text-xs font-semibold">{statusLabels[user.estado] ?? user.estado}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{user.franquiciaNombre ?? "-"}</td>
                    <td className="py-3 pr-4 text-xs text-muted-foreground">{user.auditorFranquiciaNombre ?? "-"}</td>
                    <td className="py-3 pl-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => handleToggleUserStatus(user)}
                      >
                        {user.estado === "ACTIVE" ? "Suspender" : "Activar"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Parametros globales</CardTitle>
          <CardDescription>Actualiza configuraciones sin desplegar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {paramMessage ? (
            <p
              className={cn(
                "text-sm",
                paramMessage.variant === "success" ? "text-emerald-400" : "text-destructive",
              )}
            >
              {paramMessage.content}
            </p>
          ) : null}
          {data.parametros.map((parametro) => (
            <form
              key={parametro.id}
              onSubmit={(event) => handleSaveParametro(event, parametro.clave)}
              className="rounded-lg border border-border/30 bg-background/50 p-4"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{parametro.clave}</p>
                  <Input
                    name="descripcion"
                    defaultValue={parametro.descripcion ?? ""}
                    placeholder="Descripcion"
                    className="mt-2"
                  />
                  <textarea
                    name="valor"
                    defaultValue={parametro.valor}
                    rows={3}
                    className="mt-2 w-full rounded-md border border-border/60 bg-background/60 p-3 text-sm text-foreground"
                  />
                </div>
                <div className="mt-3 md:mt-0 md:w-32">
                  <Button type="submit" disabled={pending} className="w-full">
                    Guardar
                  </Button>
                </div>
              </div>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Auditoria</CardTitle>
          <CardDescription>Resumen de logs y herramientas de limpieza.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded border border-border/30 bg-background/60 p-4 text-sm">
            <p>Total de logs: <span className="font-semibold text-foreground">{data.totalLogs.toLocaleString()}</span></p>
            <p className="mt-1 text-muted-foreground">Ultimo log: {formatDateTime(data.latestLog)}</p>
          </div>
          {logMessage ? (
            <p
              className={cn(
                "text-sm",
                logMessage.variant === "success" ? "text-emerald-400" : "text-destructive",
              )}
            >
              {logMessage.content}
            </p>
          ) : null}
          <form onSubmit={handlePurgeLogs} className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1">
              <Label htmlFor="before">Eliminar logs previos a</Label>
              <input
                id="before"
                name="before"
                type="datetime-local"
                className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground"
                required
              />
            </div>
            <Button type="submit" variant="destructive" disabled={pending}>
              Purge
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">Gestion detallada disponible en la seccion Auditoria.</p>
        </CardContent>
      </Card>
    </section>
  );
}
