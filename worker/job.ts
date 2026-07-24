/**
 * Job orchestrator: label event in, reproduction comment out.
 *
 *   post "🔄 Reproducing…"  ->  run the reproduction  ->  publish the GIF
 *   ->  edit that same comment into the verdict  ->  always tear down
 *
 * The runner is pluggable. `local` executes on this machine, which lets the
 * whole pipeline be exercised without a Daytona key; `daytona` runs it in a
 * disposable sandbox. Everything else is identical, so what we demo is what we
 * built.
 */

import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { renderComment } from './comment';
import { mp4ToGif } from './gif';
import { createComment, updateComment, publishArtifact, headSha } from './github';
import { release } from './dedup';
import { recordRun } from './runs';
import { runLocal } from './runners/local';
import { runInDaytona } from './runners/daytona';

export interface Job {
  owner: string;
  repo: string;
  /** PR numbers and issue numbers share one sequence, so this works for both. */
  issueNumber: number;
  issueTitle: string;
  issueBody: string;
  /**
   * `bug` replays an issue's steps and reaches a verdict. `preview` walks
   * through what a pull request adds and only shows it -- there is no claim to
   * be right or wrong about.
   */
  kind: 'bug' | 'preview';
  /**
   * Where the code under test lives. Present for pull requests, whose head may
   * be a fork -- the base repo doesn't contain that commit, so cloning it would
   * fail at checkout.
   */
  head?: { owner: string; repo: string; sha: string; ref: string };
}

/** What every runner must return, however it executed. */
export interface RunOutcome {
  state: 'completed' | 'error';
  reproduced: boolean | null;
  summary: string;
  steps: string[];
  /** Local path to the recording, if one survived. */
  video: string | null;
}

export interface RunnerContext {
  job: Job;
  workDir: string;
  /** Commit actually under test. */
  sha: string;
  /** Repo to clone. Differs from the job's repo when a PR comes from a fork. */
  source: { owner: string; repo: string };
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m${String(s).padStart(2, '0')}s` : `${s}s`;
}

export async function startJob(job: Job): Promise<void> {
  const ref = { owner: job.owner, repo: job.repo };
  const started = Date.now();
  const workDir = await mkdtemp(join(tmpdir(), 'repro-'));
  let commentId: number | undefined;

  try {
    // A pull request pins its own commit; an issue doesn't, so it gets whatever
    // the default branch is right now.
    const sha = job.head?.sha ?? (await headSha(ref));
    const short = sha.slice(0, 7);
    const source = job.head ? { owner: job.head.owner, repo: job.head.repo } : ref;

    // Land a comment immediately so nobody stares at silence, then edit this
    // same one -- one comment id per run means no notification spam.
    commentId = await createComment(
      ref,
      job.issueNumber,
      renderComment({ state: job.kind === 'preview' ? 'previewing' : 'running', commit: short }),
    );

    const runner = process.env.RUNNER === 'daytona' ? runInDaytona : runLocal;
    const outcome = await runner({ job, workDir, sha, source });

    let gifUrl: string | undefined;
    if (outcome.video) {
      try {
        const gifPath = join(workDir, 'run.gif');
        const { bytes } = await mp4ToGif(outcome.video, gifPath);
        console.log(`[job] gif ${(bytes / 1024).toFixed(0)}KB`);
        // Published from here, never from inside the sandbox: the sandbox runs
        // untrusted repo code and must never see the GitHub token.
        gifUrl = await publishArtifact(
          ref,
          gifPath,
          `runs/${job.issueNumber}/${short}-${started}.gif`,
        );
      } catch (err) {
        console.error('[job] could not publish recording', err);
      }
    }

    const state =
      outcome.state === 'error'
        ? 'failed'
        : job.kind === 'preview'
          ? 'preview'
          : outcome.reproduced
            ? 'reproduced'
            : 'not_reproduced';

    await updateComment(
      ref,
      commentId,
      renderComment({
        state,
        summary: outcome.summary,
        steps: outcome.steps,
        gifUrl,
        commit: short,
        duration: formatDuration(Date.now() - started),
        // The branch is what a reviewer recognises on a PR; the commit is
        // already in the footer next to it.
        target: `${job.repo}@${job.head?.ref ?? sha.slice(0, 7)}`,
      }),
    );

    // History is a side effect of the run, never a precondition for it: a
    // dashboard that can't be written must not cost anyone their result.
    await recordRun({
      at: new Date().toISOString(),
      owner: job.owner,
      repo: job.repo,
      number: job.issueNumber,
      title: job.issueTitle,
      kind: job.kind,
      verdict: state,
      summary: outcome.summary,
      commit: short,
      seconds: Math.round((Date.now() - started) / 1000),
      stepCount: outcome.steps.length,
      gifUrl,
      commentUrl: `https://github.com/${job.owner}/${job.repo}/issues/${job.issueNumber}#issuecomment-${commentId}`,
    }).catch((err) => console.error('[job] could not record the run', err));
  } catch (err) {
    console.error('[job] failed', err);
    // A failure the user never sees is worse than the failure itself.
    if (commentId !== undefined) {
      await updateComment(
        { owner: job.owner, repo: job.repo },
        commentId,
        renderComment({
          state: 'failed',
          summary: err instanceof Error ? err.message : 'The reproduction run failed.',
          duration: formatDuration(Date.now() - started),
        }),
      ).catch(() => {});
    }
  } finally {
    release(`${job.owner}/${job.repo}`, job.issueNumber);
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
