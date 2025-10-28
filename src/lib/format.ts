const currencyFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | bigint): string {
  if (value === null || value === undefined) {
    return "0";
  }
  const numeric = typeof value === "bigint" ? Number(value) : value;
  return currencyFormatter.format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatCurrencyFromDigits(digits: string): string {
  if (!digits) {
    return "";
  }
  const normalized = Number.parseInt(digits, 10);
  if (Number.isNaN(normalized)) {
    return "";
  }
  return currencyFormatter.format(normalized);
}

export function digitsFromCurrencyInput(value: string): string {
  return value.replace(/[^0-9]/g, "");
}

export function parseDigitsAmount(value: string): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) {
    return "Sin fecha de cierre";
  }
  if (ms <= 0) {
    return "Cierre vencido";
  }
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s restantes`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s restantes`;
  }
  return `${seconds}s restantes`;
}

export function caretIndexFromDigits(formattedValue: string, digitsBeforeCaret: number): number {
  if (digitsBeforeCaret <= 0) {
    return 0;
  }
  let digitsSeen = 0;
  for (let index = 0; index < formattedValue.length; index += 1) {
    if (/\d/.test(formattedValue[index])) {
      digitsSeen += 1;
      if (digitsSeen === digitsBeforeCaret) {
        return index + 1;
      }
    }
  }
  return formattedValue.length;
}

export function countDigitsUntil(value: string, caretIndex: number): number {
  if (caretIndex <= 0) {
    return 0;
  }
  const slice = value.slice(0, caretIndex);
  return digitsFromCurrencyInput(slice).length;
}
export function formatDeltaMessage(delta: number): string {
  if (delta > 0) {
    return `Debes ENVIAR $${formatCurrency(delta)} a HQ`;
  }
  if (delta < 0) {
    return `Debemos DEVOLVERTE $${formatCurrency(Math.abs(delta))}`;
  }
  return "Balanceado, sin transferencias.";
}

