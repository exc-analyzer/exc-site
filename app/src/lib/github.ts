const API = "https://api.github.com";
const CACHE_TTL_MS = 30_000;
export class AuthError extends Error {
  constructor(message = "Your GitHub session is invalid or has expired.") {
    super(message);
    this.name = "AuthError";
  }
}
export class RateLimitError extends Error {
  constructor(public resetAt: Date | null) {
    super("You have used up your GitHub API quota.");
    this.name = "RateLimitError";
  }
}
export class NetworkError extends Error {
  constructor(
    public url: string,
    cause?: unknown,
  ) {
    super(`Could not reach ${url}`);
    this.name = "NetworkError";
    this.cause = cause;
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found.") {
    super(message);
    this.name = "NotFoundError";
  }
}
export interface GhResponse<T> {
  status: number;
  data: T | null;
  message: string | null;
  headers: Headers;
}
export interface RateLimit {
  remaining: number | null;
  limit: number | null;
  resetAt: Date | null;
}

function decodeBase64Utf8(b64: string): string {
  try {
    const binary = atob(b64.replace(/\s/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  } catch {
    return "";
  }
}
const cache = new Map<string, { at: number; value: GhResponse<unknown> }>();
export function clearCache(): void {
  cache.clear();
}
export class GitHubClient {
  private lastRate: RateLimit = { remaining: null, limit: null, resetAt: null };
  constructor(private token?: string) {}
  get rateLimit(): RateLimit {
    return this.lastRate;
  }

  async raw<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<GhResponse<T>> {
    const url = new URL(path.startsWith("http") ? path : API + path);
    if (params) {
      for (const [k, v] of Object.entries(params))
        url.searchParams.set(k, String(v));
    }

    const key = `${this.token ? this.token.slice(-8) : "anon"}|${url.toString()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value as GhResponse<T>;
    }
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
    } catch (err) {
      throw new NetworkError(`${url.origin}${url.pathname}`, err);
    }
    this.readRateLimit(res.headers);
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : null;

    if (res.status === 401 && /bad credentials/i.test(message ?? "")) {
      throw new AuthError();
    }
    if (
      (res.status === 403 || res.status === 429) &&
      this.lastRate.remaining === 0
    ) {
      throw new RateLimitError(this.lastRate.resetAt);
    }
    const out: GhResponse<T> = {
      status: res.status,
      data: res.ok ? (body as T) : null,
      message,
      headers: res.headers,
    };

    if (res.status === 200) cache.set(key, { at: Date.now(), value: out });
    return out;
  }
  async get<T>(
    path: string,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const res = await this.raw<T>(path, params);
    if (res.status === 404) throw new NotFoundError(res.message ?? undefined);
    if (!res.data)
      throw new Error(res.message ?? `GitHub error (HTTP ${res.status})`);
    return res.data;
  }
  async getAll<T>(
    path: string,
    params?: Record<string, string | number>,
    maxPages = 10,
  ): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    while (page <= maxPages) {
      const res = await this.raw<T[]>(path, { ...params, per_page: 100, page });
      if (res.status === 404) throw new NotFoundError(res.message ?? undefined);
      if (!Array.isArray(res.data)) break;
      out.push(...res.data);
      const link = res.headers.get("link") ?? "";
      if (!link.includes('rel="next"')) break;
      page += 1;
    }
    return out;
  }

  async graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    if (!this.token)
      throw new AuthError("This command needs a signed-in GitHub session.");
    let res: Response;
    try {
      res = await fetch("https://api.github.com/graphql", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new NetworkError("https://api.github.com/graphql", err);
    }
    this.readRateLimit(res.headers);
    if (res.status === 401) throw new AuthError();
    const body = (await res.json()) as {
      data?: T;
      errors?: { message: string }[];
    };
    if (body.errors?.length) {
      const first = body.errors[0].message;
      if (/rate limit/i.test(first))
        throw new RateLimitError(this.lastRate.resetAt);
      if (/could not resolve|not resolve to a/i.test(first))
        throw new NotFoundError(first);
      throw new Error(first);
    }
    if (!body.data) throw new Error("GraphQL returned an empty response.");
    return body.data;
  }
  async fetchText(url: string, maxBytes = 512_000): Promise<string | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const text = await res.text();
      return text.length > maxBytes ? text.slice(0, maxBytes) : text;
    } catch {
      return null;
    }
  }
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    const params: Record<string, string> = {};
    if (ref) params.ref = ref;
    const res = await this.raw<{
      content?: string;
      encoding?: string;
      sha?: string;
      size?: number;
    }>(
      `/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`,
      Object.keys(params).length ? params : undefined,
    );
    if (res.status !== 200 || !res.data) return null;
    if (res.data.encoding === "base64" && res.data.content) {
      return decodeBase64Utf8(res.data.content);
    }
    if (res.data.sha) {
      const blob = await this.raw<{ content?: string; encoding?: string }>(
        `/repos/${owner}/${repo}/git/blobs/${res.data.sha}`,
      );
      if (
        blob.status === 200 &&
        blob.data?.encoding === "base64" &&
        blob.data.content
      ) {
        return decodeBase64Utf8(blob.data.content);
      }
    }
    return null;
  }
  private readRateLimit(h: Headers): void {
    const remaining = h.get("x-ratelimit-remaining");
    const limit = h.get("x-ratelimit-limit");
    const reset = h.get("x-ratelimit-reset");
    this.lastRate = {
      remaining: remaining === null ? null : Number(remaining),
      limit: limit === null ? null : Number(limit),
      resetAt: reset === null ? null : new Date(Number(reset) * 1000),
    };
  }
}
export function parseRepo(
  input: string,
): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const valid = /^[A-Za-z0-9._-]+$/;
  if (!valid.test(owner) || !valid.test(repo)) return null;
  return { owner, repo };
}
