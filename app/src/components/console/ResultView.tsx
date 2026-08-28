import type { CommandResult } from '../../engine';
import type { Tone } from './ui';
import {
  ActionList,
  Badge,
  Bar,
  Card,
  CardHead,
  Details,
  Empty,
  ExternalLink,
  GoodList,
  KeyValues,
  Score,
  SectionTitle,
  Stats,
  Table,
  Verdict,
  toneText,
} from './ui';
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

/**
 * Depo analizi.
 *
 * Ham sayılar tek başına bir şey anlatmıyor: 1200 yıldız iyi mi, 3 katkıda
 * bulunan az mı? Burada iki soruya cevap veriliyor — bu depo hâlâ yaşıyor mu,
 * ve tek bir kişiye mi bağlı. İkisi de bir bağımlılığa güvenip güvenmeyeceğine
 * karar verirken bakılan şeyler.
 */
function AnalysisView({ data }: { data: A }) {
  const daysSinceUpdate = data.updatedAt
    ? Math.floor((Date.now() - new Date(data.updatedAt).getTime()) / 86_400_000)
    : null;

  // "Otobüs faktörü": katkının ne kadarı tek kişide toplanmış.
  const topTotal = data.topContributors.reduce((sum, c) => sum + c.contributions, 0);
  const topShare = topTotal > 0 ? data.topContributors[0].contributions / topTotal : 0;
  const concentrated = data.topContributors.length > 0 && topShare > 0.8;

  const stale = daysSinceUpdate !== null && daysSinceUpdate > 365;
  const slowing = daysSinceUpdate !== null && daysSinceUpdate > 180 && !stale;

  let tone: Tone = 'good';
  let headline: string;
  if (stale) {
    tone = 'bad';
    headline = 'Bir yıldan uzun süredir güncellenmemiş';
  } else if (slowing) {
    tone = 'warn';
    headline = 'Uzun süredir güncellenmemiş';
  } else if (concentrated) {
    tone = 'warn';
    headline = 'Aktif, ama tek kişiye bağlı';
  } else {
    headline = 'Aktif ve birden fazla kişi taşıyor';
  }

  const parts: string[] = [];
  parts.push(`Son güncelleme ${relativeTime(data.updatedAt)}.`);
  if (data.totalContributors > 0) {
    parts.push(
      concentrated
        ? `Katkının %${Math.round(topShare * 100)}’i tek kişiden (${data.topContributors[0].login}) geliyor — o kişi çekilirse proje sahipsiz kalır.`
        : `${data.totalContributors} kişi katkıda bulunmuş, yük dağılmış görünüyor.`,
    );
  }
  if (data.openIssues > 50) {
    parts.push(`${data.openIssues} açık issue birikmiş.`);
  }

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={parts.join(' ')} />

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle={data.description ?? 'Açıklama yok'}
        />
        <div className="space-y-8 p-6">
          <Stats
            items={[
              { label: 'Yıldız', value: data.stars.toLocaleString('tr-TR') },
              { label: 'Fork', value: data.forks.toLocaleString('tr-TR') },
              { label: 'Açık issue', value: data.openIssues.toLocaleString('tr-TR') },
              { label: 'Toplam PR', value: data.totalPullRequests.toLocaleString('tr-TR') },
            ]}
          />

          {data.languages.length > 0 && (
            <div>
              <SectionTitle>Diller</SectionTitle>
              <ul className="space-y-2.5">
                {data.languages.slice(0, 5).map((l) => (
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

          <div>
            <SectionTitle>Kim taşıyor</SectionTitle>
            {data.topContributors.length === 0 ? (
              <Empty>Katkı kaydı bulunamadı.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {data.topContributors.map((c) => {
                  const share = topTotal > 0 ? (c.contributions / topTotal) * 100 : 0;
                  return (
                    <li key={c.login}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="truncate">{c.login}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">
                          {c.contributions.toLocaleString('tr-TR')}
                        </span>
                      </div>
                      <Bar percent={share} tone={concentrated && share > 80 ? 'warn' : 'info'} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Details summary="Diğer ayrıntılar">
            <KeyValues
              items={[
                {
                  label: 'Oluşturulma',
                  value: `${formatDate(data.createdAt)} · ${relativeTime(data.createdAt)}`,
                },
                { label: 'Varsayılan dal', value: <code>{data.defaultBranch}</code> },
                { label: 'Lisans', value: data.license ?? 'Yok' },
                { label: 'İncelenen commit', value: String(data.commitsAnalyzed) },
                {
                  label: 'Son commit’leri atanlar',
                  value: data.topCommitters.map((c) => c.name).join(', ') || '—',
                },
              ]}
            />
          </Details>
        </div>
      </Card>
    </div>
  );
}

type S = Extract<CommandResult, { id: 'security-score' }>['data'];

/**
 * Güvenlik puanı raporu.
 *
 * Önce hüküm: bu puan ne anlama geliyor. Sonra ne yapılacağı, etkiye göre
 * sıralı. Kriter listesi en altta ve katlanmış: kanıt görünür olmalı ama
 * başrolde olmamalı.
 */
function SecurityScoreView({ data }: { data: S }) {
  const failing = data.criteria.filter((c) => c.status === 'fail');
  const passing = data.criteria.filter((c) => c.status === 'pass');
  const unknown = data.criteria.filter((c) => c.status === 'unknown');
  const lost = failing.reduce((sum, c) => sum + c.weight, 0);

  const tone: Tone = data.verdict === 'excellent' ? 'good' : data.verdict === 'good' ? 'warn' : 'bad';

  const headline =
    data.verdict === 'excellent'
      ? 'Güvenlik hijyeni iyi durumda'
      : data.verdict === 'good'
        ? 'Temel şeyler yerinde, birkaç eksik var'
        : 'Birkaç önemli eksik var';

  const parts: string[] = [];
  parts.push(
    failing.length === 0
      ? `Değerlendirilen ${data.evaluatedCount} kriterin hepsi karşılanıyor.`
      : `Değerlendirilen ${data.evaluatedCount} kriterden ${failing.length} tanesi karşılanmıyor ve ${lost} puan kaybettiriyor.`,
  );
  if (failing.length > 0) {
    parts.push(`Hepsi düzeltilebilir — en önemlisi: ${failing[0].label.toLowerCase()}.`);
  }
  if (unknown.length > 0) {
    parts.push(
      `${unknown.length} kriter okunamadığı için puanlamaya katılmadı; bu bilgiler depo yöneticisine açık.`,
    );
  }

  const actions = [...failing]
    .sort((a, b) => b.weight - a.weight)
    .filter((c) => c.fix)
    .map((c) => ({ key: c.id, text: c.fix!, weight: c.weight }));

  return (
    <div className="space-y-5">
      <Verdict
        tone={tone}
        headline={headline}
        summary={parts.join(' ')}
        score={{ value: data.score, caption: `${data.owner}/${data.repo}` }}
      />

      {actions.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="Puanı yükseltmek için" items={actions} />
          </div>
        </Card>
      )}

      {passing.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>Zaten yerinde</SectionTitle>
            <GoodList items={passing.map((c) => c.label)} />
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <Details summary={`Bütün kriterler (${data.criteria.length})`}>
            <ul className="divide-y divide-[var(--color-line)]">
              {data.criteria.map((c) => {
                const mark = c.status === 'pass' ? '✓' : c.status === 'fail' ? '✕' : '–';
                const t: Tone = c.status === 'pass' ? 'good' : c.status === 'fail' ? 'bad' : 'muted';
                return (
                  <li key={c.id} className="flex items-start justify-between gap-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className={`w-3 shrink-0 ${toneText(t)}`}>{mark}</span>
                      <span className="min-w-0">{c.label}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-[var(--color-muted)]">
                      {c.detail}
                      {c.status === 'fail' && (
                        <span className="ml-2 text-[var(--color-bad)]">−{c.weight}</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Details>
        </div>
      </Card>
    </div>
  );
}

type C = Extract<CommandResult, { id: 'content-audit' }>['data'];

/**
 * Eksik bir dosyanın neden önemli olduğu.
 *
 * "CONTRIBUTING.md yok" bir bilgi; "katkı yapmak isteyen nereden başlayacağını
 * bilemiyor" bir sebep. Kullanıcı ikincisini okuyunca ne yapacağına karar
 * verebiliyor.
 */
const WHY_MISSING: Record<string, string> = {
  LICENSE: 'Lisans olmadan kod hukuken kullanılamaz; kimse bağımlılık olarak ekleyemez.',
  'SECURITY.md':
    'Açık bulan biri sana nasıl ulaşacağını bilmiyor; büyük ihtimalle herkese açık bir issue açar.',
  'CODE_OF_CONDUCT.md': 'Tartışma kızıştığında başvurulacak yazılı bir kural yok.',
  'CONTRIBUTING.md':
    'Katkı yapmak isteyen nereden başlayacağını bilemiyor; gelen değişiklikler biçimsiz olur.',
  'README.md': 'Depoya gelen ilk kişi projenin ne işe yaradığını anlamıyor.',
};

function ContentAuditView({ data }: { data: C }) {
  const missing = data.items.filter((i) => i.quality === 'missing');
  const weak = data.items.filter((i) => i.quality === 'too_short' || i.quality === 'empty');
  const good = data.items.filter((i) => i.passed);

  const tone: Tone = missing.length === 0 ? (weak.length === 0 ? 'good' : 'warn') : 'bad';
  const headline =
    missing.length === 0 && weak.length === 0
      ? 'Topluluk standartlarının hepsi yerinde'
      : missing.length === 0
        ? 'Dosyalar var ama bazıları çok kısa'
        : `${missing.length} standart dosya eksik`;

  const summary =
    missing.length === 0 && weak.length === 0
      ? 'Depoya gelen biri ne işe yaradığını, nasıl katkı yapacağını ve sorunu nereye bildireceğini biliyor.'
      : [
          `${data.presentCount}/${data.totalCount} dosya mevcut.`,
          missing.length > 0 ? `Eksik: ${missing.map((m) => m.file).join(', ')}.` : '',
          weak.length > 0 ? `İçeriği yetersiz: ${weak.map((m) => m.file).join(', ')}.` : '',
        ]
          .filter(Boolean)
          .join(' ');

  const actions = [...missing, ...weak].map((i) => ({
    key: i.file,
    text:
      i.quality === 'missing'
        ? `${i.file} ekle — ${WHY_MISSING[i.file] ?? i.description}`
        : `${i.file} dosyasını genişlet — şu an ${i.qualityLabel.toLocaleLowerCase('tr')}.`,
  }));

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />

      {actions.length > 0 && (
        <Card>
          <div className="p-6">
            <ActionList title="Yapılacaklar" items={actions} />
          </div>
        </Card>
      )}

      {good.length > 0 && (
        <Card>
          <div className="p-6">
            <SectionTitle>Zaten yerinde</SectionTitle>
            <GoodList items={good.map((i) => i.file)} />
          </div>
        </Card>
      )}

      <Card>
        <div className="p-6">
          <Details summary="Dosya dosya durum">
            <ul className="divide-y divide-[var(--color-line)]">
              {data.items.map((item) => {
                const t: Tone =
                  item.quality === 'ok'
                    ? 'good'
                    : item.quality === 'missing'
                      ? 'bad'
                      : item.quality === 'unknown'
                        ? 'muted'
                        : 'warn';
                return (
                  <li
                    key={item.file}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-sm">{item.file}</p>
                      <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                        {item.description}
                        {item.foundAt && item.foundAt !== item.file && (
                          <span className="ml-2 font-mono">→ {item.foundAt}</span>
                        )}
                      </p>
                    </div>
                    <Badge tone={t}>{item.qualityLabel}</Badge>
                  </li>
                );
              })}
            </ul>
          </Details>
        </div>
      </Card>
    </div>
  );
}

type CI = Extract<CommandResult, { id: 'contrib-impact' }>['data'];

/**
 * Katkı etkisi.
 *
 * Buradaki asıl bilgi sıralama değil, DAĞILIM: yük tek kişide mi toplanmış?
 * Bir bağımlılık seçerken bakılması gereken şey budur — o kişi çekilirse
 * projeyi sürdürecek kimse kalır mı.
 */
function ContribImpactView({ data }: { data: CI }) {
  const total = data.contributors.reduce((sum, c) => sum + Math.max(0, c.score), 0);
  const topShare =
    total > 0 && data.contributors.length > 0 ? Math.max(0, data.contributors[0].score) / total : 0;
  const concentrated = topShare > 0.7;

  const tone: Tone = data.contributors.length === 0 ? 'muted' : concentrated ? 'warn' : 'good';
  const headline =
    data.contributors.length === 0
      ? 'Katkı verisi yok'
      : concentrated
        ? 'Yük tek kişide toplanmış'
        : 'Yük birden fazla kişiye dağılmış';

  const summary =
    data.contributors.length === 0
      ? 'GitHub bu depo için katkı istatistiği döndürmedi.'
      : concentrated
        ? `Değişikliklerin yüzde ${Math.round(topShare * 100)} kadarı ${data.contributors[0].login} tarafından yapılmış. Bu kişi çekilirse projeyi sürdürecek kimse kalmayabilir.`
        : `${data.contributors.length} kişi arasında dağılmış bir yük. En çok katkı yapan ${data.contributors[0].login}, payı yüzde ${Math.round(topShare * 100)}.`;

  return (
    <div className="space-y-5">
      <Verdict tone={tone} headline={headline} summary={summary} />

      <Card>
        <CardHead
          title={`${data.owner}/${data.repo}`}
          subtitle="Puan = eklenen satır × 0,7 − silinen satır × 0,3. Silmek de katkıdır ama eklemek kadar ağırlık taşımaz."
        />
        <div className="p-6">
          {data.statsPending ? (
            <Empty>
              GitHub bu deponun istatistiklerini hâlâ hesaplıyor. Birkaç saniye sonra tekrar dene.
            </Empty>
          ) : data.contributors.length === 0 ? (
            <Empty>Katkı verisi bulunamadı.</Empty>
          ) : (
            <ul className="space-y-4">
              {data.contributors.map((c) => {
                const share = total > 0 ? (Math.max(0, c.score) / total) * 100 : 0;
                return (
                  <li key={c.login} className="flex items-center gap-4">
                    {c.avatarUrl && (
                      <img
                        src={c.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 rounded-full"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-4 text-sm">
                        <span className="truncate">{c.login}</span>
                        <span className="tabular-nums text-[var(--color-muted)]">
                          %{share.toFixed(0)}
                        </span>
                      </div>
                      <div className="mt-1">
                        <Bar percent={share} tone={share > 70 ? 'warn' : 'info'} />
                      </div>
                      <p className="mt-1 text-xs text-[var(--color-faint)]">
                        <span className="text-[var(--color-good)]">
                          +{c.additions.toLocaleString('tr-TR')}
                        </span>{' '}
                        <span className="text-[var(--color-bad)]">
                          −{c.deletions.toLocaleString('tr-TR')}
                        </span>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

type FH = Extract<CommandResult, { id: 'file-history' }>['data'];
function FileHistoryView({ data }: { data: FH }) {
  return (
    <Card>
      <CardHead title={data.path} subtitle={`${data.owner}/${data.repo}`} />
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
          <ul className="divide-y divide-[var(--color-line)]">
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
        <p className="rounded-lg border border-[var(--color-line)] px-4 py-3 text-xs text-[var(--color-muted)]">
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
                <li key={i} className="border-l-2 border-[var(--color-line)] pl-4">
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
