const HOURS_PER_YEAR = 8760;

/** Availability as a percentage string with adaptive precision. */
export function formatPercent(a: number): string {
  if (!Number.isFinite(a)) return '—';
  const pct = a * 100;
  let digits = 2;
  if (a >= 0.9999) digits = 4;
  else if (a >= 0.999) digits = 3;
  return `${pct.toFixed(digits)}%`;
}

/** Annual downtime implied by an availability, in human units. */
export function downtimePerYear(a: number): string {
  const hours = (1 - a) * HOURS_PER_YEAR;
  if (hours <= 0) return '0';
  if (hours < 1 / 60) return `${(hours * 3600).toFixed(0)} s/yr`;
  if (hours < 1) return `${(hours * 60).toFixed(0)} min/yr`;
  if (hours < 48) return `${hours.toFixed(1)} h/yr`;
  return `${(hours / 24).toFixed(1)} d/yr`;
}

export function formatHours(hours: number): string {
  if (hours <= 0) return '0';
  if (hours < 1) return `${(hours * 60).toFixed(0)} min`;
  if (hours < 72) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

/** Color for an availability value on a green -> red scale. */
export function availabilityColor(a: number): string {
  if (!Number.isFinite(a)) return '#94a3b8';
  if (a >= 0.9995) return '#16a34a';
  if (a >= 0.999) return '#65a30d';
  if (a >= 0.995) return '#ca8a04';
  if (a >= 0.98) return '#ea580c';
  return '#dc2626';
}

/** Approximate "number of nines". */
export function nines(a: number): string {
  if (a >= 1) return '∞';
  const n = -Math.log10(1 - a);
  return n.toFixed(1);
}
