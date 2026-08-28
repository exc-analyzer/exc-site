/**
 * Topluluk standartları denetimi.
 * Kaynak: exc_analyzer/commands/content_audit.py
 *
 * CLI'ye göre bir düzeltme: GitHub bu dosyaların hepsini kökte, .github/ ve
 * docs/ altında arar. Yalnızca köke bakmak, dosyası .github/ altında duran
 * depolara "eksik" demek olur.
 */
import { GitHubClient } from '../lib/github';
import { decodeBase64 } from './shared';

export type AuditQuality = 'ok' | 'too_short' | 'empty' | 'missing' | 'unknown';

export interface AuditItem {
  file: string;
  description: string;
  foundAt: string | null;
  quality: AuditQuality;
  qualityLabel: string;
  passed: boolean;
}

export interface ContentAuditResult {
  owner: string;
  repo: string;
  items: AuditItem[];
  presentCount: number;
  totalCount: number;
}

const FILES: { name: string; description: string; paths: string[] }[] = [
  {
    name: 'LICENSE',
    description: 'Kullanım koşulları',
    paths: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'],
  },
  {
    name: 'SECURITY.md',
    description: 'Güvenlik açığı bildirim politikası',
    paths: ['SECURITY.md', '.github/SECURITY.md', 'docs/SECURITY.md'],
  },
  {
    name: 'CODE_OF_CONDUCT.md',
    description: 'Topluluk davranış kuralları',
    paths: ['CODE_OF_CONDUCT.md', '.github/CODE_OF_CONDUCT.md', 'docs/CODE_OF_CONDUCT.md'],
  },
  {
    name: 'CONTRIBUTING.md',
    description: 'Katkı rehberi',
    paths: ['CONTRIBUTING.md', '.github/CONTRIBUTING.md', 'docs/CONTRIBUTING.md'],
  },
  {
    name: 'README.md',
    description: 'Proje tanıtımı',
    paths: ['README.md', 'README', 'readme.md'],
  },
];

const QUALITY_LABELS: Record<AuditQuality, string> = {
  ok: 'Yeterli',
  too_short: 'Var ama çok kısa',
  empty: 'Boş',
  missing: 'Yok',
  unknown: 'Okunamadı',
};

export async function contentAudit(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<ContentAuditResult> {
  const items: AuditItem[] = [];

  for (const spec of FILES) {
    let found: { path: string; content: string } | null = null;
    let sawUnexpected = false;

    for (const path of spec.paths) {
      const res = await gh.raw<{ content?: string; encoding?: string }>(
        `/repos/${owner}/${repo}/contents/${path}`,
      );
      if (res.status === 200 && res.data) {
        found = { path, content: res.data.content ? decodeBase64(res.data.content) : '' };
        break;
      }
      if (res.status !== 404) sawUnexpected = true;
    }

    if (!found) {
      const quality: AuditQuality = sawUnexpected ? 'unknown' : 'missing';
      items.push({
        file: spec.name,
        description: spec.description,
        foundAt: null,
        quality,
        qualityLabel: QUALITY_LABELS[quality],
        passed: false,
      });
      continue;
    }

    const text = found.content;
    let quality: AuditQuality;
    if (!text.trim()) {
      quality = 'empty';
    } else if (text.split('\n').length < 5) {
      quality = 'too_short';
    } else if (spec.name === 'README.md' && text.length < 100) {
      quality = 'too_short';
    } else {
      quality = 'ok';
    }

    items.push({
      file: spec.name,
      description: spec.description,
      foundAt: found.path,
      quality,
      qualityLabel: QUALITY_LABELS[quality],
      passed: quality === 'ok',
    });
  }

  return {
    owner,
    repo,
    items,
    presentCount: items.filter((i) => i.foundAt !== null).length,
    totalCount: items.length,
  };
}
