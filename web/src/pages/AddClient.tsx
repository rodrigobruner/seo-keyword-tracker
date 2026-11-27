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

  // When a crawl finishes, the pages list and the clients list (status/page
  // count) are stale — refresh both once.
  useEffect(() => {
    if (done) {
      void queryClient.invalidateQueries({ queryKey: ['pages'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    }
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
        <h1>Clients</h1>
        <p className={styles.sub}>
          Point the crawler at any website and we'll work out its blog pages from the URL alone.
        </p>
      </header>

      <div className={styles.grid}>
        <form className={styles.card} onSubmit={onSubmit}>
          <h2 className={styles.cardTitle}>Add a client</h2>
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

      <ClientsList />
    </div>
  );
}

function ClientsList() {
  const queryClient = useQueryClient();
  const clients = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const remove = useMutation({
    mutationFn: (id: number) => clientsApi.remove(id),
    onSuccess: () => {
      setConfirmId(null);
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      void queryClient.invalidateQueries({ queryKey: ['pages'] });
    },
  });

  const items = clients.data?.items ?? [];
  if (items.length === 0) return null; // nothing to manage yet

  return (
    <section className={styles.listCard}>
      <h2 className={styles.cardTitle}>Your clients</h2>
      <ul className={styles.clientList}>
        {items.map((c) => (
          <li key={c.id} className={styles.clientRow}>
            <div className={styles.clientMain}>
              <span className={styles.clientName}>{c.name}</span>
              <span className={styles.clientHost}>{c.host}</span>
            </div>
            <span className={`${styles.badge} ${styles[`st-${c.crawlStatus}`]}`}>{c.crawlStatus}</span>
            <span className={styles.clientPages}>{c.pageCount} pages</span>
            <Link className={styles.viewLink} to={`/pages?clientId=${c.id}`}>
              View
            </Link>
            {confirmId === c.id ? (
              <span className={styles.confirm}>
                <button
                  className={styles.confirmYes}
                  onClick={() => remove.mutate(c.id)}
                  disabled={remove.isPending}
                >
                  {remove.isPending ? 'Deleting…' : 'Confirm'}
                </button>
                <button className={styles.confirmNo} onClick={() => setConfirmId(null)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button
                className={styles.deleteBtn}
                onClick={() => setConfirmId(c.id)}
                aria-label={`Delete ${c.name}`}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      {remove.isError && (
        <div className={styles.error}>Could not delete the client. Please try again.</div>
      )}
    </section>
  );
}

function HowItWorks() {
  const steps = [
    "We find the site's blog sitemap from the URL alone, with no configuration.",
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
        Works with any website that has a blog. Just paste its URL above. Crawling runs in the
        background, and your client appears in the list below when it&apos;s ready.
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
