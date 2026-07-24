/**
 * Daytona runner: executes the reproduction in a disposable sandbox.
 *
 * Same contract as the local runner. The sandbox is where untrusted repo code
 * runs (`npm ci` executes lifecycle scripts, `npm run dev` runs arbitrary
 * code), which is exactly why the GitHub token never comes in here -- artifacts
 * are pulled out and published from the control plane.
 *
 * Requires DAYTONA_API_KEY. Blocked on credentials at time of writing; the
 * shape below is what the local runner already proves out.
 */

import type { RunnerContext, RunOutcome } from '../job';

export async function runInDaytona(ctx: RunnerContext): Promise<RunOutcome> {
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error('DAYTONA_API_KEY is not set (use RUNNER=local to run without a sandbox)');
  }

  // Intended sequence, mirroring runners/local.ts:
  //
  //   1. create sandbox from the prebuilt snapshot
  //      (Debian + Python 3.11+ + pinned browser-use[video] + Chromium + Node)
  //   2. git clone the repo, then `git checkout ctx.sha` so the result names
  //      the exact commit tested -- an issue is not pinned to a commit
  //   3. start the app as an ASYNC session with its own pid, capture logs;
  //      a blocking call here never returns and the run stalls
  //   4. poll /healthz until ready (60s ceiling, backoff) or fail with a
  //      "couldn't run" verdict
  //   5. run sandbox/reproduce.py against http://127.0.0.1:PORT
  //   6. download result.json + the mp4 through the SDK BEFORE teardown
  //   7. always delete the sandbox in a finally -- a leaked sandbox burns quota
  //      mid-demo
  //
  // Left explicit rather than half-implemented: a stub that silently returned
  // a fake verdict would be worse than one that says it isn't wired yet.
  throw new Error(
    'The Daytona runner is not wired up yet. Set RUNNER=local to run the full pipeline locally.',
  );
}
