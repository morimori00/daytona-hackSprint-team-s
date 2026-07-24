/**
 * Run history.
 *
 * Append-only JSONL on disk. Not a database on purpose: the control plane is a
 * single resident process, the dashboard only ever reads the whole file, and a
 * run that fails to be recorded must never take the run itself down with it.
 *
 * Every row here is a run that actually happened. Nothing seeds fake rows --
 * a reproduction rate computed from invented data would be worse than an empty
 * dashboard.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type RunVerdict = 'reproduced' | 'not_reproduced' | 'preview' | 'failed';

export interface RunRecord {
  /** ISO 8601, when the run finished. */
  at: string;
  owner: string;
  repo: string;
  /** Issue or pull request number. */
  number: number;
  title: string;
  kind: 'bug' | 'preview';
  verdict: RunVerdict;
  summary: string;
  /** Short SHA under test. */
  commit: string;
  /** Seconds, wall clock. */
  seconds: number;
  stepCount: number;
  gifUrl?: string;
  commentUrl?: string;
}

const STORE = process.env.RUNS_FILE ?? join(process.cwd(), '.runs', 'runs.jsonl');

export async function recordRun(run: RunRecord): Promise<void> {
  await mkdir(dirname(STORE), { recursive: true });
  await appendFile(STORE, `${JSON.stringify(run)}\n`, 'utf8');
}

/** Newest first. A missing or half-written file yields what can be read. */
export async function listRuns(): Promise<RunRecord[]> {
  let raw: string;
  try {
    raw = await readFile(STORE, 'utf8');
  } catch {
    return [];
  }

  const runs: RunRecord[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      runs.push(JSON.parse(line));
    } catch {
      // A torn last line is expected while a run is being appended.
    }
  }
  return runs.sort((a, b) => b.at.localeCompare(a.at));
}

export interface RunStats {
  total: number;
  /** Runs that reached a verdict, i.e. the denominator of the rate. */
  judged: number;
  reproduced: number;
  notReproduced: number;
  previews: number;
  failed: number;
  /** Share of judged bug runs that reproduced, or null when none have. */
  reproductionRate: number | null;
  medianSeconds: number | null;
  repos: number;
}

export function summarise(runs: RunRecord[]): RunStats {
  const reproduced = runs.filter((r) => r.verdict === 'reproduced').length;
  const notReproduced = runs.filter((r) => r.verdict === 'not_reproduced').length;
  const judged = reproduced + notReproduced;

  // Failed runs are excluded: a run that couldn't start says nothing about
  // whether the bug was real, and folding it in would quietly depress the rate.
  const durations = runs
    .filter((r) => r.verdict !== 'failed')
    .map((r) => r.seconds)
    .sort((a, b) => a - b);

  return {
    total: runs.length,
    judged,
    reproduced,
    notReproduced,
    previews: runs.filter((r) => r.verdict === 'preview').length,
    failed: runs.filter((r) => r.verdict === 'failed').length,
    reproductionRate: judged ? reproduced / judged : null,
    medianSeconds: durations.length ? durations[Math.floor(durations.length / 2)] : null,
    repos: new Set(runs.map((r) => `${r.owner}/${r.repo}`)).size,
  };
}
