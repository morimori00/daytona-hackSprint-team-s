/**
 * Daytona runner: executes the reproduction in a disposable sandbox.
 *
 * Same contract as the local runner. The sandbox is where untrusted repo code
 * runs (`npm ci` executes lifecycle scripts, `npm run dev` runs arbitrary
 * code), which is exactly why the GitHub token never comes in here -- artifacts
 * are pulled out and published from the control plane.
 *
 * Requires DAYTONA_API_KEY and the `repro-sandbox` snapshot
 * (`sandbox/create_snapshot.py`), which already carries Chromium, Node and a
 * pinned browser-use[video]. Nothing is installed at run time.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { Daytona, type Sandbox } from '@daytonaio/sdk';

import type { RunnerContext, RunOutcome } from '../job';

const SNAPSHOT = process.env.DAYTONA_SNAPSHOT ?? 'repro-sandbox';
const SEED_APP_PORT = Number(process.env.SEED_APP_PORT ?? 3100);
const HEALTH_TIMEOUT_S = 60;
const RUN_TIMEOUT_S = Math.ceil(Number(process.env.REPRO_TIMEOUT_MS ?? 300_000) / 1000);

const REPO_DIR = '/workspace/repo';
const OUT_DIR = '/workspace/out';
const APP_SESSION = 'target-app';

/**
 * Everything below is interpolated into shell commands, so anything that
 * reaches a command line gets checked first. `sha` and the repo coordinates
 * arrive from a GitHub webhook payload -- attacker-influencable on a public
 * repo -- and a backtick in a repo name would otherwise execute in the sandbox.
 */
const SHA = /^[0-9a-f]{7,40}$/;
const REPO_PART = /^[A-Za-z0-9._-]+$/;

function assertShellSafe(job: RunnerContext['job'], sha: string): void {
  if (!SHA.test(sha)) throw new Error(`refusing to check out a suspicious sha: ${sha}`);
  if (!REPO_PART.test(job.owner) || !REPO_PART.test(job.repo)) {
    throw new Error(`refusing to clone a suspicious repo: ${job.owner}/${job.repo}`);
  }
}

export async function runInDaytona(ctx: RunnerContext): Promise<RunOutcome> {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error('DAYTONA_API_KEY is not set (use RUNNER=local to run without a sandbox)');
  }
  assertShellSafe(ctx.job, ctx.sha);

  const cloneUrl =
    process.env.REPRO_REPO_URL ?? `https://github.com/${ctx.job.owner}/${ctx.job.repo}.git`;
  const baseUrl = `http://127.0.0.1:${SEED_APP_PORT}`;

  const daytona = new Daytona();

  // The LLM key has to be in here -- the agent runs in the sandbox. The GitHub
  // token does not, and must not: repo code runs alongside it.
  const llmEnv: Record<string, string> = {};
  for (const key of [
    'FIREWORKS_API_KEY',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'REPRO_MODEL',
    'REPRO_MAX_TOKENS',
    'REPRO_FPS',
    'REPRO_USE_VISION',
    'REPRO_USE_JUDGE',
  ]) {
    if (process.env[key]) llmEnv[key] = process.env[key]!;
  }
  // BROWSER_PATH is deliberately NOT forwarded: the image sets it to
  // /usr/bin/chromium, and this machine's value would point at a macOS binary.

  console.log(`[daytona] creating sandbox from snapshot ${SNAPSHOT}`);
  const sandbox = await daytona.create({
    snapshot: SNAPSHOT,
    envVars: llmEnv,
    labels: { app: 'reproducibility', issue: String(ctx.job.issueNumber) },
    // A run is minutes; anything still alive well past that is a leak, and a
    // leaked sandbox burns quota mid-demo. This is the backstop for the
    // `finally` below failing to land.
    autoStopInterval: 15,
    autoDeleteInterval: 0,
  });
  console.log(`[daytona] sandbox ${sandbox.id}`);

  try {
    // 1. Clone, then pin to the exact commit under test. An issue isn't tied to
    //    a commit, so the verdict has to name the one it actually saw.
    await run(sandbox, `git clone --quiet ${cloneUrl} ${REPO_DIR}`, 'clone');
    await run(sandbox, `git -C ${REPO_DIR} checkout --quiet --detach ${ctx.sha}`, 'checkout');

    // 2. Start the app in a session so it keeps running after this call
    //    returns. A blocking executeCommand here never comes back and the run
    //    stalls until the timeout.
    await sandbox.process.createSession(APP_SESSION);
    const app = await sandbox.process.executeSessionCommand(APP_SESSION, {
      command: `cd ${REPO_DIR}/seed-app && PORT=${SEED_APP_PORT} node server.js`,
      runAsync: true,
    });

    // 3. Wait for it inside the sandbox rather than round-tripping a poll from
    //    here: 127.0.0.1 means the sandbox's loopback, not ours.
    const health = await sandbox.process.executeCommand(
      `for i in $(seq 1 ${HEALTH_TIMEOUT_S * 2}); do ` +
        `node -e "fetch('${baseUrl}/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" ` +
        `&& exit 0; sleep 0.5; done; exit 1`,
      undefined,
      undefined,
      HEALTH_TIMEOUT_S + 15,
    );
    if (health.exitCode !== 0) {
      await dumpAppLog(sandbox, app.cmdId);
      throw new Error(`The app didn't become healthy within ${HEALTH_TIMEOUT_S}s`);
    }
    console.log('[daytona] target app is healthy');

    // 4. Hand the issue to the reproduction agent, which is already baked into
    //    the image at /opt/repro.
    await sandbox.fs.uploadFile(
      Buffer.from(
        JSON.stringify({
          issue_title: ctx.job.issueTitle,
          issue_body: ctx.job.issueBody,
          base_url: baseUrl,
          output_dir: OUT_DIR,
        }),
      ),
      '/workspace/job.json',
    );

    const repro = await sandbox.process.executeCommand(
      'python /opt/repro/reproduce.py --config /workspace/job.json',
      '/workspace',
      undefined,
      RUN_TIMEOUT_S,
    );
    console.log(repro.result.trimEnd());
    // Exit 1 means "ran, produced no verdict" -- result.json still carries the
    // reason, and that's what the comment should say. Only a missing
    // result.json is a real failure, handled below.

    // 5. Pull the artifacts out BEFORE teardown.
    const result = JSON.parse((await sandbox.fs.downloadFile(`${OUT_DIR}/result.json`)).toString());

    let video: string | null = null;
    if (result.video) {
      try {
        await mkdir(join(ctx.workDir, 'video'), { recursive: true });
        video = join(ctx.workDir, 'video', 'run.mp4');
        await sandbox.fs.downloadFile(result.video, video);
      } catch (err) {
        console.error('[daytona] could not download the recording', err);
        video = null;
      }
    }

    return {
      state: result.state,
      reproduced: result.reproduced,
      summary: result.summary,
      steps: result.steps ?? [],
      video,
    };
  } finally {
    // Always, even on a thrown error: a sandbox that outlives its run is quota
    // we don't get back.
    await sandbox.delete().catch((err) => console.error('[daytona] teardown failed', err));
  }
}

async function run(sandbox: Sandbox, command: string, label: string): Promise<void> {
  const res = await sandbox.process.executeCommand(command, '/workspace', undefined, 120);
  if (res.exitCode !== 0) {
    throw new Error(`${label} failed (exit ${res.exitCode}): ${res.result.trim()}`);
  }
}

/** The app's own output is the only thing that explains a failed health check. */
async function dumpAppLog(sandbox: Sandbox, cmdId: string | undefined): Promise<void> {
  if (!cmdId) return;
  try {
    const logs = await sandbox.process.getSessionCommandLogs(APP_SESSION, cmdId);
    const text = (logs.output ?? `${logs.stdout ?? ''}${logs.stderr ?? ''}`).trim();
    if (text) console.error(`[app] ${text}`);
  } catch {
    // The log is a diagnostic; failing to read it must not mask the real error.
  }
}
