/**
 * GitHub API istemcisi.
 *
 * Kaynak: exc_analyzer/api.py - sayfalama, kisa omurlu onbellek ve kota
 * yonetimi oradaki davranisi izler.
 *
 * Butun istekler kullanicinin KENDI tarayicisindan, KENDI token'iyla gider.
 * Bizim sunucumuz yok; dolayisiyla merkezi bir API kotasi da yok. Her
 * kullanici kendi saatlik 5000 istegini harcar.
 */

const API = 'https://api.github.com';
const CACHE_TTL_MS = 30_000;

export class AuthError extends Error {
  constructor(message = 'GitHub oturumu geçersiz veya süresi dolmuş.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(public resetAt: Date | null) {
    super('GitHub API kotan doldu.');
    this.name = 'RateLimitError';
  }
}

/**
 * fetch'in kendisi basarisiz oldu: yanit hic gelmedi.
 * Tarayici bunu duz "Failed to fetch" diye bildirir ve hangi istegin
 * dustugunu soylemez. Hangi adrese gidilemedigini kaydediyoruz ki hem
 * kullaniciya anlamli bir sey soyleyebilelim hem de teshis edebilelim.
 */
export class NetworkError extends Error {
  constructor(public url: string, cause?: unknown) {
    super(`Şu adrese ulaşılamadı: ${url}`);
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Bulunamadı.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface GhResponse<T> {
  status: number;
  data: T | null;
  /** GitHub'in hata govdesindeki `message` alani. Ayrimlar icin gerekli. */
  message: string | null;
  headers: Headers;
}

export interface RateLimit {
  remaining: number | null;
  limit: number | null;
  resetAt: Date | null;
}

/** atob yalnizca byte uretir; UTF-8 cozumlemesi ayrica yapilmali. */
function decodeBase64Utf8(b64: string): string {
  try {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

const cache = new Map<string, { at: number; value: GhResponse<unknown> }>();

export function clearCache(): void {
  cache.clear();
}

export class GitHubClient {
  private lastRate: RateLimit = { remaining: null, limit: null, resetAt: null };

  /** Token yoksa istekler kimliksiz gider (saatlik 60 istek). */
  constructor(private token?: string) {}

  get rateLimit(): RateLimit {
    return this.lastRate;
  }

  /**
   * Ham istek. 404'u hata saymaz - cagiran taraf "yok" ile "erisemiyorum"
   * ayrimini yapabilsin diye durum kodunu ve mesaji birlikte dondurur.
   */
  async raw<T>(path: string, params?: Record<string, string | number>): Promise<GhResponse<T>> {
    const url = new URL(path.startsWith('http') ? path : API + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
    }

    const key = url.toString();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return hit.value as GhResponse<T>;
    }

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
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
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : null;

    // 401'in iki farkli anlami var ve karistirilmamalari gerekiyor:
    //
    //  - "Bad credentials": token gercekten gecersiz. Oturum bitmistir.
    //  - "Requires authentication": token gecerli olabilir ama bu uc daha
    //    yuksek yetki istiyor. Ornegin /branches/*/protection kimliksiz
    //    istekte hep 401 doner. Bunu oturum hatasi saymak butun taramayi
    //    gereksiz yere iptal ediyordu.
    //
    // Ikincisi normal bir yanit olarak geri doner; cagiran taraf onu
    // "bilinmiyor" diye ele alir.
    if (res.status === 401 && /bad credentials/i.test(message ?? '')) {
      throw new AuthError();
    }

    // Kota bitiminde GitHub 403 veya 429 doner ve remaining 0'dir.
    if ((res.status === 403 || res.status === 429) && this.lastRate.remaining === 0) {
      throw new RateLimitError(this.lastRate.resetAt);
    }

    const out: GhResponse<T> = {
      status: res.status,
      data: res.ok ? (body as T) : null,
      message,
      headers: res.headers,
    };

    // YALNIZCA 200 onbellege alinir.
    //
    // res.ok, 202'yi de kapsiyor ve bu gercek bir hataya yol aciyordu: GitHub
    // istatistikleri arka planda hesaplarken 202 "hazir degil" doner.
    // contribImpact bunu gorunce artan araliklarla tekrar deniyor — ama 202
    // onbellege girdigi icin tekrar denemeler 30 saniye boyunca ayni
    // onbellek kaydini okuyup ayni "hazir degil" yanitini aliyordu. Yani
    // tekrar deneme donguisu hicbir ise yaramiyordu.
    if (res.status === 200) cache.set(key, { at: Date.now(), value: out });
    return out;
  }

  /** Basarili yanit bekler; 404'te NotFoundError firlatir. */
  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    const res = await this.raw<T>(path, params);
    if (res.status === 404) throw new NotFoundError(res.message ?? undefined);
    if (!res.data) throw new Error(res.message ?? `GitHub hatası (HTTP ${res.status})`);
    return res.data;
  }

  /** Link basligini izleyerek tum sayfalari toplar. */
  async getAll<T>(path: string, params?: Record<string, string | number>, maxPages = 10): Promise<T[]> {
    const out: T[] = [];
    let page = 1;
    while (page <= maxPages) {
      const res = await this.raw<T[]>(path, { ...params, per_page: 100, page });
      if (res.status === 404) throw new NotFoundError(res.message ?? undefined);
      if (!Array.isArray(res.data)) break;
      out.push(...res.data);
      const link = res.headers.get('link') ?? '';
      if (!link.includes('rel="next"')) break;
      page += 1;
    }
    return out;
  }

  /**
   * GraphQL sorgusu. REST'in tek istekte veremedigi bilesik verileri
   * (depo ozeti + diller + commit gecmisi) tek turda getirir.
   * GraphQL API kimliksiz istegi kabul etmez, token zorunludur.
   */
  async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    if (!this.token) throw new AuthError('Bu işlem için GitHub bağlantısı gerekiyor.');

    let res: Response;
    try {
      res = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw new NetworkError('https://api.github.com/graphql', err);
    }

    this.readRateLimit(res.headers);

    if (res.status === 401) throw new AuthError();

    const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (body.errors?.length) {
      const first = body.errors[0].message;
      if (/rate limit/i.test(first)) throw new RateLimitError(this.lastRate.resetAt);
      if (/could not resolve|not resolve to a/i.test(first)) throw new NotFoundError(first);
      throw new Error(first);
    }
    if (!body.data) throw new Error('GraphQL yanıtı boş döndü.');
    return body.data;
  }

  /**
   * Duz metin indirir (raw.githubusercontent.com gibi API disi adresler icin).
   * Buyuk dosyalarda tarayiciyi kilitlememek adina okunan miktar sinirli.
   */
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

  /**
   * Dosya icerigini API uzerinden getirir.
   *
   * Onceden raw.githubusercontent.com kullaniliyordu ama o adres bazi
   * aglarda ve bazi ulkelerde engelli; olculdu, kullanicinin aginda
   * api.github.com acikken raw kapaliydi. Contents ucu ayni veriyi
   * base64 olarak veriyor ve zaten calistigini bildigimiz sunucuda.
   *
   * 1 MB ustu dosyalar bu uctan gelmez; onlar icin blob ucuna dusulur.
   */
  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    const params: Record<string, string> = {};
    if (ref) params.ref = ref;

    const res = await this.raw<{ content?: string; encoding?: string; sha?: string; size?: number }>(
      `/repos/${owner}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
      Object.keys(params).length ? params : undefined,
    );

    if (res.status !== 200 || !res.data) return null;

    if (res.data.encoding === 'base64' && res.data.content) {
      return decodeBase64Utf8(res.data.content);
    }

    // Buyuk dosya: contents ucu icerik yerine yalnizca ustveri doner.
    if (res.data.sha) {
      const blob = await this.raw<{ content?: string; encoding?: string }>(
        `/repos/${owner}/${repo}/git/blobs/${res.data.sha}`,
      );
      if (blob.status === 200 && blob.data?.encoding === 'base64' && blob.data.content) {
        return decodeBase64Utf8(blob.data.content);
      }
    }

    return null;
  }

  private readRateLimit(h: Headers): void {
    const remaining = h.get('x-ratelimit-remaining');
    const limit = h.get('x-ratelimit-limit');
    const reset = h.get('x-ratelimit-reset');
    this.lastRate = {
      remaining: remaining === null ? null : Number(remaining),
      limit: limit === null ? null : Number(limit),
      resetAt: reset === null ? null : new Date(Number(reset) * 1000),
    };
  }
}

/** `sahip/depo` metnini dogrular ve ayirir. */
export function parseRepo(input: string): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
  const parts = cleaned.split('/').filter(Boolean);
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  const valid = /^[A-Za-z0-9._-]+$/;
  if (!valid.test(owner) || !valid.test(repo)) return null;
  return { owner, repo };
}
