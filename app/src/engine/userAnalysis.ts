import { GitHubClient } from '../lib/github';
export interface UserAnalysisResult {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  avatarUrl: string | null;
  htmlUrl: string;
  createdAt: string;
  followers: number;
  following: number;
  publicRepos: number;
  publicGists: number;
  topRepos: { name: string; stars: number; language: string | null; url: string; description: string | null }[];
  languages: { name: string; count: number }[];
}
interface UserData {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  company: string | null;
  avatar_url: string | null;
  html_url: string;
  created_at: string;
  followers: number;
  following: number;
  public_repos: number;
  public_gists: number;
}
interface RepoData {
  name: string;
  stargazers_count: number;
  language: string | null;
  html_url: string;
  description: string | null;
  fork: boolean;
}
export async function userAnalysis(
  gh: GitHubClient,
  username: string,
): Promise<UserAnalysisResult> {
  const [user, repos] = await Promise.all([
    gh.get<UserData>(`/users/${username}`),
    gh.getAll<RepoData>(`/users/${username}/repos`, { sort: 'updated' }, 3),
  ]);
  const topRepos = [...repos]
    .sort((a, b) => (b.stargazers_count ?? 0) - (a.stargazers_count ?? 0))
    .slice(0, 5)
    .map((r) => ({
      name: r.name,
      stars: r.stargazers_count ?? 0,
      language: r.language,
      url: r.html_url,
      description: r.description,
    }));
  const langCounts = new Map<string, number>();
  for (const r of repos) {
    if (!r.language) continue;
    langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1);
  }
  const languages = [...langCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  return {
    login: user.login,
    name: user.name,
    bio: user.bio,
    location: user.location,
    company: user.company,
    avatarUrl: user.avatar_url,
    htmlUrl: user.html_url,
    createdAt: user.created_at,
    followers: user.followers,
    following: user.following,
    publicRepos: user.public_repos,
    publicGists: user.public_gists,
    topRepos,
    languages,
  };
}