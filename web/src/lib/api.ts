// Thin fetch client. All requests go through the Vite proxy (`/api` → the API)
// with credentials so the httpOnly session cookie travels along.

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'content-type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(path: string): Promise<T> => request<T>(path);
const post = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const del = (path: string): Promise<void> => request<void>(path, { method: 'DELETE' });

// ---- Domain types (mirror the API responses) ----

export interface AuthUser {
  id: number;
  email: string;
}

export interface ClientSummary {
  id: number;
  name: string;
  websiteUrl: string;
  host: string;
  crawlStatus: 'PENDING' | 'CRAWLING' | 'READY' | 'FAILED';
  crawlError: string | null;
  pagesTotal: number | null;
  pagesDone: number;
  pageCount: number;
}

export interface PageListItem {
  id: number;
  url: string;
  title: string | null;
  clientId: number;
  clientName: string;
  issueCount: number;
  keywords: string[];
  bestPosition: number | null;
}

export interface PagesResponse {
  items: PageListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PageDetail {
  id: number;
  url: string;
  title: string | null;
  wordCount: number | null;
  clientId: number;
  clientName: string;
  keywords: { text: string; relevance: number }[];
  issues: { code: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }[];
}

export interface KeywordSeries {
  keyword: string;
  points: { capturedAt: string; position: number }[];
}

export interface PagesQuery {
  clientId?: number;
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: 'url' | 'position' | 'issues';
  dir?: 'asc' | 'desc';
}

function toQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const authApi = {
  me: () => get<AuthUser>('/auth/me'),
  login: (email: string, password: string) => post<AuthUser>('/auth/login', { email, password }),
  logout: () => post<{ ok: true }>('/auth/logout'),
};

export const clientsApi = {
  list: () => get<{ items: ClientSummary[] }>('/clients'),
  get: (id: number) => get<ClientSummary>(`/clients/${id}`),
  create: (name: string, websiteUrl: string) =>
    post<ClientSummary>('/clients', { name, websiteUrl }),
  remove: (id: number) => del(`/clients/${id}`),
};

export const pagesApi = {
  list: (query: PagesQuery) => get<PagesResponse>(`/pages${toQuery({ ...query })}`),
  detail: (id: number) => get<PageDetail>(`/pages/${id}`),
  snapshots: (id: number, from?: string, to?: string) =>
    get<{ series: KeywordSeries[] }>(`/pages/${id}/snapshots${toQuery({ from, to })}`),
};
