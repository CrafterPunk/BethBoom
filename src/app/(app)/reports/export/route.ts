import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { fetchReportData, type DateRange } from "@/lib/reporting";

function parseDateInput(value: string | null): Date | null {
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

function buildRange(fromDate: Date, toDate: Date): DateRange {
  const from = new Date(fromDate);
  from.setHours(0, 0, 0, 0);
  const to = new Date(toDate);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escaped = rows.map((row) =>
    row
      .map((value) => {
        const str = String(value ?? "");
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(','),
  );
  return [headers.join(','), ...escaped].join('\r\n');
}

export async function GET(request: Request) {
  await requireSession();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "franquicias";
  const format = searchParams.get("format") ?? "csv";
  const fromParam = parseDateInput(searchParams.get("from"));
  const toParam = parseDateInput(searchParams.get("to"));

  if (!fromParam || !toParam) {
    return NextResponse.json({ error: "Parametros invalidos" }, { status: 400 });
  }

  const range = buildRange(fromParam, toParam);
  const data = await fetchReportData(range);

  const fromTag = `${range.from.getFullYear()}${String(range.from.getMonth() + 1).padStart(2, '0')}${String(range.from.getDate()).padStart(2, '0')}`;
  const toTag = `${range.to.getFullYear()}${String(range.to.getMonth() + 1).padStart(2, '0')}${String(range.to.getDate()).padStart(2, '0')}`;

  if (format === "json") {
    const payload = type === "trabajadores" ? data.workers : type === "apostadores" ? data.bettors : data.franchises;
    return NextResponse.json({ type, from: range.from.toISOString(), to: range.to.toISOString(), rows: payload });
  }

  let csvContent = "";
  if (type === "trabajadores") {
    const headers = ["user_id", "nombre", "handle", "payout", "tickets", "hold"];
    const rows = data.workers.map((row) => [row.userId, row.nombre, row.handle, row.payout, row.tickets, row.hold.toFixed(2)]);
    csvContent = toCsv(headers, rows);
  } else if (type === "apostadores") {
    const headers = ["apostador_id", "alias", "handle", "payout", "tickets"];
    const rows = data.bettors.map((row) => [row.apostadorId, row.alias, row.handle, row.payout, row.tickets]);
    csvContent = toCsv(headers, rows);
  } else {
    const headers = ["franquicia_id", "nombre", "codigo", "handle", "payout", "tickets", "hold"];
    const rows = data.franchises.map((row) => [row.franquiciaId, row.nombre, row.codigo ?? '', row.handle, row.payout, row.tickets, row.hold.toFixed(2)]);
    csvContent = toCsv(headers, rows);
  }

  const filename = `reporte-${type}-${fromTag}-${toTag}.csv`;

  return new NextResponse(csvContent, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=${filename}`,
    },
  });
}
