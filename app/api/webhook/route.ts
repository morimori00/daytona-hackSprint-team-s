/**
 * GitHub webhook entry point.
 *
 * GitHub gives us ~10 seconds to respond, and a reproduction run takes minutes.
 * So this handler validates, hands the job to the resident worker, and returns
 * immediately. Note this only works because the app runs as a resident Node
 * process -- on serverless the function is frozen after the response and the
 * job would never finish.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifySignature } from '@/worker/signature';
import { tryAcquire } from '@/worker/dedup';
import { startJob } from '@/worker/job';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TRIGGER_LABEL = process.env.TRIGGER_LABEL ?? 'Reproducibility';

export async function POST(request: NextRequest) {
  // Raw body, not the parsed one -- the HMAC is over exact bytes.
  const raw = await request.text();

  if (!verifySignature(raw, request.headers.get('x-hub-signature-256'), process.env.GITHUB_WEBHOOK_SECRET ?? '')) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 403 });
  }

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (payload.action !== 'labeled' || payload.label?.name !== TRIGGER_LABEL) {
    return NextResponse.json({ ok: true, skipped: 'not the trigger label' });
  }

  // Labelling a PR arrives as `pull_request`, not `issues`, and carries no
  // `payload.issue` at all -- reading that field is why PRs used to 400 here.
  const pr = payload.pull_request;
  const target = pr ?? payload.issue;

  const repository = payload.repository;
  const issueNumber = target?.number;
  if (!repository?.full_name || typeof issueNumber !== 'number') {
    return NextResponse.json({ error: 'unexpected payload shape' }, { status: 400 });
  }

  // A PR from a deleted fork has head.repo === null and nothing to clone.
  if (pr && !pr.head?.repo?.full_name) {
    return NextResponse.json({ ok: true, skipped: 'pull request head is gone' });
  }

  if (!tryAcquire(repository.full_name, issueNumber)) {
    return NextResponse.json({ ok: true, skipped: 'already running for this issue' });
  }

  const [owner, repo] = repository.full_name.split('/');

  const [headOwner, headRepo] = (pr?.head?.repo?.full_name ?? '').split('/');

  // Deliberately not awaited: GitHub needs its 200 now.
  void startJob({
    owner,
    repo,
    issueNumber,
    issueTitle: target.title ?? '',
    issueBody: target.body ?? '',
    kind: pr ? 'preview' : 'bug',
    // The head, not the base: that's the commit the reviewer is looking at, and
    // on a fork it's the only repo that actually has it.
    head: pr ? { owner: headOwner, repo: headRepo, sha: pr.head.sha, ref: pr.head.ref } : undefined,
  }).catch((err) => console.error('[webhook] job failed to start', err));

  return NextResponse.json({
    ok: true,
    accepted: { [pr ? 'pull_request' : 'issue']: issueNumber },
  });
}
