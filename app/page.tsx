/**
 * Landing page. Public: the middleware lists `/` as unauthenticated, so this is
 * what someone sees before signing in, and every call to action lands on
 * /login -> WorkOS -> /auth/callback -> /dashboard.
 *
 * The demo is an mp4 rather than the source GIF: the recording was 18MB as a
 * GIF and 432KB as h264, and a hero nobody waits for is not a hero. It is
 * muted/looping/playsinline so it behaves like one everywhere.
 *
 * The two comment cards are real output, copied from runs on public
 * repositories, not mockups written to look good.
 */

import Link from 'next/link';

const STEPS = [
  {
    n: '01',
    title: 'Connect your GitHub repo',
    body: 'Install Preview Dog and point it at a repository. One webhook, no CI config, no changes to your codebase.',
  },
  {
    n: '02',
    title: 'Create an issue or a PR',
    body: 'Work the way you already do. When you want proof, add the Reproducibility label to the thread.',
  },
  {
    n: '03',
    title: 'Preview lands in the thread',
    body: 'A sandbox boots your app, a browser agent follows the description, and the recording is posted back with what actually happened.',
  },
];

const PIPELINE = [
  'Label detected',
  'Webhook verified',
  'Sandbox created',
  'Exact commit cloned',
  'App booted',
  'Browser agent records',
  'Comment updated',
];

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    unit: 'forever',
    line: 'For open source and side projects.',
    features: [
      '1 repository',
      '30 runs per month',
      'Issue verdicts and PR previews',
      'Recordings kept for 30 days',
      'Community support',
    ],
    cta: 'Start free',
  },
  {
    name: 'Team',
    price: '$99',
    unit: 'per month',
    line: 'For teams who triage bugs every day.',
    features: [
      'Unlimited repositories',
      '1,000 runs per month',
      'Run history and reproduction rates',
      'Dashboard assistant',
      'Private repositories',
      'Priority support',
    ],
    cta: 'Start free trial',
    featured: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    unit: '',
    line: 'For organisations with identity and residency requirements.',
    features: [
      'Everything in Team',
      'SSO via SAML and OIDC',
      'SCIM provisioning and audit logs',
      'Self-hosted sandbox runners',
      'Custom retention and data residency',
      'SLA and a named contact',
    ],
    cta: 'Talk to us',
  },
];

export default function LandingPage() {
  return (
    <>
      <header className="lp-bar">
        <div className="lp-bar-inner">
          <div className="brand">
            <span className="mark" aria-hidden="true">🐕</span>
            Preview Dog
          </div>
          <nav className="lp-nav">
            <a href="#how">How it works</a>
            <a href="#proof">Why trust it</a>
            <a href="#pricing">Pricing</a>
            <Link className="btn primary" href="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-inner">
            <p className="lp-eyebrow">Reproducibility is all you need</p>
            <h1>
              Label an issue or pull request.
              <br />
              Get a video back proving what actually happens.
            </h1>
            <p className="lp-lede">
              Preview Dog boots your repository in a disposable sandbox, drives a real browser
              through what the report describes, and posts the recording to the same thread — before
              anyone spends an hour trying to see it for themselves.
            </p>
            <div className="lp-cta">
              <Link className="btn primary lg" href="/login">
                Start free
              </Link>
              <a
                className="btn ghost lg"
                href="https://github.com/morimori00/daytona-hackSprint-team-s/issues/1"
                target="_blank"
                rel="noreferrer"
              >
                See a real run →
              </a>
            </div>
          </div>

          <div className="lp-inner">
            <figure className="lp-demo">
              <video
                src="/demo.mp4"
                poster="/demo-poster.jpg"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                aria-label="Preview Dog posting a recording to a GitHub thread"
              />
              <figcaption>An actual run, posted to a public GitHub issue.</figcaption>
            </figure>
          </div>
        </section>

        <section className="lp-steps-wrap" id="how">
          <div className="lp-inner">
            <ol className="lp-steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="lp-step-num">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-inner lp-section">
          <h2 className="lp-h2">The problem</h2>
          <div className="lp-two">
            <div>
              <h3>Bugs nobody can see</h3>
              <p>
                Support and QA file bugs engineers cannot reproduce. A step is missing, an
                environment detail is wrong, a precondition is unstated. The first hour of a fix
                goes to trying to <em>see</em> the bug at all.
              </p>
            </div>
            <div>
              <h3>Pull requests nobody can check</h3>
              <p>
                The same gap runs the other way. A pull request says it adds a feature, and the
                reviewer still has to check out the branch, install it, boot the app, and click
                around before they can believe it.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-inner lp-section">
          <h2 className="lp-h2">What comes back</h2>
          <div className="lp-two">
            <article className="lp-card">
              <div className="lp-card-head">On an issue, it reaches a verdict</div>
              <div className="lp-comment">
                <div className="lp-verdict ok">✅ Reproduced</div>
                <p className="lp-strong">
                  After clicking Delete on “Walk the dog,” “Buy milk” disappeared instead.
                </p>
                <div className="lp-film">▶ recording</div>
                <code>commit 8f26e8b · 27s</code>
              </div>
              <p className="lp-note">
                When the reported behaviour cannot be observed, it returns <b>Not reproduced</b>.
              </p>
            </article>

            <article className="lp-card">
              <div className="lp-card-head">On a pull request, it demonstrates the change</div>
              <div className="lp-comment">
                <div className="lp-verdict prev">🎬 Preview</div>
                <p className="lp-strong">
                  Clicking any of the three dashboard KPI cards opens a detail modal showing
                  month-over-month movement against previous values, plus a monthly target with
                  progress percentage.
                </p>
                <div className="lp-film">▶ 19-step walkthrough</div>
                <code>commit 6010941 · 19 steps</code>
              </div>
              <p className="lp-note">
                A preview has no ✅/❌ on purpose. The agent&apos;s output schema has no{' '}
                <code>reproduced</code> field at all — giving it one would invite it to grade a
                change it was only asked to demonstrate.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-inner lp-section">
          <h2 className="lp-h2">Under the hood</h2>
          <ol className="lp-pipeline">
            {PIPELINE.map((step, i) => (
              <li key={step}>
                <span className="lp-step-n">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="lp-note wide">
            One progress comment is posted immediately and edited in place for the rest of the run,
            so a run produces one notification rather than four. The sandbox is always destroyed
            afterwards, and your GitHub token never enters it — untrusted repository code runs
            inside the sandbox, the token stays in the control plane.
          </p>
        </section>

        <section className="lp-inner lp-section" id="proof">
          <h2 className="lp-h2">Why you can trust the verdict</h2>
          <div className="lp-three">
            <article className="lp-proof">
              <h3>It works beyond a demo app</h3>
              <p>
                Proven on two unrelated repositories: a deliberately buggy toy task list, and a
                Next.js 16 CRM dashboard with 98 dependencies. Its dependencies are baked into the
                sandbox image, so a run starts in seconds instead of spending minutes installing.
              </p>
            </article>
            <article className="lp-proof">
              <h3>It says so when the bug isn&apos;t there</h3>
              <p>
                A control issue describes a bug that does not exist. Preview Dog must return{' '}
                <b>Not reproduced</b>. If it ever agrees with that report, the agent is echoing the
                issue text instead of reading the page — and no verdict from it can be trusted.
              </p>
            </article>
            <article className="lp-proof">
              <h3>It found a bug nobody asked it to test</h3>
              <p>
                Previewing a PR that added a filter box, the agent filtered to one task, clicked
                Delete, cleared the filter, and found a <em>different</em> task gone. It was told to
                demonstrate, not test. Because it may only report what it actually observed, the
                walkthrough became evidence of a real bug.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-pricing-wrap" id="pricing">
          <div className="lp-inner">
            <h2 className="lp-h2 center">Pricing</h2>
            <p className="lp-pricing-lede">
              Every plan includes issue verdicts, PR previews and the recordings. Runs are the only
              thing that meters.
            </p>
            <div className="lp-plans">
              {PLANS.map((plan) => (
                <article key={plan.name} className={`lp-plan${plan.featured ? ' featured' : ''}`}>
                  {plan.featured && <div className="lp-plan-flag">Most popular</div>}
                  <h3>{plan.name}</h3>
                  <div className="lp-price">
                    {plan.price}
                    {plan.unit && <span> {plan.unit}</span>}
                  </div>
                  <p className="lp-plan-line">{plan.line}</p>
                  <ul>
                    {plan.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  <Link className={`btn ${plan.featured ? 'primary' : ''} full`} href="/login">
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-inner lp-section">
          <h2 className="lp-h2">Built on</h2>
          <div className="lp-two">
            <article className="lp-card pad">
              <h3>Daytona — one isolated environment per run</h3>
              <p>
                Every issue and pull request is reproduced in its own sandbox. The prebuilt snapshot
                carries Chromium, Node.js 20 and the agent runtime, and boots in <b>0.7 seconds</b>.
              </p>
            </article>
            <article className="lp-card pad">
              <h3>Fireworks AI — fast serverless reasoning</h3>
              <p>
                The browser agent runs GLM-5.2 on Fireworks Serverless Inference. Fast inference is
                what keeps a multi-step walkthrough moving; a typical capture lands in about three
                minutes.
              </p>
            </article>
            <article className="lp-card pad">
              <h3>WorkOS — enterprise-ready authentication</h3>
              <p>
                The dashboard sits behind WorkOS AuthKit, giving a path from day-one login to
                enterprise identity — SSO, SAML, OIDC — so a team can see run history and
                reproduction rates across its repositories.
              </p>
            </article>
            <article className="lp-card pad">
              <h3>CopilotKit — a repository-aware assistant</h3>
              <p>
                Ask the dashboard what reproduced lately, which runs failed and what keeps
                recurring. It answers from your run history only, and says so when the history
                doesn&apos;t have the answer.
              </p>
            </article>
          </div>
        </section>

        <section className="lp-final">
          <div className="lp-inner">
            <h2>Stop reproducing bugs by hand.</h2>
            <p>Connect a repository and label your first issue in under five minutes.</p>
            <Link className="btn primary lg" href="/login">
              Start free
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-inner">Preview Dog · reproducibility is all you need</div>
      </footer>
    </>
  );
}
