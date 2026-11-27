/** Parse a route `:id` param to a positive integer, or null if invalid. */
export function parseId(raw: string | undefined): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}
