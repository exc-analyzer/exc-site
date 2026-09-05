export function ScoreCaveat({ scannedAt }: { scannedAt?: string | null }) {
  const when = scannedAt ? new Date(scannedAt).toISOString().slice(0, 10) : null;
  return (
    <p className="mt-3 text-2xs leading-relaxed text-[var(--color-faint)]">
      Automated checks against public GitHub data{when ? `, run on ${when}` : ""}. Not a security
      audit. The checks are heuristics — there are false positives and false negatives, and a
      score out of 100 says nothing about which individual things this project does. Checks we
      could not read are marked unknown and are not counted against the score.{" "}
      <a href="/app/methodology/" className="link">
        How the score works
      </a>{" "}
      ·{" "}
      <a href="/app/takedown/" className="link">
        Wrong or unwanted?
      </a>
    </p>
  );
}
