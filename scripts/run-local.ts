/**
 * Drive one reproduction end-to-end without GitHub or a webhook.
 *
 *   bun run scripts/run-local.ts --issue-file examples/issue.md
 *   bun run scripts/run-local.ts --issue-file examples/issue.md --runner daytona
 *
 * Runs the real agent against the real seed app and prints the comment that
 * would be posted. Use this to rehearse the demo before wiring the webhook.
 *
 * `--runner daytona` exercises the sandbox path instead, which needs a pushed
 * commit: the sandbox clones the repo, so it can only test what GitHub has.
 * Point it elsewhere with REPRO_REPO_URL.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runLocal } from '../worker/runners/local';
import { runInDaytona } from '../worker/runners/daytona';
import { renderComment } from '../worker/comment';
import { mp4ToGif } from '../worker/gif';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value && fallback === undefined) throw new Error(`missing --${name}`);
  return value ?? fallback!;
}

function git(...cmdArgs: string[]): string {
  return execFileSync('git', cmdArgs, { encoding: 'utf8' }).trim();
}

/** owner/repo of `origin`, so the sandbox clones the repo you're sitting in. */
function gitRepo(): [string, string] {
  const url = git('remote', 'get-url', 'origin');
  const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`can't read owner/repo from origin: ${url}`);
  return [m[1], m[2]];
}

const issuePath = arg('issue-file', 'examples/issue.md');
const runnerName = arg('runner', 'local');
if (runnerName !== 'local' && runnerName !== 'daytona') {
  throw new Error(`--runner must be "local" or "daytona", got "${runnerName}"`);
}
const raw = await readFile(issuePath, 'utf8');

// First markdown heading is the title, the rest is the body.
const lines = raw.split('\n');
const titleLine = lines.findIndex((l) => l.startsWith('# '));
const issueTitle = titleLine >= 0 ? lines[titleLine].replace(/^#\s*/, '') : 'Untitled issue';
const issueBody = lines.slice(titleLine + 1).join('\n').trim();

// The local runner serves the seed app straight off this checkout, so the
// commit is cosmetic. The sandbox clones, so there it has to be a real one.
const [owner, repo] =
  runnerName === 'daytona' ? gitRepo() : (['local', 'seed-app'] as const);
const sha = runnerName === 'daytona' ? arg('sha', git('rev-parse', 'HEAD')) : 'local00';

const workDir = await mkdtemp(join(tmpdir(), 'repro-local-'));
const started = Date.now();

console.log(`\n▸ issue:  ${issueTitle}`);
console.log(`▸ runner: ${runnerName}`);
console.log(`▸ target: ${owner}/${repo}@${sha.slice(0, 7)}`);
console.log(`▸ work:   ${workDir}\n`);

try {
  const runner = runnerName === 'daytona' ? runInDaytona : runLocal;
  const outcome = await runner({
    job: { owner, repo, issueNumber: 0, issueTitle, issueBody },
    workDir,
    sha,
  });

  let gifNote = '(no recording)';
  if (outcome.video) {
    const gifPath = join(workDir, 'run.gif');
    const { bytes, width, fps } = await mp4ToGif(outcome.video, gifPath);
    gifNote = `${gifPath} (${(bytes / 1024).toFixed(0)}KB, ${width}px, ${fps}fps)`;
  }

  const state =
    outcome.state === 'error' ? 'failed' : outcome.reproduced ? 'reproduced' : 'not_reproduced';

  const seconds = Math.round((Date.now() - started) / 1000);
  console.log('\n' + '─'.repeat(64));
  console.log(
    renderComment({
      state,
      summary: outcome.summary,
      steps: outcome.steps,
      gifUrl: outcome.video ? 'file://<recording>' : undefined,
      commit: sha.slice(0, 7),
      duration: `${seconds}s`,
      target: `${repo}@${sha.slice(0, 7)}`,
    }),
  );
  console.log('─'.repeat(64));
  console.log(`\n▸ recording: ${gifNote}\n`);
} finally {
  if (!process.env.KEEP_WORKDIR) await rm(workDir, { recursive: true, force: true });
}
