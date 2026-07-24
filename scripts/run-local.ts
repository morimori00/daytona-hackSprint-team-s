/**
 * Drive one reproduction end-to-end without GitHub or a webhook.
 *
 *   bun run scripts/run-local.ts --issue-file examples/issue.md
 *
 * Runs the real agent against the real seed app and prints the comment that
 * would be posted. Use this to rehearse the demo before wiring the webhook.
 */

import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runLocal } from '../worker/runners/local';
import { renderComment } from '../worker/comment';
import { mp4ToGif } from '../worker/gif';

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value && fallback === undefined) throw new Error(`missing --${name}`);
  return value ?? fallback!;
}

const issuePath = arg('issue-file', 'examples/issue.md');
const raw = await readFile(issuePath, 'utf8');

// First markdown heading is the title, the rest is the body.
const lines = raw.split('\n');
const titleLine = lines.findIndex((l) => l.startsWith('# '));
const issueTitle = titleLine >= 0 ? lines[titleLine].replace(/^#\s*/, '') : 'Untitled issue';
const issueBody = lines.slice(titleLine + 1).join('\n').trim();

const workDir = await mkdtemp(join(tmpdir(), 'repro-local-'));
const started = Date.now();

console.log(`\n▸ issue:  ${issueTitle}`);
console.log(`▸ work:   ${workDir}\n`);

try {
  const outcome = await runLocal({
    job: { owner: 'local', repo: 'seed-app', issueNumber: 0, issueTitle, issueBody },
    workDir,
    sha: 'local00',
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
      commit: 'local00',
      duration: `${seconds}s`,
      target: 'seed-app@local',
    }),
  );
  console.log('─'.repeat(64));
  console.log(`\n▸ recording: ${gifNote}\n`);
} finally {
  if (!process.env.KEEP_WORKDIR) await rm(workDir, { recursive: true, force: true });
}
