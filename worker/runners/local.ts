/**
 * Local runner: executes the reproduction on this machine.
 *
 * Same contract as the Daytona runner, so the pipeline can be exercised
 * end-to-end before any sandbox exists. Not a toy path -- this is what proves
 * the orchestration before we add remote execution.
 */

import { spawn } from 'node:child_process';
import { writeFile, readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { RunnerContext, RunOutcome } from '../job';

// cwd, not import.meta: this module is imported by job.ts, which Next.js bundles
// through webpack, where `import.meta.dir` is undefined and `import.meta.url`
// points into .next/. Both entry points -- the npm scripts and the dev server --
// run from the package root, so cwd is the repo root in each.
const REPO_ROOT = resolve(process.cwd());
const SEED_APP_PORT = Number(process.env.SEED_APP_PORT ?? 3100);
const HEALTH_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = Number(process.env.REPRO_TIMEOUT_MS ?? 300_000);

async function waitForHealth(url: string, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  let delay = 200;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 2000);
  }
  throw new Error(`The app didn't become healthy within ${Math.round(deadlineMs / 1000)}s`);
}

export async function runLocal(ctx: RunnerContext): Promise<RunOutcome> {
  const baseUrl = `http://127.0.0.1:${SEED_APP_PORT}`;

  // 1. Start the target app as a detached child we own, so we can always stop it.
  const app = spawn('node', ['server.js'], {
    cwd: join(REPO_ROOT, 'seed-app'),
    env: { ...process.env, PORT: String(SEED_APP_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', (d) => console.log(`[app] ${String(d).trim()}`));
  app.stderr.on('data', (d) => console.error(`[app] ${String(d).trim()}`));

  try {
    await waitForHealth(`${baseUrl}/healthz`, HEALTH_TIMEOUT_MS);
    console.log('[local] target app is healthy');

    // 2. Hand the issue to the reproduction agent.
    const configPath = join(ctx.workDir, 'job.json');
    await writeFile(
      configPath,
      JSON.stringify({
        mode: ctx.job.kind,
        issue_title: ctx.job.issueTitle,
        issue_body: ctx.job.issueBody,
        base_url: baseUrl,
        output_dir: ctx.workDir,
      }),
    );

    const python = process.env.REPRO_PYTHON ?? join(REPO_ROOT, 'sandbox/.venv/bin/python');
    await runReproduction(python, join(REPO_ROOT, 'sandbox/reproduce.py'), configPath);

    // 3. Read whatever the runner managed to produce.
    const result = JSON.parse(await readFile(join(ctx.workDir, 'result.json'), 'utf8'));
    return {
      state: result.state,
      reproduced: result.reproduced,
      summary: result.summary,
      steps: result.steps ?? [],
      video: result.video ?? (await findVideo(ctx.workDir)),
    };
  } finally {
    app.kill('SIGTERM');
  }
}

function runReproduction(python: string, script: string, configPath: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(python, [script, '--config', configPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.stdout.on('data', (d) => console.log(`[reproduce] ${String(d).trimEnd()}`));
    proc.stderr.on('data', (d) => console.error(`[reproduce] ${String(d).trimEnd()}`));

    // Terminate, don't SIGKILL: the recorder flushes the video on shutdown, and
    // a timed-out run is exactly when the recording matters most.
    const timer = setTimeout(() => proc.kill('SIGTERM'), RUN_TIMEOUT_MS);

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', () => {
      clearTimeout(timer);
      resolvePromise(); // result.json carries the verdict, including failures
    });
  });
}

async function findVideo(dir: string): Promise<string | null> {
  try {
    const videoDir = join(dir, 'video');
    const files = (await readdir(videoDir)).filter((f) => f.endsWith('.mp4'));
    return files.length ? join(videoDir, files[0]) : null;
  } catch {
    return null;
  }
}
