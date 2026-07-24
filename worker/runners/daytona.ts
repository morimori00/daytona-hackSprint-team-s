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
/**
 * A walkthrough runs long: it demonstrates every behaviour the PR describes,
 * where a reproduction stops the moment it has its answer. Measured at ~20s for
 * a bug and several minutes for a preview, so they don't share a ceiling.
 */
function runTimeoutS(kind: RunnerContext['job']['kind']): number {
  const override = process.env.REPRO_TIMEOUT_MS;
  if (override) return Math.ceil(Number(override) / 1000);
  return kind === 'preview' ? 900 : 300;
}

const REPO_DIR = '/workspace/repo';
const OUT_DIR = '/workspace/out';
const APP_SESSION = 'target-app';

/**
 * How to stand a given repo up. `.reproducibility.yml` is the real answer (see
 * TODOS.md) -- this table is the same idea with the manifest kept on our side,
 * so a target repo needs nothing committed to it.
 *
 * `deps` symlinks the node_modules baked into the snapshot instead of running an
 * install, which is the difference between a run that starts in seconds and one
 * that spends minutes on `npm ci`. It is only correct while the lockfile in the
 * image matches the repo's.
 */
interface AppConfig {
  /** Directory inside the repo the app starts from. */
  dir: string;
  start: string;
  port: number;
  /**
   * The page the agent starts on, and the one the health check polls. Polling
   * the real entry point is what warms it: a dev server compiles per route, so
   * probing `/` would leave the first real navigation to pay that cost with the
   * recording already running.
   */
  health: string;
  /** Link the prebuilt node_modules in rather than installing. */
  deps?: boolean;
}

const APPS: Record<string, AppConfig> = {
  'morimori00/dashboard-mockup-for-daytona-hackathon': {
    dir: '.',
    // The binary from the linked node_modules, not npx: npx would go to the
    // network to resolve a package that is already sitting right there.
    start: './node_modules/.bin/next dev --port $PORT',
    port: 3000,
    // `/` only redirects here, and a redirect compiles the wrong route.
    health: '/dashboard/default',
    deps: true,
  },
};

const DEFAULT_APP: AppConfig = {
  dir: 'seed-app',
  start: 'node server.js',
  port: Number(process.env.SEED_APP_PORT ?? 3100),
  health: '/healthz',
};

function appConfig(job: RunnerContext['job']): AppConfig {
  return APPS[`${job.owner}/${job.repo}`] ?? DEFAULT_APP;
}

/**
 * Everything below is interpolated into shell commands, so anything that
 * reaches a command line gets checked first. `sha` and the repo coordinates
 * arrive from a GitHub webhook payload -- attacker-influencable on a public
 * repo -- and a backtick in a repo name would otherwise execute in the sandbox.
 */
const SHA = /^[0-9a-f]{7,40}$/;
const REPO_PART = /^[A-Za-z0-9._-]+$/;

function assertShellSafe(source: RunnerContext['source'], sha: string): void {
  if (!SHA.test(sha)) throw new Error(`refusing to check out a suspicious sha: ${sha}`);
  if (!REPO_PART.test(source.owner) || !REPO_PART.test(source.repo)) {
    throw new Error(`refusing to clone a suspicious repo: ${source.owner}/${source.repo}`);
  }
}

export async function runInDaytona(ctx: RunnerContext): Promise<RunOutcome> {
  if (!process.env.DAYTONA_API_KEY) {
    throw new Error('DAYTONA_API_KEY is not set (use RUNNER=local to run without a sandbox)');
  }
  assertShellSafe(ctx.source, ctx.sha);

  const cloneUrl =
    process.env.REPRO_REPO_URL ?? `https://github.com/${ctx.source.owner}/${ctx.source.repo}.git`;
  const app = appConfig(ctx.job);
  // The agent starts where the health check warmed, not at `/`.
  const baseUrl = `http://127.0.0.1:${app.port}${app.health === '/' ? '' : app.health}`;

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

    // 2. Reuse the node_modules from the image instead of installing: a local
    //    copy takes seconds where `npm ci` over the network takes minutes.
    //    Copied, not symlinked -- Turbopack resolves badly through a link that
    //    points outside the project root, and a link is what stopped the app
    //    from ever answering.
    const appDir = `${REPO_DIR}/${app.dir}`;
    if (app.deps) {
      // ~1GB of many small files: generous, this is disk-bound, not network.
      await run(sandbox, `cp -a /opt/app-deps/node_modules ${appDir}/node_modules`, 'copy deps', 300);
    }

    // 3. Start the app in a session so it keeps running after this call
    //    returns. A blocking executeCommand here never comes back and the run
    //    stalls until the timeout.
    await sandbox.process.createSession(APP_SESSION);
    const started = await sandbox.process.executeSessionCommand(APP_SESSION, {
      // `export`, not a `VAR=x cmd` prefix: the prefix form assigns after the
      // shell has already expanded $PORT in the same line, so the start command
      // would see an empty value.
      command: `cd ${appDir} && export PORT=${app.port} && ${app.start}`,
      runAsync: true,
    });

    // 4. Wait for it inside the sandbox rather than round-tripping a poll from
    //    here: 127.0.0.1 means the sandbox's loopback, not ours. Any HTTP answer
    //    counts -- a framework that 404s the probe path is still up, and a dev
    //    server compiles the first request, so this can sit for a while.
    const healthTimeout = app.deps ? 600 : HEALTH_TIMEOUT_S;
    const health = await sandbox.process.executeCommand(
      `for i in $(seq 1 ${healthTimeout * 2}); do ` +
        `node -e "fetch('${baseUrl}${app.health}').then(()=>process.exit(0)).catch(()=>process.exit(1))" ` +
        `&& exit 0; sleep 0.5; done; exit 1`,
      undefined,
      undefined,
      healthTimeout + 30,
    );
    if (health.exitCode !== 0) {
      await dumpAppLog(sandbox, started.cmdId);
      throw new Error(`The app didn't become healthy within ${healthTimeout}s`);
    }
    console.log('[daytona] target app is healthy');

    // 4. Hand the issue to the reproduction agent, which is already baked into
    //    the image at /opt/repro.
    await sandbox.fs.uploadFile(
      Buffer.from(
        JSON.stringify({
          mode: ctx.job.kind,
          issue_title: ctx.job.issueTitle,
          issue_body: ctx.job.issueBody,
          base_url: baseUrl,
          output_dir: OUT_DIR,
        }),
      ),
      '/workspace/job.json',
    );

    // A timeout here must not skip the download below. The recording is the
    // whole deliverable, and a run that went long is exactly when it matters --
    // the same reason the local runner sends SIGTERM rather than SIGKILL.
    let timedOut = false;
    try {
      const repro = await sandbox.process.executeCommand(
        'python /opt/repro/reproduce.py --config /workspace/job.json',
        '/workspace',
        undefined,
        runTimeoutS(ctx.job.kind),
      );
      console.log(repro.result.trimEnd());
      // Exit 1 means "ran, produced no verdict" -- result.json still carries the
      // reason, and that's what the comment should say. Only a missing
      // result.json is a real failure, handled below.
    } catch (err) {
      timedOut = true;
      console.error('[daytona] the run did not finish; salvaging what it wrote', err);
    }

    // 5. Pull the artifacts out BEFORE teardown.
    const result = await readResult(sandbox, timedOut);
    const video = await downloadVideo(sandbox, ctx.workDir, result.video);

    return {
      state: result.state,
      reproduced: result.reproduced ?? null,
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

interface SandboxResult {
  state: 'completed' | 'error';
  reproduced?: boolean | null;
  summary: string;
  steps?: string[];
  video?: string | null;
}

/**
 * reproduce.py writes result.json on its way out, so a run that finished has one
 * even when it failed. A killed run doesn't -- then we say so plainly rather
 * than inventing a verdict.
 */
async function readResult(sandbox: Sandbox, timedOut: boolean): Promise<SandboxResult> {
  try {
    return JSON.parse((await sandbox.fs.downloadFile(`${OUT_DIR}/result.json`)).toString());
  } catch {
    return {
      state: 'error',
      reproduced: null,
      summary: timedOut
        ? 'The run was still going when it hit the time limit, so there is no verdict — only the recording of how far it got.'
        : 'The run produced no result.',
      steps: [],
      video: null,
    };
  }
}

/**
 * Falls back to whatever mp4 is on disk: a run killed mid-flight never got to
 * name its video in result.json, but the recorder has been flushing all along.
 */
async function downloadVideo(
  sandbox: Sandbox,
  workDir: string,
  named: string | null | undefined,
): Promise<string | null> {
  let remote = named;
  if (!remote) {
    const found = await sandbox.process
      .executeCommand(`ls -1 ${OUT_DIR}/video/*.mp4 2>/dev/null | head -1`, '/workspace', undefined, 30)
      .catch(() => null);
    remote = found?.result.trim() || null;
  }
  if (!remote) return null;

  try {
    await mkdir(join(workDir, 'video'), { recursive: true });
    const local = join(workDir, 'video', 'run.mp4');
    await sandbox.fs.downloadFile(remote, local);
    return local;
  } catch (err) {
    console.error('[daytona] could not download the recording', err);
    return null;
  }
}

async function run(
  sandbox: Sandbox,
  command: string,
  label: string,
  timeoutS = 120,
): Promise<void> {
  const res = await sandbox.process.executeCommand(command, '/workspace', undefined, timeoutS);
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
