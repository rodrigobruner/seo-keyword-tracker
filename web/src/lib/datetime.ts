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
