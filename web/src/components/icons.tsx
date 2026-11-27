// Minimal line icons for empty states. Stroke uses currentColor so they inherit
// the surrounding text colour (no hardcoded hex).
const common = {
  width: 40,
  height: 40,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function PagesIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M8 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2" />
      <path d="M14 3h4a2 2 0 0 1 2 2v10" />
      <path d="M8 8h6M8 12h6M8 16h3" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export function ChartIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <path d="M4 4v16h16" />
      <path d="m7 14 3-3 3 2 4-5" />
    </svg>
  );
}

export function AlertIcon() {
  return (
    <svg {...common} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}
