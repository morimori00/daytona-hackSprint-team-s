/**
 * GitHub side-effects: publishing the recording and writing the comment.
 *
 * Two deliberate choices:
 *
 * 1. Artifacts go to a branch via the Contents API rather than git plumbing.
 *    No clone, no working tree, no push races between concurrent runs.
 * 2. The artifact branch must be PUBLIC. Verified against the live API: GitHub
 *    embeds raw.githubusercontent.com directly (no camo proxy for its own
 *    domain) and tags it `data-animated-image`, so the GIF animates -- but the
 *    fetch is anonymous. On a private repo the image 404s for every reader.
 */

import { readFile } from 'node:fs/promises';

const API = 'https://api.github.com';

export interface RepoRef {
  owner: string;
  repo: string;
}

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new Error('GITHUB_TOKEN is not set');
  return t;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? 'GET'} ${path} -> ${res.status}: ${await res.text()}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** Create the artifacts branch off the default branch if it isn't there yet. */
async function ensureBranch({ owner, repo }: RepoRef, branch: string): Promise<void> {
  try {
    await api(`/repos/${owner}/${repo}/git/ref/heads/${branch}`);
    return; // already exists
  } catch {
    // fall through and create it
  }
  const repoInfo = await api<{ default_branch: string }>(`/repos/${owner}/${repo}`);
  const base = await api<{ object: { sha: string } }>(
    `/repos/${owner}/${repo}/git/ref/heads/${repoInfo.default_branch}`,
  );
  await api(`/repos/${owner}/${repo}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: base.object.sha }),
  });
}

/**
 * Upload a local file to `branch` and return the raw URL that renders in a
 * comment. Uploading happens here in the control plane, never from inside the
 * sandbox -- the sandbox runs untrusted repo code and must never hold the token.
 */
export async function publishArtifact(
  ref: RepoRef,
  localPath: string,
  destPath: string,
  branch = 'reproducibility-artifacts',
): Promise<string> {
  await ensureBranch(ref, branch);
  const content = (await readFile(localPath)).toString('base64');

  // If a run re-uses a path we need the blob sha to overwrite it.
  let sha: string | undefined;
  try {
    const existing = await api<{ sha: string }>(
      `/repos/${ref.owner}/${ref.repo}/contents/${destPath}?ref=${branch}`,
    );
    sha = existing.sha;
  } catch {
    // new file
  }

  const result = await api<{ content: { download_url: string } }>(
    `/repos/${ref.owner}/${ref.repo}/contents/${destPath}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        message: `chore(reproducibility): add ${destPath}`,
        content,
        branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
  return result.content.download_url;
}

export async function createComment(
  { owner, repo }: RepoRef,
  issueNumber: number,
  body: string,
): Promise<number> {
  const res = await api<{ id: number }>(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
  return res.id;
}

/** Post-then-edit: one comment id for the whole run, so no notification spam. */
export async function updateComment(
  { owner, repo }: RepoRef,
  commentId: number,
  body: string,
): Promise<void> {
  await api(`/repos/${owner}/${repo}/issues/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

export async function getIssue(
  { owner, repo }: RepoRef,
  issueNumber: number,
): Promise<{ title: string; body: string | null }> {
  return api(`/repos/${owner}/${repo}/issues/${issueNumber}`);
}

/** The exact commit under test -- an issue is not pinned to one. */
export async function headSha({ owner, repo }: RepoRef, branch?: string): Promise<string> {
  const target = branch ?? (await api<{ default_branch: string }>(`/repos/${owner}/${repo}`)).default_branch;
  const ref = await api<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${target}`);
  return ref.object.sha;
}
