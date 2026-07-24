/**
 * In-flight job lock.
 *
 * `issues.labeled` fires again every time someone removes and re-adds the
 * label. Without this, two sandboxes race on the same issue and fight over one
 * comment. Process-local is enough: a single resident worker owns all jobs.
 */

const inFlight = new Map<string, number>();

/** Runs older than this are treated as dead so a crash can't wedge an issue. */
const STALE_MS = 15 * 60 * 1000;

function key(repo: string, issueNumber: number): string {
  return `${repo}#${issueNumber}`;
}

export function tryAcquire(repo: string, issueNumber: number, now = Date.now()): boolean {
  const k = key(repo, issueNumber);
  const startedAt = inFlight.get(k);
  if (startedAt !== undefined && now - startedAt < STALE_MS) return false;
  inFlight.set(k, now);
  return true;
}

export function release(repo: string, issueNumber: number): void {
  inFlight.delete(key(repo, issueNumber));
}

export function activeCount(): number {
  return inFlight.size;
}

/** Test seam. */
export function _reset(): void {
  inFlight.clear();
}
