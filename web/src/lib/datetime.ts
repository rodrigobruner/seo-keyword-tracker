// Snapshots are stored in UTC; the user is in Toronto (per the brief).
// All display formatting converts to America/Toronto here, in one place.
const TZ = 'America/Toronto';

const shortDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  month: 'short',
  day: 'numeric',
});

const longDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** "Nov 25" — compact axis/table label in Toronto time. */
export function formatDateShort(iso: string): string {
  return shortDate.format(new Date(iso));
}

/** "Nov 25, 2026" — full date in Toronto time. */
export function formatDateLong(iso: string): string {
  return longDate.format(new Date(iso));
}

// ---- Toronto calendar date <-> UTC (for the custom range picker) ----

const ymd = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** A UTC instant → the Toronto calendar day as "YYYY-MM-DD" (for <input type=date>). */
export function torontoYmd(date: Date = new Date()): string {
  return ymd.format(date); // en-CA renders YYYY-MM-DD
}

/** Offset (ms) that America/Toronto is ahead of UTC at a given UTC instant. */
function torontoOffsetMs(utcMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const hour = get('hour') % 24; // en-US can render midnight as 24
  const asIfUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asIfUtc - utcMs; // negative for Toronto (behind UTC)
}

/**
 * Interpret a "YYYY-MM-DD" (a Toronto calendar day) as midnight in Toronto and
 * return the matching UTC ISO string. `dayOffset` shifts by whole days — pass 1
 * for an exclusive, end-inclusive range upper bound. DST-aware.
 */
export function torontoMidnightUtcIso(dateStr: string, dayOffset = 0): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + dayOffset, 0, 0, 0);
  const offset = torontoOffsetMs(guess);
  return new Date(guess - offset).toISOString();
}
