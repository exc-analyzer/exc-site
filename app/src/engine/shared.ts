export function decodeBase64(b64: string): string {
  try {
    const binary = atob(b64.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}
export function shannonEntropy(text: string): number {
  if (!text) return 0;
  const counts = new Map<string, number>();
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
export function maskSecret(value: string): string {
  return '•'.repeat(Math.min(16, Math.max(8, value.length)));
}
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30.44));
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }
  const years = Math.max(1, Math.round(days / 365.25));
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export async function requirePushAccess(
  gh: { raw: <T>(path: string) => Promise<{ data: T | null }> },
  owner: string,
  repo: string,
  what: string,
): Promise<void> {
  const answer = await gh.raw<{ permissions?: { push?: boolean; admin?: boolean } }>(
    `/repos/${owner}/${repo}`,
  );
  const mine =
    answer.data?.permissions?.admin === true || answer.data?.permissions?.push === true;
  if (!mine) {
    throw new Error(
      `${what} only runs on repositories you can push to. Looking for secrets in code you do not work on is not something this tool does.`,
    );
  }
}
