import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clientsApi, pagesApi, type PagesQuery } from '../lib/api';
import { EmptyState } from '../components/EmptyState';
import { PagesIcon, SearchIcon } from '../components/icons';
import styles from './PagesScreen.module.css';

const PAGE_SIZE = 20;

export default function PagesScreen() {
  const [params, setSearchParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const clientId = params.get('clientId') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1'));

  const [searchInput, setSearchInput] = useState(q);

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.delete('page'); // filter change → back to page 1
        return next;
      });
    },
    [setSearchParams],
  );

  // Debounce the search box into the URL. Only write when the term actually
  // changed: mounting or paginating must not rewrite `q`, since updateParam clears
  // the `page` param on any non-page change (which would snap back to page 1).
  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === q) return;
    const t = setTimeout(() => updateParam('q', trimmed), 300);
    return () => clearTimeout(t);
  }, [searchInput, q, updateParam]);

  const clients = useQuery({ queryKey: ['clients'], queryFn: () => clientsApi.list() });

  const query: PagesQuery = {
    q: q || undefined,
    clientId: clientId ? Number(clientId) : undefined,
    page,
    pageSize: PAGE_SIZE,
  };
  const pages = useQuery({ queryKey: ['pages', query], queryFn: () => pagesApi.list(query) });

  const total = pages.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1>Pages</h1>
        <div className={styles.filters}>
          <input
            className={styles.search}
            placeholder="Search by title, URL or keyword…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <select
            className={styles.select}
            value={clientId}
            onChange={(e) => updateParam('clientId', e.target.value)}
          >
            <option value="">All clients</option>
            {clients.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {pages.isLoading ? (
        <div className={styles.state}>Loading…</div>
      ) : pages.isError ? (
        <div className={styles.state}>Failed to load pages.</div>
      ) : total === 0 ? (
        q || clientId ? (
          <EmptyState
            icon={<SearchIcon />}
            title="No pages match your filters"
            description="Try a different search term or client."
          />
        ) : (
          <EmptyState
            icon={<PagesIcon />}
            title="No pages yet"
            description="Add a client and we'll crawl its blog pages. They'll show up here."
            action={<Link to="/clients">Add a client</Link>}
          />
        )
      ) : (
        <>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>URL</th>
                <th>Keywords</th>
                <th className={styles.num}>Issues</th>
                <th className={styles.num}>Best position</th>
              </tr>
            </thead>
            <tbody>
              {pages.data?.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/pages/${p.id}`} className={styles.pageTitle} title={p.title ?? undefined}>
                      {p.title ?? p.url}
                    </Link>
                    <div className={styles.pageUrl}>{p.url}</div>
                    <div className={styles.clientTag}>{p.clientName}</div>
                  </td>
                  <td>
                    <div className={styles.chips}>
                      {p.keywords.slice(0, 3).map((k) => (
                        <span key={k} className={styles.chip}>
                          {k}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className={styles.num}>
                    {p.issueCount > 0 ? <span className={styles.issuePill}>{p.issueCount}</span> : '—'}
                  </td>
                  <td className={styles.num}>{p.bestPosition ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.pagination}>
            <button
              className={styles.pageBtn}
              disabled={page <= 1}
              onClick={() => updateParam('page', String(page - 1))}
            >
              ‹ Prev
            </button>
            <span className={styles.pageInfo}>
              Page {page} of {totalPages} · {total} page{total === 1 ? '' : 's'}
            </span>
            <button
              className={styles.pageBtn}
              disabled={page >= totalPages}
              onClick={() => updateParam('page', String(page + 1))}
            >
              Next ›
            </button>
          </div>
        </>
      )}
    </div>
  );
}
