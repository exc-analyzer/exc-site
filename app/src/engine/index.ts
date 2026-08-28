/**
 * Komut kayıt defteri.
 *
 * Arayüz komutları buradan okur: form alanları, kategori ve sonucun
 * paylaşılabilir olup olmadığı tek yerde tanımlı.
 */
import type { GitHubClient } from '../lib/github';

import { analysis, type AnalysisResult } from './analysis';
import { securityScore, type SecurityScoreResult } from './securityScore';
import { contentAudit, type ContentAuditResult } from './contentAudit';
import { contribImpact, type ContribImpactResult } from './contribImpact';
import { commitAnomaly, type CommitAnomalyResult } from './commitAnomaly';
import { fileHistory, type FileHistoryResult } from './fileHistory';
import { actionsAudit, type ActionsAuditResult } from './actionsAudit';
import { userAnalysis, type UserAnalysisResult } from './userAnalysis';
import { userAnomaly, type UserAnomalyResult } from './userAnomaly';
import { scanSecrets, type ScanSecretsResult } from './scanSecrets';
import { advancedSecrets, type AdvancedSecretsResult } from './advancedSecrets';
import { dorkScan, DORK_PRESETS, type DorkScanResult } from './dorkScan';

export type CommandId =
  | 'analysis'
  | 'security-score'
  | 'content-audit'
  | 'contrib-impact'
  | 'file-history'
  | 'actions-audit'
  | 'commit-anomaly'
  | 'user-analysis'
  | 'user-anomaly'
  | 'scan-secrets'
  | 'advanced-secrets'
  | 'dork-scan';

export type CommandResult =
  | { id: 'analysis'; data: AnalysisResult }
  | { id: 'security-score'; data: SecurityScoreResult }
  | { id: 'content-audit'; data: ContentAuditResult }
  | { id: 'contrib-impact'; data: ContribImpactResult }
  | { id: 'file-history'; data: FileHistoryResult }
  | { id: 'actions-audit'; data: ActionsAuditResult }
  | { id: 'commit-anomaly'; data: CommitAnomalyResult }
  | { id: 'user-analysis'; data: UserAnalysisResult }
  | { id: 'user-anomaly'; data: UserAnomalyResult }
  | { id: 'scan-secrets'; data: ScanSecretsResult }
  | { id: 'advanced-secrets'; data: AdvancedSecretsResult }
  | { id: 'dork-scan'; data: DorkScanResult };

export type CommandCategory = 'intel' | 'security' | 'anomaly' | 'sensitive';

export const CATEGORIES: { id: CommandCategory; label: string; note?: string }[] = [
  { id: 'intel', label: 'İstihbarat' },
  { id: 'security', label: 'Güvenlik' },
  { id: 'anomaly', label: 'Anomali' },
  {
    id: 'sensitive',
    label: 'Hassas',
    note: 'Bu komutların sonuçları kaydedilmez, paylaşılamaz ve değerler hep maskelidir.',
  },
];

export type FieldKind = 'repo' | 'user' | 'text' | 'number' | 'select' | 'checkbox';

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  min?: number;
  max?: number;
  defaultValue?: string | number | boolean;
  options?: { value: string; label: string }[];
}

export interface CommandDef {
  id: CommandId;
  name: string;
  cli: string;
  summary: string;
  category: CommandCategory;
  fields: FieldSpec[];
  /** true ise sonuç hiçbir yere kaydedilmez ve paylaşılabilir adresi olmaz. */
  sensitive: boolean;
}

const REPO_FIELD: FieldSpec = {
  key: 'repo',
  kind: 'repo',
  label: 'Depo',
  placeholder: 'sahip/depo — örn. torvalds/linux',
  required: true,
};

const USER_FIELD: FieldSpec = {
  key: 'username',
  kind: 'user',
  label: 'Kullanıcı',
  placeholder: 'GitHub kullanıcı adı — örn. torvalds',
  required: true,
};

export const COMMANDS: CommandDef[] = [
  {
    id: 'analysis',
    name: 'Depo analizi',
    cli: 'exc analysis <sahip/depo>',
    summary: 'Deponun genel durumu: diller, commit dağılımı, katkıda bulunanlar.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'content-audit',
    name: 'İçerik denetimi',
    cli: 'exc content-audit <sahip/depo>',
    summary: 'Topluluk standartları: LICENSE, SECURITY.md, CONTRIBUTING ve diğerleri.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'contrib-impact',
    name: 'Katkı etkisi',
    cli: 'exc contrib-impact <sahip/depo>',
    summary: 'Kimin gerçekten taşıdığını satır değişimlerinden ölçer.',
    category: 'intel',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'file-history',
    name: 'Dosya geçmişi',
    cli: 'exc file-history <sahip/depo> <dosya>',
    summary: 'Tek bir dosyanın değişim geçmişi. Yol bilmiyorsan adı yeter.',
    category: 'intel',
    fields: [
      REPO_FIELD,
      {
        key: 'path',
        kind: 'text',
        label: 'Dosya',
        placeholder: 'README.md ya da src/app/main.py',
        hint: 'Yol yazmazsan depoda aranır.',
        required: true,
      },
      { key: 'limit', kind: 'number', label: 'Kayıt sayısı', defaultValue: 20, min: 1, max: 50 },
    ],
    sensitive: false,
  },
  {
    id: 'user-analysis',
    name: 'Kullanıcı analizi',
    cli: 'exc user-a <kullanıcı>',
    summary: 'Profil özeti, öne çıkan depolar ve dil dağılımı.',
    category: 'intel',
    fields: [USER_FIELD],
    sensitive: false,
  },

  {
    id: 'security-score',
    name: 'Güvenlik puanı',
    cli: 'exc security-score <sahip/depo>',
    summary: 'Deponun güvenlik duruşunu ölçer ve neyin düzeltileceğini söyler.',
    category: 'security',
    fields: [REPO_FIELD],
    sensitive: false,
  },
  {
    id: 'actions-audit',
    name: 'Actions denetimi',
    cli: 'exc actions-audit <sahip/depo>',
    summary: 'CI/CD iş akışlarında tedarik zinciri ve enjeksiyon riskleri.',
    category: 'security',
    fields: [REPO_FIELD],
    sensitive: false,
  },

  {
    id: 'commit-anomaly',
    name: 'Commit anomalisi',
    cli: 'exc commit-anomaly <sahip/depo>',
    summary: 'Şüpheli commit mesajlarını işaretler.',
    category: 'anomaly',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commit sayısı', defaultValue: 30, min: 5, max: 100 },
    ],
    sensitive: false,
  },
  {
    id: 'user-anomaly',
    name: 'Kullanıcı anomalisi',
    cli: 'exc user-anomaly <kullanıcı>',
    summary: 'Olağandışı hesap davranışlarını puanlar. Suçlama değil, işaret.',
    category: 'anomaly',
    fields: [USER_FIELD],
    sensitive: false,
  },

  {
    id: 'scan-secrets',
    name: 'Sır taraması',
    cli: 'exc scan-secrets <sahip/depo>',
    summary: 'Son commit’lerde eklenen dosyalarda sızmış anahtar arar.',
    category: 'sensitive',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commit sayısı', defaultValue: 10, min: 1, max: 50 },
    ],
    sensitive: true,
  },
  {
    id: 'advanced-secrets',
    name: 'Derin sır taraması',
    cli: 'exc advanced-secrets <sahip/depo>',
    summary: 'Mevcut dosya ağacı ve commit geçmişi birlikte taranır.',
    category: 'sensitive',
    fields: [
      REPO_FIELD,
      { key: 'limit', kind: 'number', label: 'Commit sayısı', defaultValue: 20, min: 1, max: 50 },
    ],
    sensitive: true,
  },
  {
    id: 'dork-scan',
    name: 'Dork taraması',
    cli: 'exc dork-scan <sorgu>',
    summary: 'GitHub genelinde açıkta kalmış dosya arar.',
    category: 'sensitive',
    fields: [
      {
        key: 'query',
        kind: 'text',
        label: 'Sorgu',
        placeholder: 'filename:.env DB_PASSWORD',
        hint: 'Hazır küme seçersen boş bırakabilirsin.',
      },
      {
        key: 'preset',
        kind: 'select',
        label: 'Hazır küme',
        defaultValue: '',
        options: [
          { value: '', label: 'Yok' },
          ...Object.entries(DORK_PRESETS).map(([value, p]) => ({ value, label: p.label })),
        ],
      },
      { key: 'limit', kind: 'number', label: 'Sonuç sayısı', defaultValue: 10, min: 1, max: 100 },
      {
        key: 'verify',
        kind: 'checkbox',
        label: 'İçeriği doğrula',
        hint: 'Dosyaları indirip gerçekten sır var mı bakar. Yavaştır ama yanlış alarmı çok azaltır.',
        defaultValue: true,
      },
    ],
    sensitive: true,
  },
];

export function getCommand(id: CommandId): CommandDef {
  const found = COMMANDS.find((c) => c.id === id);
  if (!found) throw new Error(`Bilinmeyen komut: ${id}`);
  return found;
}

export type FieldValues = Record<string, string | number | boolean>;

function repoOf(values: FieldValues): { owner: string; repo: string } {
  const raw = String(values.repo ?? '');
  const parts = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean);
  if (parts.length !== 2) throw new Error('Depo biçimi "sahip/depo" olmalı.');
  return { owner: parts[0], repo: parts[1] };
}

function num(values: FieldValues, key: string, fallback: number): number {
  const raw = Number(values[key]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export async function runCommand(
  gh: GitHubClient,
  id: CommandId,
  values: FieldValues,
): Promise<CommandResult> {
  switch (id) {
    case 'analysis': {
      const { owner, repo } = repoOf(values);
      return { id, data: await analysis(gh, owner, repo) };
    }
    case 'security-score': {
      const { owner, repo } = repoOf(values);
      return { id, data: await securityScore(gh, owner, repo) };
    }
    case 'content-audit': {
      const { owner, repo } = repoOf(values);
      return { id, data: await contentAudit(gh, owner, repo) };
    }
    case 'contrib-impact': {
      const { owner, repo } = repoOf(values);
      return { id, data: await contribImpact(gh, owner, repo) };
    }
    case 'file-history': {
      const { owner, repo } = repoOf(values);
      const path = String(values.path ?? '').trim();
      if (!path) throw new Error('Bir dosya adı ya da yolu gerekiyor.');
      return { id, data: await fileHistory(gh, owner, repo, path, num(values, 'limit', 20)) };
    }
    case 'actions-audit': {
      const { owner, repo } = repoOf(values);
      return { id, data: await actionsAudit(gh, owner, repo) };
    }
    case 'commit-anomaly': {
      const { owner, repo } = repoOf(values);
      return { id, data: await commitAnomaly(gh, owner, repo, num(values, 'limit', 30)) };
    }
    case 'user-analysis': {
      const username = String(values.username ?? '').trim();
      if (!username) throw new Error('Bir kullanıcı adı gerekiyor.');
      return { id, data: await userAnalysis(gh, username) };
    }
    case 'user-anomaly': {
      const username = String(values.username ?? '').trim();
      if (!username) throw new Error('Bir kullanıcı adı gerekiyor.');
      return { id, data: await userAnomaly(gh, username) };
    }
    case 'scan-secrets': {
      const { owner, repo } = repoOf(values);
      return { id, data: await scanSecrets(gh, owner, repo, num(values, 'limit', 10)) };
    }
    case 'advanced-secrets': {
      const { owner, repo } = repoOf(values);
      return { id, data: await advancedSecrets(gh, owner, repo, num(values, 'limit', 20)) };
    }
    case 'dork-scan': {
      const query = String(values.query ?? '').trim();
      const preset = String(values.preset ?? '').trim();
      return {
        id,
        data: await dorkScan(gh, {
          queries: query ? [query] : [],
          preset: preset ? (preset as keyof typeof DORK_PRESETS) : undefined,
          limit: num(values, 'limit', 10),
          verify: Boolean(values.verify),
        }),
      };
    }
  }
}
