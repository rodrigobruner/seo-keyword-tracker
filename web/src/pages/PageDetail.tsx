import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { pagesApi, type KeywordSeries } from '../lib/api';
import { formatDateShort, formatDateLong, torontoYmd, torontoMidnightUtcIso } from '../lib/datetime';
import { readToken, seriesColor } from '../lib/theme';
import { SegmentedControl } from '../components/SegmentedControl';
import { EmptyState } from '../components/EmptyState';
import { ChartIcon, CheckIcon } from '../components/icons';
import styles from './PageDetail.module.css';

const MAX_SERIES = 8; // keep the chart/table legible
const KEYWORDS_PREVIEW = 8; // show this many before "Show all"
const SEVERITY_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
const DAY_MS = 86_400_000;

type View = 'chart' | 'table';

// Rank-history windows the user can pick. Presets use `days` back from now
// ('all' = full history); 'custom' reveals from/to date pickers.
type RangeKey = '90d' | '6m' | '1y' | 'all' | 'custom';
const RANGES: { value: RangeKey; label: string; days: number | null }[] = [
  { value: '90d', label: '90 days', days: 90 },
  { value: '6m', label: '6 months', days: 180 },
  { value: '1y', label: '1 year', days: 365 },
  { value: 'all', label: 'All', days: null },
  { value: 'custom', label: 'Custom', days: null },
];

export default function PageDetail() {
  const { id: rawId } = useParams();
  const id = Number(rawId);
  const [view, setView] = useState<View>('chart');
  const [showAllKeywords, setShowAllKeywords] = useState(false);
  const [showAllSeries, setShowAllSeries] = useState(false);
  const [range, setRange] = useState<RangeKey>('90d');
  const today = torontoYmd();
  const [customFrom, setCustomFrom] = useState(() => torontoYmd(new Date(Date.now() - 90 * DAY_MS)));
  const [customTo, setCustomTo] = useState(today);

  // Resolve the picked window to a UTC range. Presets set `from` back from now
  // (the API defaults `to` to now). Custom reads each <input type=date> as a
  // Toronto calendar day and converts to UTC; the end is made inclusive by taking
  // the start of the day after `to`.
  const customValid = range !== 'custom' || (!!customFrom && !!customTo && customFrom <= customTo);
  let fromIso: string | undefined;
  let toIso: string | undefined;
  if (range === 'custom') {
    fromIso = customFrom ? torontoMidnightUtcIso(customFrom) : undefined;
    toIso = customTo ? torontoMidnightUtcIso(customTo, 1) : undefined;
  } else {
    const days = RANGES.find((r) => r.value === range)?.days ?? null;
    fromIso = days == null ? new Date(0).toISOString() : new Date(Date.now() - days * DAY_MS).toISOString();
  }

  const detail = useQuery({
    queryKey: ['page', id],
    queryFn: () => pagesApi.detail(id),
    enabled: Number.isInteger(id) && id > 0,
  });
  const snapshots = useQuery({
    queryKey: ['snapshots', id, range, range === 'custom' ? `${customFrom}:${customTo}` : ''],
    queryFn: () => pagesApi.snapshots(id, fromIso, toIso),
    enabled: Number.isInteger(id) && id > 0 && customValid,
  });

  const allSeries = snapshots.data?.series ?? [];
  const chartSeries = allSeries.slice(0, MAX_SERIES); // chart stays readable (top N)
  const tableSeries = showAllSeries ? allSeries : allSeries.slice(0, MAX_SERIES);

  if (detail.isLoading) return <div className={styles.state}>Loading…</div>;
  if (detail.isError || !detail.data) {
    return (
      <div className={styles.state}>
        Page not found. <Link to="/pages">Back to pages</Link>
      </div>
    );
  }

  const page = detail.data;
  const sortedIssues = [...page.issues].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  return (
    <div className={styles.screen}>
      <Link to="/pages" className={styles.back}>
        ‹ Pages
      </Link>

      <header className={styles.header}>
        <h1 className={styles.title}>{page.title ?? page.url}</h1>
        <a className={styles.url} href={page.url} target="_blank" rel="noopener noreferrer">
          {page.url} ↗
        </a>
        <div className={styles.meta}>
          <span className={styles.client}>{page.clientName}</span>
          {page.wordCount != null && <span>· {page.wordCount} words</span>}
        </div>
      </header>

      <div className={styles.grid}>
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Likely keywords</h2>
          {page.keywords.length === 0 ? (
            <p className={styles.empty}>No keywords extracted.</p>
          ) : (
            <>
              <ul className={styles.keywords}>
                {(showAllKeywords ? page.keywords : page.keywords.slice(0, KEYWORDS_PREVIEW)).map(
                  (k) => (
                    <li key={k.text} className={styles.keyword}>
                      <span>{k.text}</span>
                      <span className={styles.relevance}>{k.relevance.toFixed(2)}</span>
                    </li>
                  ),
                )}
              </ul>
              {page.keywords.length > KEYWORDS_PREVIEW && (
                <button className={styles.showMore} onClick={() => setShowAllKeywords((v) => !v)}>
                  {showAllKeywords ? 'Show less' : `Show all ${page.keywords.length}`}
                </button>
              )}
            </>
          )}
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>
            SEO issues {page.issues.length > 0 && <span className={styles.count}>{page.issues.length}</span>}
          </h2>
          {sortedIssues.length === 0 ? (
            <EmptyState
              tone="success"
              icon={<CheckIcon />}
              title="Great job!"
              description="No SEO issues found on this page."
            />
          ) : (
            <ul className={styles.issues}>
              {sortedIssues.map((issue) => (
                <li key={issue.code} className={styles.issue}>
                  <span className={`${styles.sevPill} ${styles[`sev-${issue.severity}`]}`}>
                    {issue.severity}
                  </span>
                  <div>
                    <div className={styles.issueMsg}>{issue.message}</div>
                    <code className={styles.issueCode}>{issue.code}</code>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className={styles.card}>
        <div className={styles.historyHead}>
          <h2 className={styles.cardTitle}>Rank history</h2>
          <div className={styles.historyControls}>
            <SegmentedControl<RangeKey>
              ariaLabel="Date range"
              value={range}
              onChange={setRange}
              segments={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            />
            <SegmentedControl<View>
              ariaLabel="Rank history view"
              value={view}
              onChange={setView}
              segments={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
          </div>
        </div>
        {range === 'custom' && (
          <div className={styles.customRange}>
            <label className={styles.dateField}>
              <span>From</span>
              <input
                type="date"
                value={customFrom}
                max={customTo || today}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
            </label>
            <label className={styles.dateField}>
              <span>To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom}
                max={today}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </label>
          </div>
        )}
        {!customValid ? (
          <p className={styles.empty}>Pick a start and end date (start on or before end).</p>
        ) : snapshots.isLoading ? (
          <div className={styles.state}>Loading history…</div>
        ) : allSeries.length === 0 ? (
          <EmptyState
            icon={<ChartIcon />}
            title="No rank history"
            description="No snapshots for this page in the selected range. Try a wider range."
          />
        ) : view === 'chart' ? (
          <>
            <RankChart series={chartSeries} />
            {allSeries.length > MAX_SERIES && (
              <p className={styles.chartNote}>
                Showing the top {MAX_SERIES} keywords. Switch to Table to see all{' '}
                {allSeries.length}.
              </p>
            )}
          </>
        ) : (
          <>
            <RankTable series={tableSeries} />
            {allSeries.length > MAX_SERIES && (
              <button className={styles.showMore} onClick={() => setShowAllSeries((v) => !v)}>
                {showAllSeries ? `Show top ${MAX_SERIES}` : `Show all ${allSeries.length} keywords`}
              </button>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** Merge per-keyword series into one row-per-date dataset for Recharts. */
function useMergedChartData(series: KeywordSeries[]) {
  return useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    let max = 1;
    for (const s of series) {
      for (const p of s.points) {
        const row = byDate.get(p.capturedAt) ?? { capturedAt: p.capturedAt };
        row[s.keyword] = p.position;
        byDate.set(p.capturedAt, row);
        if (p.position > max) max = p.position;
      }
    }
    const rows = [...byDate.values()].sort((a, b) =>
      String(a.capturedAt).localeCompare(String(b.capturedAt)),
    );
    return { rows, max };
  }, [series]);
}

function RankChart({ series }: { series: KeywordSeries[] }) {
  const { rows, max } = useMergedChartData(series);
  const grid = readToken('--chart-grid');
  const axis = readToken('--chart-axis');

  return (
    <div className={styles.chartWrap}>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="capturedAt"
            tickFormatter={formatDateShort}
            stroke={axis}
            fontSize={12}
            minTickGap={32}
          />
          {/* Lower position = better, so invert the axis (rank 1 on top). */}
          <YAxis
            reversed
            domain={[1, Math.max(10, Math.ceil(max / 10) * 10)]}
            allowDecimals={false}
            stroke={axis}
            fontSize={12}
            width={32}
          />
          <Tooltip
            labelFormatter={(v) => formatDateLong(String(v))}
            formatter={(value, name) => [`#${value}`, name]}
          />
          <Legend />
          {series.map((s, i) => (
            <Line
              key={s.keyword}
              type="monotone"
              dataKey={s.keyword}
              stroke={seriesColor(i)}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RankTable({ series }: { series: KeywordSeries[] }) {
  const rows = series.map((s) => {
    const positions = s.points.map((p) => p.position);
    const current = positions[positions.length - 1] ?? null;
    const first = positions[0] ?? null;
    const best = positions.length ? Math.min(...positions) : null;
    // Lower is better → improvement = first - current (positive = moved up).
    const change = first != null && current != null ? first - current : 0;
    return { keyword: s.keyword, current, best, change };
  });

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Keyword</th>
          <th className={styles.num}>Current</th>
          <th className={styles.num}>Best</th>
          <th className={styles.num}>Change</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.keyword}>
            <td>{r.keyword}</td>
            <td className={styles.num}>{r.current != null ? `#${r.current}` : '—'}</td>
            <td className={styles.num}>{r.best != null ? `#${r.best}` : '—'}</td>
            <td className={styles.num}>
              {r.change === 0 ? (
                '—'
              ) : (
                <span className={r.change > 0 ? styles.up : styles.down}>
                  {r.change > 0 ? `▲ ${r.change}` : `▼ ${Math.abs(r.change)}`}
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
