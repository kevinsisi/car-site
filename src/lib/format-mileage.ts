export function formatMileage(value: string): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d[\d,]*(?:\.\d+)?)\s*(km)?$/i);
  if (!match) return value;
  const amount = Number(match[1].replaceAll(',', ''));
  if (!Number.isFinite(amount)) return value;
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount)}\u00a0km`;
}
