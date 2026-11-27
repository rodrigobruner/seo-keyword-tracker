import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientsApi, ApiError, type ClientSummary } from '../lib/api';
import styles from './AddClient.module.css';

const POLL_MS = 2000;
const SLOW_AFTER_MS = 120_000; // warn if a crawl hasn't finished in ~2min
const TERMINAL = new Set(['READY', 'FAILED']);

export default function AddClient() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const create = useMutation({
    mutationFn: () => clientsApi.create(name.trim(), websiteUrl.trim()),
    onSuccess: (client) => {
      setActiveId(client.id);
      setStartedAt(Date.now());
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  // Poll the client until the worker finishes the crawl (READY / FAILED).
  const status = useQuery({
    queryKey: ['client', activeId],
    queryFn: () => clientsApi.get(activeId as number),
    enabled: activeId != null,
    refetchInterval: (query) => {
      const s = query.state.data?.crawlStatus;
      return s && TERMINAL.has(s) ? false : POLL_MS;
    },
  });

  const client = status.data;
  const done = client != null && TERMINAL.has(client.crawlStatus);
  // Re-evaluated on each poll re-render; flags a crawl that's stuck (slow site or
  // worker offline) so the user isn't left staring at an endless spinner.
  const slow = startedAt != null && !done && Date.now() - startedAt > SLOW_AFTER_MS;

  // When a crawl finishes, the pages/list caches are stale — refresh once.
  useEffect(() => {
    if (done) void queryClient.invalidateQueries({ queryKey: ['pages'] });
  }, [done, queryClient]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.reset();
    create.mutate();
  }

  function reset() {
    setName('');
    setWebsiteUrl('');
    setActiveId(null);
    setStartedAt(null);
    create.reset();
  }

  const submitError =
    create.error instanceof ApiError ? create.error.message : create.isError ? 'Could not add client' : '';

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1>Add a client</h1>
        <p className={styles.sub}>
          Point the crawler at any website — we work out its blog pages from the URL alone.
        </p>
      </header>

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span>Client name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              disabled={activeId != null}
              required
            />
          </label>
          <label className={styles.field}>
            <span>Website URL</span>
            <input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="example.com"
              inputMode="url"
              disabled={activeId != null}
              required
            />
          </label>

          {submitError && <div className={styles.error}>{submitError}</div>}

          {activeId == null ? (
            <button className={styles.submit} type="submit" disabled={create.isPending}>
              {create.isPending ? 'Adding…' : 'Add client & crawl'}
            </button>
          ) : (
            <button className={styles.secondary} type="button" onClick={reset}>
              Add another client
            </button>
          )}
        </form>

        {activeId == null ? <HowItWorks /> : <CrawlStatus client={client} slow={slow} />}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    "We find the site's blog sitemap from the URL alone — no configuration.",
    'We crawl the first 15 blog posts, in the order the sitemap lists them.',
    'For each page we extract the likely keywords and detect SEO issues.',
  ];
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>How it works</h2>
      <ol className={styles.steps}>
        {steps.map((text, i) => (
          <li key={i}>
            <span className={styles.stepNum}>{i + 1}</span>
            <span>{text}</span>
          </li>
        ))}
      </ol>
      <p className={styles.tip}>
        Any blog URL works — try <code>semrush.com</code> or <code>yoast.com</code>. No rank
        snapshots are created here; those come from the scheduled seed.
      </p>
    </div>
  );
}

function CrawlStatus({ client, slow }: { client: ClientSummary | undefined; slow: boolean }) {
  if (!client) {
    return (
      <div className={styles.card}>
        <div className={styles.state}>Starting crawl…</div>
      </div>
    );
  }

  const { crawlStatus, pagesDone, pagesTotal, crawlError, pageCount } = client;
  const pct = pagesTotal && pagesTotal > 0 ? Math.round((pagesDone / pagesTotal) * 100) : null;

  return (
    <div className={styles.card}>
      <div className={styles.statusHead}>
        <h2 className={styles.cardTitle}>{client.name}</h2>
        <span className={`${styles.badge} ${styles[`st-${crawlStatus}`]}`}>{crawlStatus}</span>
      </div>
      <div className={styles.host}>{client.host}</div>

      {crawlStatus === 'FAILED' ? (
        <div className={styles.error}>{crawlError ?? 'Crawl failed.'}</div>
      ) : crawlStatus === 'READY' ? (
        <>
          <p className={styles.ok}>Crawled {pageCount} pages.</p>
          <Link className={styles.submit} to={`/pages?clientId=${client.id}`}>
            View pages
          </Link>
        </>
      ) : (
        <>
          <div className={styles.progressRow}>
            <span>
              {pagesDone}
              {pagesTotal != null ? ` / ${pagesTotal}` : ''} pages
            </span>
            {pct != null && <span>{pct}%</span>}
          </div>
          <div className={styles.track}>
            <div
              className={styles.bar}
              style={{ width: pct != null ? `${pct}%` : '15%' }}
              data-indeterminate={pct == null}
            />
          </div>
          {slow && (
            <p className={styles.slow}>
              This is taking longer than usual. The site may be slow, or the crawl worker may be
              offline. We&apos;ll keep checking.
            </p>
          )}
        </>
      )}
    </div>
  );
}
