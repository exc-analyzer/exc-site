import { useEffect, useState } from "react";
import {
  findRepos,
  LANGUAGES,
  starCount,
  type FoundRepo,
} from "../../lib/discover";
import { follow, isFollowing, unfollow } from "../../lib/follows";
import { probablySignedIn } from "../../lib/profile";
import { signInWithGitHub } from "../../lib/auth";
import { Blank, BlockSkeleton } from "../console/Chrome";
import SiteResults from "./SiteResults";
import Icon from "../Icon";

export default function Discover() {
  const [language, setLanguage] = useState<string | null>(null);
  const [term, setTerm] = useState("");
  const [query, setQuery] = useState("");
  const [repos, setRepos] = useState<FoundRepo[] | null>(null);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [fix, setFix] = useState<{ href: string; label: string } | null>(null);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(probablySignedIn());
  }, []);

  useEffect(() => {
    let alive = true;
    setRepos(null);
    setPage(1);
    void findRepos(language, query, 1).then((answer) => {
      if (!alive) return;
      setRepos(answer.repos);
      setMore(answer.more);
      setProblem(answer.problem);
      setFix(answer.fix);
    });
    return () => {
      alive = false;
    };
  }, [language, query]);

  async function showMore() {
    if (!repos) return;
    const next = page + 1;
    const answer = await findRepos(language, query, next);
    setRepos([...repos, ...answer.repos]);
    setMore(answer.more);
    setProblem(answer.problem);
    setFix(answer.fix);
    setPage(next);
  }

  return (
    <section className="space-y-5">
      <form
        className="flex items-center gap-2 rounded-full border border-[var(--color-line)] px-4 py-2 focus-within:border-[var(--color-line-active)]"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term);
        }}
      >
        <Icon name="search" size={15} className="text-[var(--color-faint)]" />
        <input
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-faint)]"
          value={term}
          placeholder="Search people, posts and repositories"
          onChange={(e) => setTerm(e.target.value)}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear"
            className="text-[var(--color-faint)] hover:text-[var(--color-text)]"
            onClick={() => {
              setTerm("");
              setQuery("");
            }}
          >
            <Icon name="cross" size={14} />
          </button>
        )}
      </form>

      <SiteResults query={query} />

      {query && <p className="eyebrow">Repositories on GitHub</p>}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setLanguage(null)}
          className={language === null ? "nav-pill nav-pill-active" : "nav-pill"}
        >
          Everything
        </button>
        {LANGUAGES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setLanguage(language === name ? null : name)}
            className={language === name ? "nav-pill nav-pill-active" : "nav-pill"}
          >
            {name}
          </button>
        ))}
      </div>

      {problem && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--color-warn)]">
          <span>{problem}</span>
          {fix && (
            <a
              href={fix.href}
              className="font-medium text-[var(--color-text)] underline underline-offset-2"
            >
              {fix.label}
            </a>
          )}
        </p>
      )}

      {repos === null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <BlockSkeleton height="h-32" />
          <BlockSkeleton height="h-32" />
          <BlockSkeleton height="h-32" />
          <BlockSkeleton height="h-32" />
        </div>
      ) : repos.length === 0 ? (
        <Blank icon="search" title="Nothing came back for that" />
      ) : (
        <>
          <ul className="grid gap-3 sm:grid-cols-2">
            {repos.map((entry) => (
              <li key={`${entry.owner}/${entry.repo}`}>
                <RepoCard entry={entry} signedIn={signedIn} />
              </li>
            ))}
          </ul>

          {more && (
            <div className="pt-1 text-center">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => void showMore()}
              >
                Show more
              </button>
            </div>
          )}
        </>
      )}

      <p className="text-2xs leading-relaxed text-[var(--color-faint)]">
        Results come straight from GitHub&apos;s search API as you ask for them. We do not keep a
        copy — nothing on this page is stored on our side.
      </p>
    </section>
  );
}

function RepoCard({ entry, signedIn }: { entry: FoundRepo; signedIn: boolean }) {
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [snag, setSnag] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) {
      setFollowing(false);
      return;
    }
    void isFollowing(entry.owner, entry.repo).then(setFollowing);
  }, [signedIn, entry.owner, entry.repo]);

  return (
    <div className="surface surface-hover flex h-full flex-col p-4">
      <div className="flex items-start gap-3">
        <img
          src={`https://avatars.githubusercontent.com/${entry.owner}?s=64`}
          alt=""
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-8 shrink-0 rounded-md bg-[var(--color-raised)] object-cover"
        />
        <div className="min-w-0 flex-1">
          <a
            href={`/app/r/${entry.owner}/${entry.repo}/`}
            className="block truncate font-mono text-sm text-[var(--color-text)] hover:underline"
          >
            {entry.owner}/{entry.repo}
          </a>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <Icon name="star" size={11} />
              {starCount(entry.stars)}
            </span>
            {entry.language && <span>· {entry.language}</span>}
          </p>
        </div>
      </div>

      {entry.description && (
        <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-[var(--color-muted)]">
          {entry.description}
        </p>
      )}

      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <a
          href={`/app/scan/?repo=${entry.owner}/${entry.repo}`}
          className="btn btn-ghost btn-sm"
        >
          <Icon name="scan" size={13} />
          Scan it
        </a>
        {following !== null && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={busy}
            onClick={() => {
              if (!signedIn) {
                void signInWithGitHub();
                return;
              }
              setBusy(true);
              const work = following
                ? unfollow(entry.owner, entry.repo)
                : follow(entry.owner, entry.repo);
              void work
                .then((trouble) => {
                  if (trouble) setSnag(trouble);
                  else {
                    setSnag(null);
                    setFollowing(!following);
                  }
                })
                .finally(() => setBusy(false));
            }}
          >
            <Icon name="bell" size={13} />
            {following ? "Following" : "Follow"}
          </button>
        )}
      </div>
      {snag && (
        <p className="mt-2 text-2xs text-[var(--color-bad)]">{snag}</p>
      )}
    </div>
  );
}
