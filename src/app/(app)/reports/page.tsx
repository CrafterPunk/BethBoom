import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";

import { fetchReportData, type DateRange } from "@/lib/reporting";

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null;
  const parts = value.split("-");
  if (parts.length !== 3) return null;
  const [yearStr, monthStr, dayStr] = parts;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRange(fromDate: Date, toDate: Date): DateRange {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toDate);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: { from?: string; to?: string };
}) {
  await requireSession();

  const now = new Date();
  const defaultTo = new Date(now);
  defaultTo.setHours(23, 59, 59, 999);
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 6);
  defaultFrom.setHours(0, 0, 0, 0);

  const paramFrom = parseDateInput(searchParams?.from) ?? defaultFrom;
  const paramTo = parseDateInput(searchParams?.to) ?? defaultTo;

  const range = buildRange(paramFrom, paramTo);
  const data = await fetchReportData(range);

  const fromInput = formatInputDate(range.from);
  const toInput = formatInputDate(range.to);

  const exportBase = new URLSearchParams({ from: fromInput, to: toInput });

  return (
    <section className="space-y-8 py-8">
      <Card className="border-border/60 bg-card/80">
        <CardHeader>
          <CardTitle>Reportes operativos</CardTitle>
          <CardDescription>Filtra por rango de fechas y exporta los datos en CSV o JSON.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action="/reports" method="get" className="grid gap-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:items-end">
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground" htmlFor="from">
                Desde
              </label>
              <input
                id="from"
                name="from"
                type="date"
                defaultValue={fromInput}
                className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-muted-foreground" htmlFor="to">
                Hasta
              </label>
              <input
                id="to"
                name="to"
                type="date"
                defaultValue={toInput}
                className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background/60 px-3 text-sm text-foreground"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                Actualizar
              </button>
              <Link
                href="/reports"
                className="mt-6 inline-flex h-10 items-center justify-center rounded-md border border-border/60 px-4 text-sm font-medium text-muted-foreground transition hover:bg-muted"
              >
                Reset
              </Link>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Intervalo seleccionado: {fromInput} a {toInput} (inclusive).
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Por franquicia</CardTitle>
            <CardDescription>Resumen de ventas y pagos por sede.</CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "franquicias", format: "csv" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              CSV
            </Link>
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "franquicias", format: "json" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              JSON
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Franquicia</th>
                <th className="py-2 pr-4">Codigo</th>
                <th className="py-2 pr-4">Handle</th>
                <th className="py-2 pr-4">Payout</th>
                <th className="py-2 pr-4">Tickets</th>
                <th className="py-2 pr-4">Hold</th>
              </tr>
            </thead>
            <tbody>
              {data.franchises.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    No hay registros en el intervalo seleccionado.
                  </td>
                </tr>
              ) : (
                data.franchises.map((row) => (
                  <tr key={row.franquiciaId} className="border-b border-border/20">
                    <td className="py-3 pr-4 text-foreground">{row.nombre}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{row.codigo ?? '-'}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.handle)}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.payout)}</td>
                    <td className="py-3 pr-4">{row.tickets.toLocaleString()}</td>
                    <td className="py-3 pr-4">{formatPercent(row.hold)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Por trabajador</CardTitle>
            <CardDescription>Volumen operado por usuario con caja.</CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "trabajadores", format: "csv" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              CSV
            </Link>
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "trabajadores", format: "json" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              JSON
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Trabajador</th>
                <th className="py-2 pr-4">Handle</th>
                <th className="py-2 pr-4">Payout</th>
                <th className="py-2 pr-4">Tickets</th>
                <th className="py-2 pr-4">Hold</th>
              </tr>
            </thead>
            <tbody>
              {data.workers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                    No hay registros en el intervalo seleccionado.
                  </td>
                </tr>
              ) : (
                data.workers.map((row) => (
                  <tr key={row.userId} className="border-b border-border/20">
                    <td className="py-3 pr-4 text-foreground">{row.nombre}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.handle)}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.payout)}</td>
                    <td className="py-3 pr-4">{row.tickets.toLocaleString()}</td>
                    <td className="py-3 pr-4">{formatPercent(row.hold)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/80">
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Top apostadores</CardTitle>
            <CardDescription>Alias con mayor volumen de ventas en el periodo.</CardDescription>
          </div>
          <div className="flex gap-2 text-xs">
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "apostadores", format: "csv" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              CSV
            </Link>
            <Link
              href={`/reports/export?${new URLSearchParams({ ...Object.fromEntries(exportBase), type: "apostadores", format: "json" })}`}
              className="rounded border border-border/60 px-3 py-1 text-foreground transition hover:bg-muted"
            >
              JSON
            </Link>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Alias</th>
                <th className="py-2 pr-4">Handle</th>
                <th className="py-2 pr-4">Payout</th>
                <th className="py-2 pr-4">Tickets</th>
              </tr>
            </thead>
            <tbody>
              {data.bettors.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No hay registros en el intervalo seleccionado.
                  </td>
                </tr>
              ) : (
                data.bettors.map((row) => (
                  <tr key={row.apostadorId} className="border-b border-border/20">
                    <td className="py-3 pr-4 text-foreground">{row.alias}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.handle)}</td>
                    <td className="py-3 pr-4">{formatCurrency(row.payout)}</td>
                    <td className="py-3 pr-4">{row.tickets.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
