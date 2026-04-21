const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

export class HubSpotApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
    public readonly correlationId?: string,
  ) {
    super(message);
    this.name = 'HubSpotApiError';
  }
}

export interface HubSpotFetchOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  correlationId: string;
}

function buildUrl(path: string, query?: HubSpotFetchOptions['query']): string {
  const url = new URL(path, HUBSPOT_API_BASE);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function hubspotFetch<T = unknown>(options: HubSpotFetchOptions): Promise<T> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new HubSpotApiError(0, 'HUBSPOT_ACCESS_TOKEN not configured', undefined, options.correlationId);
  }

  const url = buildUrl(options.path, options.query);
  const init: RequestInit = {
    method: options.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Correlation-Id': options.correlationId,
    },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  };

  let lastError: HubSpotApiError | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);

    if (res.status >= 200 && res.status < 300) {
      if (res.status === 204) return undefined as T;
      const contentType = res.headers.get('content-type') ?? '';
      return contentType.includes('application/json') ? ((await res.json()) as T) : ((await res.text()) as unknown as T);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') ?? '1', 10);
      const waitMs = Math.max(retryAfter, 1) * 1000;
      lastError = new HubSpotApiError(429, `Rate limited`, undefined, options.correlationId);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(waitMs);
        continue;
      }
      throw lastError;
    }

    if (res.status >= 500) {
      const body = await res.clone().text();
      lastError = new HubSpotApiError(res.status, `HubSpot ${res.status}: ${body}`, body, options.correlationId);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }
      throw lastError;
    }

    const contentType = res.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    throw new HubSpotApiError(res.status, `HubSpot ${res.status}`, body, options.correlationId);
  }

  throw lastError ?? new HubSpotApiError(0, 'unreachable', undefined, options.correlationId);
}
