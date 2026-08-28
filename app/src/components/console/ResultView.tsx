import type { CommandResult } from '../../engine';
import type { Tone } from './ui';
import { Badge, Bar, Card, CardHead, Empty, ExternalLink, KeyValues, Score, SectionTitle, Stats, Table, toneText } from './ui';
import { formatDate, relativeTime } from '../../engine/shared';

export function ResultView({ result }: { result: CommandResult }) {
  switch (result.id) {
    case 'analysis':
      return <AnalysisView data={result.data} />;
    case 'security-score':
      return <SecurityScoreView data={result.data} />;
    case 'content-audit':
      return <ContentAuditView data={result.data} />;
    case 'contrib-impact':
      return <ContribImpactView data={result.data} />;
    case 'file-history':
      return <FileHistoryView data={result.data} />;
    case 'actions-audit':
      return <ActionsAuditView data={result.data} />;
    case 'commit-anomaly':
      return <CommitAnomalyView data={result.data} />;
    case 'user-analysis':
      return <UserAnalysisView data={result.data} />;
    case 'user-anomaly':
      return <UserAnomalyView data={result.data} />;
    case 'scan-secrets':
      return <ScanSecretsView data={result.data} />;
    case 'advanced-secrets':
      return <AdvancedSecretsView data={result.data} />;
    case 'dork-scan':
      return <DorkScanView data={result.data} />;
  }
}

/** Hassas komutlarda sonucun kaydedilmediğini açıkça söyleyen şerit. */
function SensitiveNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-900/60 bg-amber-950/20 px-4 py-3 text-xs text-amber-200/90">
      {children}
    </div>
  );
}

type A = Extract<CommandResult, { id: 'analysis' }>['data'];
function AnalysisView({ data }: { data: A }) {
  return (
    <Card>
      <CardHead
        title={`${data.owner}/${data.repo}`}
        subtitle={data.description ?? 'Açıklama yok'}
      />
      <div className="space-y-8 px-6 py-5">
        <Stats
          items={[
            { label: 'Yıldız', value: data.stars.toLocaleString('tr-TR') },
            { label: 'Fork', value: data.forks.toLocaleString('tr-TR') },
            { label: 'Açık issue', value: data.openIssues.toLocaleString('tr-TR') },
            { label: 'Toplam PR', value: data.totalPullRequests.toLocaleString('tr-TR') },
          ]}
        />

        <KeyValues
          items={[
            { label: 'Oluşturulma', value: `${formatDate(data.createdAt)} · ${relativeTime(data.createdAt)}` },
            { label: 'Son güncelleme', value: `${formatDate(data.updatedAt)} · ${relativeTime(data.updatedAt)}` },
            { label: 'Varsayılan dal', value: <code>{data.defaultBranch}</code> },
            { label: 'Lisans', value: data.license ?? 'Yok' },
          ]}
        />

        {data.languages.length > 0 && (
          <div>
            <SectionTitle>Diller</SectionTitle>
            <ul className="space-y-2.5">
              {data.languages.slice(0, 6).map((l) => (
                <li key={l.name}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{l.name}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">
                      %{l.percent.toFixed(1)}
                    </span>
                  </div>
                  <Bar percent={l.percent} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <SectionTitle>Son {data.commitsAnalyzed} commit</SectionTitle>
            {data.topCommitters.length === 0 ? (
              <Empty>Commit bulunamadı.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.topCommitters.map((c) => (
                  <li key={c.name} className="flex justify-between gap-4">
                    <span className="truncate">{c.name}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{c.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <SectionTitle>Katkıda bulunanlar ({data.totalContributors})</SectionTitle>
            {data.topContributors.length === 0 ? (
              <Empty>Kayıt yok.</Empty>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.topContributors.map((c) => (
                  <li key={c.login} className="flex justify-between gap-4">
                    <span className="truncate">{c.login}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">
                      {c.contributions}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

type S = Extract<CommandResult, { id: 'security-score' }>['data'];
function SecurityScoreView({ data }: { data: S }) {
  const tone: Tone = data.verdict === 'excellent' ? 'good' : data.verdict === 'good' ? 'warn' : 'bad';
  const caption =
    data.verdict === 'excellent' ? 'İyi durumda' : data.verdict === 'good' ? 'Fena değil' : 'İyileştirilmeli';
  const todo = data.criteria.filter((c) => c.status === 'fail' && c.fix);

  return (
    <Card>
      <CardHead
        title={`${data.owner}/${data.repo}`}
        right={<Score value={data.score} tone={tone} caption={caption} />}
      />
      <div className="space-y-6 px-6 py-5">
        <ul className="divide-y divide-[var(--color-border)]">
          {data.criteria.map((c) => {
            const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '–';
            const t: Tone = c.status === 'pass' ? 'good' : c.status === 'fail' ? 'bad' : 'muted';
            return (
              <li key={c.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                <span className="flex min-w-0 items-start gap-3">
                  <span className={`w-3 shrink-0 ${toneText(t)}`}>{mark}</span>
                  <span className="min-w-0">{c.label}</span>
                </span>
                <span className="shrink-0 text-right text-[var(--color-muted)]">
                  {c.detail}
                  {c.status === 'fail' && <span className="ml-2 text-red-400">−{c.weight}</span>}
                </span>
              </li>
            );
          })}
        </ul>

        {todo.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] p-4">
            <SectionTitle>Puanı yükseltmek için</SectionTitle>
            <ol className="space-y-2 text-sm text-[var(--color-muted)]">
              {todo.map((c) => (
                <li key={c.id} className="flex gap-2">
                  <span className="text-[var(--color-text)]">→</span>
                  <span>{c.fix}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <p className="text-xs text-[var(--color-muted)]">
          {data.evaluatedCount} kriter değerlendirildi
          {data.unknownCount > 0 && (
            <>
              , {data.unknownCount} tanesi{' '}
              <strong className="text-[var(--color-text)]">puanlamaya katılmadı</strong> — nedeni her
              satırın yanında yazıyor
            </>
          )}
          .
        </p>
      </div>
    </Card>
  );
}

type C = Extract<CommandResult, { id: 'content-audit' }>['data'];
function ContentAuditView({ data }: { data: C }) {
  return (
    <Card>
      <CardHead
        title={`${data.owner}/${data.repo}`}
        subtitle={`${data.presentCount}/${data.totalCount} standart dosya mevcut`}
      />
      <ul className="divide-y divide-[var(--color-border)]">
        {data.items.map((item) => {
          const tone: Tone =
            item.quality === 'ok' ? 'good' : item.quality === 'missing' ? 'bad' : item.quality === 'unknown' ? 'muted' : 'warn';
          return (
            <li key={item.file} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
              <div className="min-w-0">
                <p className="font-mono text-sm">{item.file}</p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {item.description}
                  {item.foundAt && item.foundAt !== item.file && (
                    <span className="ml-2 font-mono">→ {item.foundAt}</span>
                  )}
                </p>
              </div>
              <Badge tone={tone}>{item.qualityLabel}</Badge>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

type CI = Extract<CommandResult, { id: 'contrib-impact' }>['data'];
function ContribImpactView({ data }: { data: CI }) {
  return (
    <Card>
      <CardHead
        title={`${data.owner}/${data.repo}`}
        subtitle="Puan = eklenen satır × 0.7 − silinen satır × 0.3"
      />
      <div className="px-6 py-5">
        {data.statsPending ? (
          <Empty>
            GitHub bu deponun istatistiklerini hâlâ hesaplıyor. Birkaç saniye sonra tekrar dene.
          </Empty>
        ) : data.contributors.length === 0 ? (
          <Empty>Katkı verisi bulunamadı.</Empty>
        ) : (
          <ul className="space-y-4">
            {data.contributors.map((c) => (
              <li key={c.login} className="flex items-center gap-4">
                {c.avatarUrl && (
                  <img src={c.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="truncate">{c.login}</span>
                    <span className="tabular-nums">{Math.round(c.score).toLocaleString('tr-TR')}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                    <span className="text-emerald-400">+{c.additions.toLocaleString('tr-TR')}</span>
                    {'  '}
                    <span className="text-red-400">−{c.deletions.toLocaleString('tr-TR')}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

type FH = Extract<CommandResult, { id: 'file-history' }>['data'];
function FileHistoryView({ data }: { data: FH }) {
  return (
    <Card>
      <CardHead
        title={data.path}
        subtitle={
          data.pathWasSearched
            ? `${data.owner}/${data.repo} · yol arama ile bulundu`
            : `${data.owner}/${data.repo}`
        }
      />
      <div className="px-6 py-5">
        {data.commits.length === 0 ? (
          <Empty>Bu dosya için commit bulunamadı.</Empty>
        ) : (
          <Table head={['SHA', 'Tarih', 'Yazar', 'Mesaj']}>
            {data.commits.map((c) => (
              <tr key={c.sha}>
                <td className="py-2 pr-4 font-mono text-xs">
                  <ExternalLink href={c.url}>{c.sha}</ExternalLink>
                </td>
                <td className="py-2 pr-4 whitespace-nowrap text-xs text-[var(--color-muted)]">
                  {c.date.slice(0, 10)}
                </td>
                <td className="py-2 pr-4 text-xs">{c.author}</td>
                <td className="py-2 text-xs text-[var(--color-muted)]">{c.message}</td>
              </tr>
            ))}
          </Table>
        )}
      </div>
    </Card>
  );
}

type AA = Extract<CommandResult, { id: 'actions-audit' }>['data'];
const WF_TONE: Record<string, Tone> = {
  critical: 'bad',
  risky: 'bad',
  warning: 'warn',
  info: 'info',
  ok: 'good',
  error: 'muted',
};
const WF_LABEL: Record<string, string> = {
  critical: 'Kritik',
  risky: 'Riskli',
  warning: 'Uyarı',
  info: 'Bilgi',
  ok: 'Temiz',
  error: 'Okunamadı',
};

function ActionsAuditView({ data }: { data: AA }) {
  if (!data.hasWorkflows) {
    return (
      <Card>
        <CardHead title={`${data.owner}/${data.repo}`} />
        <div className="px-6 py-5">
          <Empty>Bu depoda GitHub Actions iş akışı yok.</Empty>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {data.workflows.map((wf) => (
        <Card key={wf.path}>
          <CardHead
            title={wf.name}
            subtitle={<ExternalLink href={wf.url}>{wf.path}</ExternalLink>}
            right={<Badge tone={WF_TONE[wf.severity]}>{WF_LABEL[wf.severity]}</Badge>}
          />
          <ul className="divide-y divide-[var(--color-border)]">
            {wf.findings.map((f, i) => (
              <li key={i} className="px-6 py-3">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 text-xs ${toneText(WF_TONE[f.severity])}`}>
                    {f.severity === 'ok' ? '✓' : '!'}
                  </span>
                  <div>
                    <p className="text-sm">{f.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{f.detail}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

type CA = Extract<CommandResult, { id: 'commit-anomaly' }>['data'];
function CommitAnomalyView({ data }: { data: CA }) {
  return (
    <Card>
      <CardHead
        title={`${data.owner}/${data.repo}`}
        subtitle={`${data.scannedCount} commit tarandı`}
        right={
          <Badge tone={data.risky.length === 0 ? 'good' : 'warn'}>
            {data.risky.length === 0 ? 'Bulgu yok' : `${data.risky.length} işaretli`}
          </Badge>
        }
      />
      <div className="px-6 py-5">
        {data.risky.length === 0 ? (
          <Empty>Şüpheli kelime içeren commit mesajı bulunmadı.</Empty>
        ) : (
          <>
            <p className="mb-4 text-xs text-[var(--color-muted)]">
              Bunlar bulgu değil işarettir. &quot;temp&quot; yazan her commit sorunlu değildir, ama
              bakmaya değer.
            </p>
            <ul className="space-y-4">
              {data.risky.map((c) => (
                <li key={c.sha} className="border-l-2 border-amber-700/60 pl-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <ExternalLink href={c.url}>
                      <code className="text-xs">{c.sha}</code>
                    </ExternalLink>
                    <span className="text-sm">{c.message}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    {c.author} · {relativeTime(c.date)} · eşleşen:{' '}
                    <span className="text-amber-400">{c.matched.join(', ')}</span>
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

type UA = Extract<CommandResult, { id: 'user-analysis' }>['data'];
function UserAnalysisView({ data }: { data: UA }) {
  return (
    <Card>
      <CardHead
        title={
          <span className="flex items-center gap-3">
            {data.avatarUrl && (
              <img src={data.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
            )}
            <ExternalLink href={data.htmlUrl}>{data.login}</ExternalLink>
          </span>
        }
        subtitle={data.name ?? undefined}
      />
      <div className="space-y-8 px-6 py-5">
        <Stats
          items={[
            { label: 'Takipçi', value: data.followers.toLocaleString('tr-TR') },
            { label: 'Takip', value: data.following.toLocaleString('tr-TR') },
            { label: 'Depo', value: data.publicRepos.toLocaleString('tr-TR') },
            { label: 'Gist', value: data.publicGists.toLocaleString('tr-TR') },
          ]}
        />

        <KeyValues
          items={[
            { label: 'Katılım', value: `${formatDate(data.createdAt)} · ${relativeTime(data.createdAt)}` },
            { label: 'Konum', value: data.location ?? '—' },
            { label: 'Kurum', value: data.company ?? '—' },
            { label: 'Bio', value: data.bio ?? '—' },
          ]}
        />

        {data.topRepos.length > 0 && (
          <div>
            <SectionTitle>Öne çıkan depolar</SectionTitle>
            <ul className="space-y-3">
              {data.topRepos.map((r) => (
                <li key={r.name} className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <ExternalLink href={r.url}>
                      <span className="font-mono text-sm">{r.name}</span>
                    </ExternalLink>
                    {r.description && (
                      <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted)]">
                    ★ {r.stars.toLocaleString('tr-TR')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.languages.length > 0 && (
          <div>
            <SectionTitle>Diller</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {data.languages.map((l) => (
                <Badge key={l.name} tone="muted">
                  {l.name} · {l.count}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

type UAN = Extract<CommandResult, { id: 'user-anomaly' }>['data'];
function UserAnomalyView({ data }: { data: UAN }) {
  const tone: Tone = data.riskLevel === 'low' ? 'good' : data.riskLevel === 'medium' ? 'warn' : 'bad';
  const caption = data.riskLevel === 'low' ? 'Olağan' : data.riskLevel === 'medium' ? 'Dikkat' : 'Olağandışı';
  const maxBlock = Math.max(1, ...data.activityBlocks.map((b) => b.count));

  return (
    <Card>
      <CardHead
        title={
          <span className="flex items-center gap-3">
            {data.avatarUrl && (
              <img src={data.avatarUrl} alt="" width={32} height={32} className="rounded-full" />
            )}
            {data.login}
          </span>
        }
        right={<Score value={data.riskScore} tone={tone} caption={caption} />}
      />
      <div className="space-y-8 px-6 py-5">
        <p className="rounded-lg border border-[var(--color-border)] px-4 py-3 text-xs text-[var(--color-muted)]">
          Yüksek puan &quot;bu hesap kötü niyetli&quot; demek değildir. &quot;Davranışı olağandışı,
          bakmaya değer&quot; demektir.
        </p>

        <Stats
          items={[
            {
              label: 'Hesap yaşı',
              value:
                data.accountAgeDays === null
                  ? '—'
                  : data.accountAgeDays > 365
                    ? `${(data.accountAgeDays / 365).toFixed(1)} yıl`
                    : `${data.accountAgeDays} gün`,
            },
            { label: 'Depo', value: `${data.publicRepos}` },
            { label: 'Takipçi/Takip', value: `${data.followers}/${data.following}` },
            { label: 'Fork oranı', value: `${data.forkCount}/${data.repoCount}` },
          ]}
        />

        <div>
          <SectionTitle>Bulgular</SectionTitle>
          {data.anomalies.length === 0 ? (
            <Empty>Olağandışı bir örüntü görülmedi.</Empty>
          ) : (
            <ul className="space-y-2">
              {data.anomalies.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className={`mt-0.5 shrink-0 ${toneText(a.level === 'warning' ? 'warn' : 'info')}`}>
                    {a.level === 'warning' ? '!' : 'i'}
                  </span>
                  <span>{a.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.eventsAnalyzed > 0 && (
          <div>
            <SectionTitle>Etkinlik dağılımı ({data.eventsAnalyzed} olay)</SectionTitle>
            <ul className="space-y-2.5">
              {data.activityBlocks.map((b) => (
                <li key={b.label}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-mono text-[var(--color-muted)]">{b.label}</span>
                    <span className="tabular-nums text-[var(--color-muted)]">{b.count}</span>
                  </div>
                  <Bar percent={(b.count / maxBlock) * 100} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}

const CONFIDENCE_TONE: Record<string, Tone> = { high: 'bad', medium: 'warn', low: 'muted' };
const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'yüksek',
  medium: 'orta',
  low: 'düşük',
};

type SS = Extract<CommandResult, { id: 'scan-secrets' }>['data'];
function ScanSecretsView({ data }: { data: SS }) {
  return (
    <div className="space-y-4">
      <SensitiveNotice>
        Bu sonuç kaydedilmedi ve paylaşılabilir bir adresi yok. Değerler maskeli gösteriliyor; ham
        anahtar hiçbir yerde tutulmuyor. Bir şey bulduysan sahibine bildir, yayınlama.
      </SensitiveNotice>

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={`${data.commitsScanned} commit, ${data.filesScanned} dosya tarandı`}
          right={
            <Badge tone={data.findings.length === 0 ? 'good' : 'bad'}>
              {data.findings.length === 0 ? 'Bulgu yok' : `${data.findings.length} bulgu`}
            </Badge>
          }
        />
        <div className="px-6 py-5">
          {data.findings.length === 0 ? (
            <Empty>Taranan commit&apos;lerde sır bulunmadı.</Empty>
          ) : (
            <Table head={['Tür', 'Değer', 'Dosya', 'Commit', 'Güven']}>
              {data.findings.map((f, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4 text-xs">{f.type}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--color-muted)]">{f.masked}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {f.file}
                    <span className="text-[var(--color-muted)]">:{f.line}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    <ExternalLink href={f.commitUrl}>{f.commitSha}</ExternalLink>
                  </td>
                  <td className="py-2 text-xs">
                    <Badge tone={CONFIDENCE_TONE[f.confidence]}>
                      {CONFIDENCE_LABEL[f.confidence]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

type AS = Extract<CommandResult, { id: 'advanced-secrets' }>['data'];
function AdvancedSecretsView({ data }: { data: AS }) {
  return (
    <div className="space-y-4">
      <SensitiveNotice>
        Bu sonuç kaydedilmedi ve paylaşılabilir bir adresi yok. Değerler maskeli gösteriliyor; ham
        anahtar hiçbir yerde tutulmuyor. Bir şey bulduysan sahibine bildir, yayınlama.
      </SensitiveNotice>

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={`${data.filesScanned} dosya, ${data.commitsScanned} commit tarandı${data.truncatedTree ? ' · dosya ağacı çok büyük, kısmen tarandı' : ''}`}
          right={
            <Badge tone={data.findings.length === 0 ? 'good' : 'bad'}>
              {data.findings.length === 0 ? 'Bulgu yok' : `${data.findings.length} bulgu`}
            </Badge>
          }
        />
        <div className="px-6 py-5">
          {data.findings.length === 0 ? (
            <Empty>Taranan dosya ve commit&apos;lerde sır bulunmadı.</Empty>
          ) : (
            <Table head={['Tür', 'Değer', 'Konum', 'Kaynak', 'Güven']}>
              {data.findings.map((f, i) => (
                <tr key={i}>
                  <td className="py-2 pr-4 text-xs">{f.type}</td>
                  <td className="py-2 pr-4 font-mono text-xs text-[var(--color-muted)]">{f.masked}</td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    <ExternalLink href={f.url}>{f.path}</ExternalLink>
                    <span className="text-[var(--color-muted)]">:{f.line}</span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-[var(--color-muted)]">{f.sourceLabel}</td>
                  <td className="py-2 text-xs">
                    <Badge tone={CONFIDENCE_TONE[f.confidence]}>
                      {CONFIDENCE_LABEL[f.confidence]}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}

const DORK_TONE: Record<string, Tone> = {
  confirmed: 'bad',
  suspicious: 'warn',
  clean: 'good',
  unverified: 'muted',
  unreadable: 'muted',
};

type DS = Extract<CommandResult, { id: 'dork-scan' }>['data'];
function DorkScanView({ data }: { data: DS }) {
  return (
    <div className="space-y-4">
      <SensitiveNotice>
        Bu sonuç kaydedilmedi ve paylaşılabilir bir adresi yok. Burada gördüğün dosyalar
        başkalarının depolarına ait. Bir şey bulduysan <strong>sahibine bildir</strong>, yayınlama
        veya kullanma — aksi hâlde sorumluluk sana ait.
      </SensitiveNotice>

      <Card>
        <CardHead
          title={<span className="font-mono text-xs">{data.query}</span>}
          subtitle={
            data.verified
              ? `${data.totalFound.toLocaleString('tr-TR')} sonuç bulundu · ${data.filteredOut} tanesi temiz çıkıp elendi`
              : `${data.totalFound.toLocaleString('tr-TR')} sonuç bulundu · içerik doğrulanmadı`
          }
        />
        <div className="px-6 py-5">
          {data.hits.length === 0 ? (
            <Empty>
              {data.verified
                ? 'Sonuçların hiçbirinde sır bulunmadı.'
                : 'Sonuç bulunamadı.'}
            </Empty>
          ) : (
            <ul className="space-y-5">
              {data.hits.map((hit, i) => (
                <li key={i} className="border-l-2 border-[var(--color-border)] pl-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <ExternalLink href={hit.url}>
                      <span className="font-mono text-xs">
                        {hit.repo}/{hit.path}
                      </span>
                    </ExternalLink>
                    <Badge tone={DORK_TONE[hit.verdict]}>{hit.verdictLabel}</Badge>
                  </div>
                  {hit.matches.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {hit.matches.map((m, j) => (
                        <li key={j} className="text-xs text-[var(--color-muted)]">
                          {m.type} · <span className="font-mono">{m.masked}</span> · satır {m.line}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
