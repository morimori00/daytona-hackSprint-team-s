/**
 * Run history and the numbers that come out of it.
 *
 * Every row is a run that actually happened -- the store is written by the
 * worker, and nothing here invents data. An empty dashboard is the honest
 * answer before the first label is applied.
 */

import { withAuth } from '@workos-inc/authkit-nextjs';
import Link from 'next/link';

import { DashboardAssistant } from '@/components/DashboardAssistant';
import { isWorkOSConfigured } from '@/lib/auth';
import { listRuns, summarise, type RunRecord, type RunVerdict } from '@/worker/runs';

export const dynamic = 'force-dynamic';

const VERDICT_LABEL: Record<RunVerdict, string> = {
  reproduced: 'Reproduced',
  not_reproduced: 'Not reproduced',
  preview: 'Preview',
  failed: 'Failed',
};

function initials(first?: string | null, last?: string | null): string {
  const letters = [first, last].filter(Boolean).map((n) => n!.charAt(0).toUpperCase()).join('');
  return letters || 'PD';
}

function ago(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function duration(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`;
}

export default async function DashboardPage() {
  const configured = isWorkOSConfigured();
  const user = configured ? (await withAuth()).user : null;

  const runs = await listRuns();
  const stats = summarise(runs);

  return (
    <main className="shell">
      <div className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true">🐕</span>
          Preview Dog
        </div>
        {configured && user ? (
          <div className="who">
            <div className="avatar">{initials(user.firstName, user.lastName)}</div>
            <div>
              <div className="name">
                {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'Signed in'}
              </div>
              <div className="email">{user.email}</div>
            </div>
            <Link className="btn" href="/logout">
              Sign out
            </Link>
          </div>
        ) : (
          <Link className="btn primary" href="/login">
            Sign in
          </Link>
        )}
      </div>
      <p className="tagline">
        Label an issue or a pull request. A sandbox replays it and posts the recording.
      </p>

      {!configured && (
        <div className="notice">
          <span aria-hidden="true">🔓</span>
          <div>
            <strong>Signed out.</strong> WorkOS isn&apos;t configured, so the dashboard is open and
            no session is in effect. <Link href="/auth/setup">Connect WorkOS</Link> to put it behind
            a login.
          </div>
        </div>
      )}

      <section className="stats">
        <div className="stat">
          <div className="label">Runs</div>
          <div className="value">{stats.total}</div>
          <div className="sub">
            across {stats.repos} {stats.repos === 1 ? 'repository' : 'repositories'}
          </div>
        </div>
        <div className="stat">
          <div className="label">Reproduction rate</div>
          <div className="value">
            {stats.reproductionRate === null ? '—' : `${Math.round(stats.reproductionRate * 100)}%`}
          </div>
          <div className="sub">
            {stats.reproduced} of {stats.judged} reported bugs reproduced
          </div>
        </div>
        <div className="stat">
          <div className="label">Previews</div>
          <div className="value">{stats.previews}</div>
          <div className="sub">pull request walkthroughs</div>
        </div>
        <div className="stat">
          <div className="label">Median run</div>
          <div className="value">{stats.medianSeconds === null ? '—' : duration(stats.medianSeconds)}</div>
          <div className="sub">label to posted comment</div>
        </div>
      </section>

      <section className="panel">
        <h2>Recent runs</h2>
        {runs.length === 0 ? (
          <div className="empty">
            No runs yet. Add the <code>Reproducibility</code> label to an issue or a pull request and
            the first one lands here.
          </div>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Target</th>
                  <th>Verdict</th>
                  <th>What happened</th>
                  <th>Commit</th>
                  <th>Took</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run: RunRecord, i: number) => (
                  <tr key={`${run.at}-${i}`}>
                    <td>
                      <div className="target">
                        <a href={run.commentUrl} target="_blank" rel="noreferrer">
                          {run.kind === 'preview' ? 'PR' : 'Issue'} #{run.number}
                        </a>
                      </div>
                      <div className="repo">{run.repo}</div>
                    </td>
                    <td>
                      <span className={`badge ${run.verdict}`}>{VERDICT_LABEL[run.verdict]}</span>
                    </td>
                    <td className="summary">
                      {run.summary}
                      {run.gifUrl && (
                        <>
                          {' '}
                          <a href={run.gifUrl} target="_blank" rel="noreferrer">
                            recording
                          </a>
                        </>
                      )}
                    </td>
                    <td className="mono">{run.commit}</td>
                    <td className="mono">{duration(run.seconds)}</td>
                    <td className="mono">{ago(run.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DashboardAssistant runs={runs} stats={stats} />
    </main>
  );
}
