import { useEffect, useRef, useState } from 'react';
import { createPost, type FeedItem } from '../../lib/feed';
import { parseRepo } from '../../lib/github';
import { loadMyProfile, accentColor, shownAvatar, shownName, type Profile } from '../../lib/profile';
import { RichText } from '../../lib/richText';
import { Avatar } from '../profile/ProfileEditor';
import Icon, { type IconName } from '../Icon';

const LIMIT = 4000;
const DRAFT_KEY = 'exc.draft';

const PROMPTS = [
  'What did you find?',
  'Which repository surprised you this week?',
  'Something worth warning people about?',
  'A dependency you would vouch for?',
  'What are you reading the source of?',
];

interface Format {
  icon: IconName;
  label: string;
  before: string;
  after: string;
  block?: boolean;
}

const FORMATS: Format[] = [
  { icon: 'bold', label: 'Bold', before: '**', after: '**' },
  { icon: 'italic', label: 'Italic', before: '*', after: '*' },
  { icon: 'code', label: 'Code', before: '`', after: '`' },
  { icon: 'quote', label: 'Quote', before: '> ', after: '', block: true },
  { icon: 'list', label: 'List', before: '- ', after: '', block: true },
  { icon: 'link', label: 'Link', before: '[', after: '](https://)' },
];

export default function Composer({
  onPosted,
  quoting = null,
  onClearQuote,
}: {
  onPosted: () => void;
  quoting?: FeedItem | null;
  onClearQuote?: () => void;
}) {
  const [body, setBody] = useState('');
  const [repo, setRepo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [prompt] = useState(() => PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void loadMyProfile().then(setProfile);
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft = JSON.parse(saved) as { body?: string; repo?: string };
        if (draft.body) setBody(draft.body);
        if (draft.repo) setRepo(draft.repo);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (body.trim() || repo.trim()) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ body, repo }));
      } else {
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch {}
  }, [body, repo]);

  useEffect(() => {
    const el = area.current;
    if (!el || preview) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 460)}px`;
  }, [body, preview]);

  const parsed = repo.trim() ? parseRepo(repo) : null;
  const repoInvalid = repo.trim().length > 0 && parsed === null;
  const left = LIMIT - body.length;
  const ratio = Math.min(1, body.length / LIMIT);
  const counterTone =
    left < 0 ? 'var(--color-bad)' : left < 200 ? 'var(--color-warn)' : 'var(--color-line-strong)';
  const canPost = body.trim().length > 0 && left >= 0 && !repoInvalid && !busy;

  const placeholder = quoting ? 'Add your take…' : prompt;

  function apply(format: Format) {
    const el = area.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end);

    if (format.block) {
      const lineStart = body.lastIndexOf('\n', start - 1) + 1;
      const next = body.slice(0, lineStart) + format.before + body.slice(lineStart);
      setBody(next);
      queueMicrotask(() => {
        el.focus();
        el.setSelectionRange(start + format.before.length, end + format.before.length);
      });
      return;
    }

    const next = body.slice(0, start) + format.before + selected + format.after + body.slice(end);
    setBody(next);
    queueMicrotask(() => {
      el.focus();
      const from = start + format.before.length;
      el.setSelectionRange(from, from + selected.length);
    });
  }

  async function submit() {
    if (!canPost) return;
    setBusy(true);
    setError(null);
    const { error } = await createPost(body, parsed ?? undefined, quoting?.id);
    setBusy(false);
    if (error) {
      setError(error);
      return;
    }
    setBody('');
    setRepo('');
    setPreview(false);
    onClearQuote?.();
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
    onPosted();
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex gap-3.5 px-4 pt-4 sm:gap-4 sm:px-5">
        <Avatar
          src={profile ? shownAvatar(profile) : null}
          name={profile ? shownName(profile) : '?'}
          accent={profile ? accentColor(profile.accent) : undefined}
          size={38}
        />

        <div className="min-w-0 flex-1">
          {preview ? (
            <div className="min-h-[76px] rounded-[var(--radius-control)] border border-dashed border-[var(--color-line)] px-3 py-2.5">
              {body.trim() ? (
                <RichText body={body} />
              ) : (
                <p className="text-sm text-[var(--color-faint)]">Nothing to preview yet.</p>
              )}
            </div>
          ) : (
            <textarea
              ref={area}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={3}
              placeholder={placeholder}
              className="w-full resize-none border-0 bg-transparent p-0 text-base text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)]"
            />
          )}

          {quoting && (
            <div className="mt-3 rounded-[var(--radius-control)] border border-[var(--color-line)] px-3.5 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-[var(--color-faint)]">
                  Quoting {quoting.author_login ?? 'someone'}
                </p>
                <button
                  type="button"
                  aria-label="Drop the quote"
                  onClick={() => onClearQuote?.()}
                  className="text-[var(--color-faint)] transition hover:text-[var(--color-bad)]"
                >
                  <Icon name="cross" size={13} />
                </button>
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-[var(--color-muted)]">{quoting.body}</p>
            </div>
          )}

          {parsed && (
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] px-2.5 py-0.5 font-mono text-xs text-[var(--color-muted)]">
              <Icon name="repo" size={12} />
              {parsed.owner}/{parsed.repo}
              <button
                type="button"
                onClick={() => setRepo('')}
                aria-label="Remove the repository"
                className="text-[var(--color-faint)] transition hover:text-[var(--color-bad)]"
              >
                <Icon name="cross" size={12} />
              </button>
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-3 py-2.5">
        <div className="flex items-center gap-0.5">
          {FORMATS.map((format) => (
            <button
              key={format.label}
              type="button"
              title={format.label}
              aria-label={format.label}
              disabled={preview}
              onClick={() => apply(format)}
              className="rounded-[var(--radius-control)] p-1.5 text-[var(--color-faint)] transition hover:bg-[rgba(163,145,224,0.08)] hover:text-[var(--color-text)] disabled:opacity-40"
            >
              <Icon name={format.icon} size={15} />
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-[var(--color-line)]" />

          <button
            type="button"
            title={preview ? 'Keep writing' : 'Preview'}
            aria-label={preview ? 'Keep writing' : 'Preview'}
            aria-pressed={preview}
            onClick={() => setPreview((v) => !v)}
            className={`rounded-[var(--radius-control)] p-1.5 transition hover:bg-[rgba(163,145,224,0.08)] ${
              preview ? 'text-[var(--color-link)]' : 'text-[var(--color-faint)]'
            }`}
          >
            <Icon name={preview ? 'pencil' : 'eye'} size={15} />
          </button>
        </div>

        <input
          className="min-w-0 flex-1 basis-40 rounded-[var(--radius-control)] border border-transparent bg-transparent px-2 py-1 font-mono text-xs text-[var(--color-text)] outline-none placeholder:text-[var(--color-faint)] focus:border-[var(--color-line)]"
          value={repo}
          placeholder="owner/repo"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => setRepo(e.target.value)}
        />

        <div className="ml-auto flex items-center gap-3">
          {body.length > 0 && (
            <span className="relative grid size-7 place-items-center" title={`${left} left`}>
              <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
                <circle cx="14" cy="14" r="11" fill="none" stroke="var(--color-line)" strokeWidth="2.5" />
                <circle
                  cx="14"
                  cy="14"
                  r="11"
                  fill="none"
                  stroke={counterTone}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${ratio * 69.1} 69.1`}
                />
              </svg>
              {left < 200 && (
                <span
                  className="absolute text-[9px] font-semibold tabular-nums"
                  style={{ color: counterTone }}
                >
                  {left}
                </span>
              )}
            </span>
          )}

          <button type="button" className="btn btn-primary" disabled={!canPost} onClick={() => void submit()}>
            {busy ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {(repoInvalid || error) && (
        <p className="px-5 pb-3 text-xs text-[var(--color-bad)]">
          {repoInvalid ? 'A repository is written as owner/repo.' : error}
        </p>
      )}
    </div>
  );
}
