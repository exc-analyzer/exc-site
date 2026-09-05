import { useState } from "react";
import { Card } from "../console/ui";
import { SITE_URL } from "../../lib/site";

function scoreColor(score: number | null): string {
  if (score === null) return "#6b7280";
  if (score >= 90) return "#22c55e";
  if (score >= 75) return "#eab308";
  if (score >= 50) return "#f97316";
  return "#ef4444";
}

export default function BadgeSnippet({
  owner,
  repo,
  score,
  cardVersion,
}: {
  owner: string;
  repo: string;
  score: number | null;
  cardVersion?: string;
}) {
  const [copied, setCopied] = useState(false);
  const badgeUrl = `https://img.shields.io/endpoint?url=${encodeURIComponent(`${SITE_URL}/badge/${owner}/${repo}.json`)}`;
  const pageUrl = `${SITE_URL}/app/r/${owner}/${repo}/`;
  const markdown = `[![EXC security](${badgeUrl})](${pageUrl})`;

  return (
    <Card>
      <div className="space-y-3 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">README badge</h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Drop it in your repository. The score refreshes itself every night
              and the badge links back here.
            </p>
          </div>
          <span className="flex shrink-0 overflow-hidden rounded font-sans text-[11px] leading-none">
            <span className="bg-[#555] px-2 py-1.5 text-white">
              EXC security
            </span>
            <span
              className="px-2 py-1.5 font-semibold text-white"
              style={{ backgroundColor: scoreColor(score) }}
            >
              {score ?? "—"}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-xs">
            {markdown}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(markdown).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              });
            }}
            className="btn btn-ghost btn-sm shrink-0"
          >
            {copied ? "Copied" : "Copy"}
          </button>
        </div>

        {cardVersion && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-line)] pt-3">
            <div className="min-w-0">
              <p className="text-sm">Share card</p>
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                A 1200×630 image of this verdict, refreshed every night. Made
                for posting.
              </p>
            </div>
            <a
              href={`${SITE_URL}/og/r/${owner}/${repo}.png?v=${cardVersion}`}
              download={`${owner}-${repo}.png`}
              className="btn btn-ghost shrink-0"
            >
              Download
            </a>
          </div>
        )}
      </div>
    </Card>
  );
}
