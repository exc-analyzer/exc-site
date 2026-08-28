/**
 * Sır tespiti — ortak desenler ve yanlış pozitif elemesi.
 *
 * CLI'de bu desenler üç ayrı dosyada (scan_secrets, advanced_secrets,
 * dork_scan) birbirinden farklı tanımlı ve yalnızca dork_scan'de yanlış
 * pozitif elemesi var. Burada tek kaynak var: aynı depoyu iki farklı komutla
 * taradığında farklı sonuç almazsın.
 *
 * TEMEL KURAL: bulunan değer hiçbir zaman olduğu gibi döndürülmez. Yalnızca
 * maskelenmiş hali, türü ve konumu taşınır.
 */
import { maskSecret, shannonEntropy } from './shared';

export interface SecretMatch {
  type: string;
  /** Maskelenmiş değer. Ham değer hiçbir yerde tutulmaz. */
  masked: string;
  /** Eşleşmenin bulunduğu satır numarası (1'den başlar). */
  line: number;
  confidence: 'high' | 'medium' | 'low';
}

interface PatternSpec {
  type: string;
  regex: RegExp;
  /** Yüksek entropi beklenen anahtarlar; düşükse örnek/placeholder sayılır. */
  entropyFloor?: number;
}

const PATTERNS: PatternSpec[] = [
  { type: 'AWS Access Key', regex: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g, entropyFloor: 3 },
  { type: 'AWS Secret Key', regex: /(?<=aws.{0,20}secret.{0,20}["'])[0-9a-zA-Z/+=]{40}(?=["'])/gi, entropyFloor: 4 },
  { type: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9]{36}/g, entropyFloor: 3.5 },
  { type: 'GitHub Fine-grained Token', regex: /github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}/g, entropyFloor: 3.5 },
  { type: 'Slack Token', regex: /xox[baprs]-[0-9A-Za-z-]{10,48}/g, entropyFloor: 3 },
  { type: 'Google API Key', regex: /AIza[0-9A-Za-z\-_]{35}/g, entropyFloor: 3.5 },
  { type: 'Stripe Secret Key', regex: /sk_live_[0-9a-zA-Z]{24,}/g, entropyFloor: 3.5 },
  { type: 'Mailgun Key', regex: /key-[0-9a-zA-Z]{32}/g, entropyFloor: 3.5 },
  { type: 'Heroku API Key', regex: /heroku[a-z0-9]{32}/gi, entropyFloor: 3.5 },
  { type: 'Private Key', regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/g },
  {
    type: 'Genel API anahtarı',
    regex: /(?:api[_-]?key|secret[_-]?key|auth[_-]?token|access[_-]?token)\s*[:=]\s*["']([A-Za-z0-9_\-/+=]{16,})["']/gi,
    entropyFloor: 3.2,
  },
  {
    type: 'Gömülü parola',
    regex: /(?:password|passwd|pwd)\s*[:=]\s*["']([^"'\s]{8,})["']/gi,
    entropyFloor: 2.5,
  },
];

/** Örnek/placeholder olduğunu ele veren ifadeler. */
const EXAMPLE_HINTS = [
  'example', 'sample', 'demo', 'placeholder', 'dummy', 'fake', 'mock',
  'your_key', 'your-key', 'replace_with', 'replace-me', 'insert_here',
  'changeme', 'change_me', 'todo', 'fixme', 'xxxxxx', '123456', 'abcdef',
  'test_key', 'testkey', 'redacted', 'notarealkey',
];

function isCommentLine(line: string): boolean {
  const s = line.trim();
  return (
    s.startsWith('#') ||
    s.startsWith('//') ||
    s.startsWith('*') ||
    s.startsWith('<!--') ||
    s.startsWith(';')
  );
}

function looksLikeExample(context: string, matched: string): boolean {
  const lower = context.toLowerCase();
  if (EXAMPLE_HINTS.some((hint) => lower.includes(hint))) return true;
  // Tek karakterin tekrarı: AAAAAAAA... gibi doldurma değerler
  if (/^(.)\1{7,}$/.test(matched)) return true;
  return false;
}

/**
 * Metni tarar ve bulunan sırları MASKELENMİŞ olarak döndürür.
 * Dosya yolu, örnek/dokuman dosyalarını daha temkinli değerlendirmek için
 * kullanılır.
 */
export function findSecrets(content: string, path = ''): SecretMatch[] {
  if (!content) return [];

  const lines = content.split('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  const lineOf = (index: number) => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (lineStarts[mid] <= index) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const isDoc = /(^|\/)(readme|example|sample|docs?\/|test|spec)/i.test(path) || /\.md$/i.test(path);
  const results: SecretMatch[] = [];
  const seen = new Set<string>();

  for (const spec of PATTERNS) {
    const regex = new RegExp(spec.regex.source, spec.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      const value = match[1] ?? match[0];
      if (!value) continue;

      const lineIndex = lineOf(match.index);
      const line = lines[lineIndex] ?? '';
      const context = content.slice(
        Math.max(0, match.index - 120),
        Math.min(content.length, match.index + value.length + 120),
      );

      if (isCommentLine(line)) continue;
      if (looksLikeExample(context, value)) continue;

      if (spec.entropyFloor !== undefined && shannonEntropy(value) < spec.entropyFloor) {
        continue;
      }

      const key = `${spec.type}:${lineIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      results.push({
        type: spec.type,
        masked: maskSecret(value),
        line: lineIndex + 1,
        confidence: isDoc ? 'low' : spec.entropyFloor === undefined ? 'high' : 'medium',
      });
    }
  }

  return results;
}

/** Sır barındırma ihtimali yüksek dosya yolları. */
export function isSuspectPath(path: string): boolean {
  const p = path.toLowerCase();
  if (/\.(png|jpe?g|gif|svg|ico|woff2?|ttf|eot|pdf|zip|gz|mp4|mp3|lock)$/.test(p)) return false;
  return (
    /(^|\/)\.env/.test(p) ||
    /(config|secret|credential|token|password|private)/.test(p) ||
    /\.(json|ya?ml|toml|ini|cfg|conf|properties|py|js|ts|rb|php|sh|tf)$/.test(p)
  );
}

/** Aynı anda en fazla `limit` iş çalıştırır; tarayıcıyı kilitlememek için. */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
