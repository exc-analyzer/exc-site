import { forgetGithubToken, getGithubToken } from "./githubToken";

export interface FoundRepo {
  owner: string;
  repo: string;
  description: string | null;
  stars: number;
  language: string | null;
  topics: string[];
}

export const LANGUAGES = [
  "TypeScript",
  "JavaScript",
  "Python",
  "Go",
  "Rust",
  "Java",
  "C",
  "C++",
  "Ruby",
  "PHP",
] as const;

interface SearchItem {
  full_name: string;
  description: string | null;
  stargazers_count?: number;
  language: string | null;
  topics?: string[];
  archived?: boolean;
  fork?: boolean;
}

export interface SearchAnswer {
  repos: FoundRepo[];
  more: boolean;
  problem: string | null;
  fix: { href: string; label: string } | null;
}

const RECONNECT = { href: "/app/scan/", label: "Reconnect GitHub" };

export async function findRepos(
  language: string | null,
  term: string,
  page = 1,
): Promise<SearchAnswer> {
  const parts: string[] = [];
  const cleaned = term.trim().replace(/[^\w .\-/]/g, " ").trim();
  if (cleaned) parts.push(cleaned);
  if (language) parts.push(`language:${language}`);
  if (!cleaned) parts.push("stars:>5000");

  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", parts.join(" "));
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", "12");
  url.searchParams.set("page", String(page));

  async function ask(token: string | null): Promise<Response | null> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(url, { headers });
    } catch {
      return null;
    }
  }

  const token = getGithubToken();
  let answer = await ask(token);

  if (answer?.status === 401 && token) {
    forgetGithubToken();
    answer = await ask(null);
  }

  if (!answer) {
    return {
      repos: [],
      more: false,
      problem: "GitHub could not be reached.",
      fix: null,
    };
  }

  if (answer.status === 401) {
    return {
      repos: [],
      more: false,
      problem:
        "GitHub would not accept that request. Your connection to GitHub has probably expired.",
      fix: RECONNECT,
    };
  }

  if (answer.status === 403 || answer.status === 429) {
    return {
      repos: [],
      more: false,
      problem: token
        ? "GitHub is rate limiting the search. Wait a minute and try again."
        : "GitHub allows only 10 searches a minute without an account. Sign in, or wait a minute.",
      fix: token ? null : RECONNECT,
    };
  }

  if (answer.status === 422) {
    return {
      repos: [],
      more: false,
      problem: "GitHub could not read that search. Try plainer words.",
      fix: null,
    };
  }

  if (!answer.ok) {
    return {
      repos: [],
      more: false,
      problem: `GitHub answered ${answer.status}. Try again in a moment.`,
      fix: answer.status >= 500 ? null : RECONNECT,
    };
  }

  const body = (await answer.json()) as {
    items?: SearchItem[];
    total_count?: number;
  };
  const items = (body.items ?? []).filter((i) => !i.archived && !i.fork);

  return {
    repos: items.map((item) => {
      const [owner, repo] = item.full_name.split("/");
      return {
        owner,
        repo,
        description: item.description,
        stars: item.stargazers_count ?? 0,
        language: item.language,
        topics: (item.topics ?? []).slice(0, 4),
      };
    }),
    more: (body.items ?? []).length === 12,
    problem: null,
    fix: null,
  };
}

export function starCount(stars: number): string {
  if (stars >= 1000) return `${Math.round(stars / 100) / 10}k`;
  return String(stars);
}
