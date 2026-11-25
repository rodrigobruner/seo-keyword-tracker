import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { clientsApi, pagesApi, type PagesQuery } from '../lib/api';
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

  // Debounce the search box into the URL.
  useEffect(() => {
    const t = setTimeout(() => updateParam('q', searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput, updateParam]);

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
            placeholder="Search URL or keyword…"
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
        <div className={styles.state}>No pages found.</div>
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
                    <div className={styles.pageTitle} title={p.title ?? undefined}>
                      {p.title ?? p.url}
                    </div>
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
