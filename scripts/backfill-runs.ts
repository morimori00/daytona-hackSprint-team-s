/**
 * Rebuild run history from the comments the worker already posted.
 *
 *   bun run scripts/backfill-runs.ts owner/repo#1 owner/repo#2 ...
 *
 * The store only started existing after these runs, and the comments are the
 * record of what actually happened -- so history is recovered from them rather
 * than invented. Anything this can't parse is skipped and reported, never
 * guessed at.
 */

import { api } from '../worker/github';
import { recordRun, type RunVerdict } from '../worker/runs';

const VERDICTS: Array<[RegExp, RunVerdict]> = [
  [/^##\s*✅\s*Reproduced/m, 'reproduced'],
  [/^##\s*❌\s*Not reproduced/m, 'not_reproduced'],
  [/^##\s*🎬\s*Preview/m, 'preview'],
  [/^##\s*⚠️/m, 'failed'],
];

interface Comment {
  id: number;
  body: string;
  created_at: string;
  html_url: string;
}

function parseDuration(text: string): number {
  const m = text.match(/(?:(\d+)m)?(\d+)s/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 60 + Number(m[2]);
}

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('usage: bun run scripts/backfill-runs.ts owner/repo#number ...');
  process.exit(1);
}

let written = 0;
for (const target of targets) {
  const m = target.match(/^([^/]+)\/([^#]+)#(\d+)$/);
  if (!m) {
    console.error(`skipped ${target}: expected owner/repo#number`);
    continue;
  }
  const [, owner, repo, num] = m;
  const number = Number(num);

  const issue = await api<{ title: string; pull_request?: unknown }>(
    `/repos/${owner}/${repo}/issues/${number}`,
  );
  const comments = await api<Comment[]>(`/repos/${owner}/${repo}/issues/${number}/comments`);

  for (const comment of comments) {
    const hit = VERDICTS.find(([re]) => re.test(comment.body));
    if (!hit) continue; // a running placeholder, or somebody else's comment
    const verdict = hit[1];

    const summary =
      comment.body.match(/^\*\*(.+?)\*\*$/m)?.[1] ??
      comment.body.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ??
      '';
    const footer = comment.body.match(/`commit ([0-9a-f]+)(?: · ([^`·]+))?/);

    await recordRun({
      at: comment.created_at,
      owner,
      repo,
      number,
      title: issue.title,
      kind: issue.pull_request ? 'preview' : 'bug',
      verdict,
      summary,
      commit: footer?.[1] ?? '',
      seconds: parseDuration(footer?.[2] ?? ''),
      stepCount: Number(comment.body.match(/Steps (?:replayed|demonstrated) \((\d+)\)/)?.[1] ?? 0),
      gifUrl: comment.body.match(/!\[[^\]]*\]\((https:\/\/[^)]+)\)/)?.[1],
      commentUrl: comment.html_url,
    });
    written++;
    console.log(`${target} → ${verdict}`);
  }
}

console.log(`\nwrote ${written} run(s)`);
