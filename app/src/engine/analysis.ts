/**
 * Depo genel analizi.
 * Kaynak: exc_analyzer/commands/analysis.py + graphql_client.py
 *
 * CLI gibi GraphQL kullanıyor: depo özeti, diller ve commit geçmişi tek turda
 * geliyor. Aynı veriyi REST ile toplamak üç ayrı istek demek olurdu.
 */
import { GitHubClient } from '../lib/github';

export interface AnalysisResult {
  owner: string;
  repo: string;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;
  license: string | null;
  openIssues: number;
  totalPullRequests: number;
  languages: { name: string; percent: number }[];
  commitsAnalyzed: number;
  topCommitters: { name: string; count: number }[];
  totalContributors: number;
  topContributors: { login: string; contributions: number }[];
}

const REPO_QUERY = `
  query RepoAnalysis($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      description
      createdAt
      updatedAt
      stargazerCount
      forkCount
      defaultBranchRef { name }
      licenseInfo { name }
      issues(states: OPEN) { totalCount }
      pullRequests { totalCount }
      languages(first: 20) {
        edges { size node { name } }
      }
    }
  }
`;

const COMMITS_QUERY = `
  query CommitHistory($owner: String!, $name: String!, $ref: String!, $first: Int!) {
    repository(owner: $owner, name: $name) {
      ref(qualifiedName: $ref) {
        target {
          ... on Commit {
            history(first: $first) {
              edges {
                node {
                  oid
                  message
                  committedDate
                  author { name user { login } }
                }
              }
            }
          }
        }
      }
    }
  }
`;

interface RepoQueryData {
  repository: {
    description: string | null;
    createdAt: string;
    updatedAt: string;
    stargazerCount: number;
    forkCount: number;
    defaultBranchRef: { name: string } | null;
    licenseInfo: { name: string } | null;
    issues: { totalCount: number };
    pullRequests: { totalCount: number };
    languages: { edges: { size: number; node: { name: string } }[] };
  } | null;
}

interface CommitsQueryData {
  repository: {
    ref: {
      target: {
        history: {
          edges: {
            node: {
              oid: string;
              message: string;
              committedDate: string;
              author: { name: string | null; user: { login: string } | null } | null;
            };
          }[];
        };
      } | null;
    } | null;
  } | null;
}

const ANONYMOUS = 'anonim';

export async function analysis(
  gh: GitHubClient,
  owner: string,
  repo: string,
): Promise<AnalysisResult> {
  const { repository } = await gh.graphql<RepoQueryData>(REPO_QUERY, { owner, name: repo });
  if (!repository) throw new Error(`${owner}/${repo} bulunamadı.`);

  const defaultBranch = repository.defaultBranchRef?.name ?? 'main';

  const totalBytes = repository.languages.edges.reduce((sum, e) => sum + e.size, 0);
  const languages = repository.languages.edges
    .map((e) => ({
      name: e.node.name,
      percent: totalBytes > 0 ? (e.size / totalBytes) * 100 : 0,
    }))
    .sort((a, b) => b.percent - a.percent);

  const commitsData = await gh.graphql<CommitsQueryData>(COMMITS_QUERY, {
    owner,
    name: repo,
    ref: defaultBranch,
    first: 100,
  });

  const edges = commitsData.repository?.ref?.target?.history.edges ?? [];
  const committerCounts = new Map<string, number>();
  for (const { node } of edges) {
    const name = node.author?.user?.login ?? node.author?.name ?? ANONYMOUS;
    committerCounts.set(name, (committerCounts.get(name) ?? 0) + 1);
  }
  const topCommitters = [...committerCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Katkida bulunanlar GraphQL'de yok, REST'ten geliyor.
  const contributors = await gh.getAll<{ login: string; contributions: number }>(
    `/repos/${owner}/${repo}/contributors`,
    undefined,
    2,
  );
  const topContributors = [...contributors]
    .sort((a, b) => (b.contributions ?? 0) - (a.contributions ?? 0))
    .slice(0, 5)
    .map((c) => ({ login: c.login ?? ANONYMOUS, contributions: c.contributions ?? 0 }));

  return {
    owner,
    repo,
    description: repository.description,
    createdAt: repository.createdAt,
    updatedAt: repository.updatedAt,
    stars: repository.stargazerCount,
    forks: repository.forkCount,
    defaultBranch,
    license: repository.licenseInfo?.name ?? null,
    openIssues: repository.issues.totalCount,
    totalPullRequests: repository.pullRequests.totalCount,
    languages,
    commitsAnalyzed: edges.length,
    topCommitters,
    totalContributors: contributors.length,
    topContributors,
  };
}
