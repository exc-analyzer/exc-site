import { supabase } from "./supabase";
import { friendlyDbError } from "./dbError";
import { getGithubToken } from "./githubToken";

export const MAX_PINS = 3;

export interface PinnedRepo {
  owner: string;
  repo: string;
  note: string | null;
  position: number;
}

const COLUMNS = "owner, repo, note, position";

export function parseRepo(
  input: string,
): { owner: string; repo: string } | null {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const parts = cleaned.split("/");
  if (parts.length !== 2) return null;
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  return { owner, repo };
}

export interface RepoCheck {
  owner: string;
  repo: string;
  error: string | null;
}

export async function verifyRepo(
  owner: string,
  repo: string,
): Promise<RepoCheck> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  const token = getGithubToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let answer: Response;
  try {
    answer = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers,
    });
  } catch {
    return { owner, repo, error: "GitHub could not be reached." };
  }

  if (answer.status === 404) {
    return {
      owner,
      repo,
      error: `GitHub has no repository called ${owner}/${repo}.`,
    };
  }
  if (answer.status === 403 || answer.status === 429) {
    return {
      owner,
      repo,
      error: token
        ? "GitHub is rate limiting us. Try again in a minute."
        : "GitHub allows only a few checks an hour without an account. Sign in, or wait a little.",
    };
  }
  if (!answer.ok) {
    return { owner, repo, error: `GitHub answered ${answer.status}.` };
  }

  const body = (await answer.json()) as {
    full_name?: string;
    private?: boolean;
    archived?: boolean;
    permissions?: { push?: boolean; admin?: boolean };
  };

  if (body.private === true) {
    return {
      owner,
      repo,
      error:
        "That repository is private, so nobody visiting your page could open it.",
    };
  }

  const mine =
    body.permissions?.admin === true || body.permissions?.push === true;
  if (!mine) {
    return {
      owner,
      repo,
      error: "You can only pin a repository you can push to.",
    };
  }

  const [realOwner, realRepo] = (body.full_name ?? `${owner}/${repo}`).split(
    "/",
  );
  return { owner: realOwner, repo: realRepo, error: null };
}

export async function repoResolves(owner: string, repo: string): Promise<boolean> {
  try {
    const answer = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    return answer.status !== 404;
  } catch {
    return true;
  }
}

export async function loadPins(ownerId: string): Promise<PinnedRepo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("pinned_repos")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data as unknown as PinnedRepo[]) ?? [];
}

export async function addPin(
  ownerId: string,
  owner: string,
  repo: string,
  note: string | null,
  position: number,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No connection." };
  const { error } = await supabase
    .from("pinned_repos")
    .insert({
      owner_id: ownerId,
      owner,
      repo,
      note: note?.trim() || null,
      position,
    });
  return { error: friendlyDbError(error) };
}

export async function removePin(
  ownerId: string,
  owner: string,
  repo: string,
): Promise<{ error: string | null }> {
  if (!supabase) return { error: "No connection." };
  const { error } = await supabase
    .from("pinned_repos")
    .delete()
    .eq("owner_id", ownerId)
    .eq("owner", owner)
    .eq("repo", repo);
  return { error: friendlyDbError(error) };
}

export async function reorderPins(
  ownerId: string,
  pins: PinnedRepo[],
): Promise<void> {
  if (!supabase) return;
  await Promise.all(
    pins.map((pin, index) =>
      supabase!
        .from("pinned_repos")
        .update({ position: index })
        .eq("owner_id", ownerId)
        .eq("owner", pin.owner)
        .eq("repo", pin.repo),
    ),
  );
}
