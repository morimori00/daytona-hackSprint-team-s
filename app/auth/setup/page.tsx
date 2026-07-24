import Link from 'next/link';

import { WORKOS_ENV_VARS } from '@/lib/auth';

export const metadata = { title: 'Connect WorkOS — Preview Dog' };

export default function AuthSetupPage() {
  return (
    <main className="setup">
      <h1>Connect WorkOS</h1>
      <p>
        Preview Dog runs without an account. Add these four values to{' '}
        <code>.env.local</code> and the dashboard moves behind an AuthKit login.
      </p>

      <pre>
        {WORKOS_ENV_VARS.map((name) => `${name}=`).join('\n')}
      </pre>

      <ol>
        <li>
          Create an application in the WorkOS dashboard and copy its API key and client ID.
        </li>
        <li>
          Set <code>WORKOS_COOKIE_PASSWORD</code> to at least 32 random characters —{' '}
          <code>openssl rand -hex 32</code> is enough.
        </li>
        <li>
          Point <code>NEXT_PUBLIC_WORKOS_REDIRECT_URI</code> at <code>/auth/callback</code> on this
          host, and register that same URI in WorkOS as the redirect.
        </li>
        <li>Restart the dev server — the values are read at startup.</li>
      </ol>

      <p>
        <Link className="btn" href="/dashboard">
          Back to the dashboard
        </Link>
      </p>
    </main>
  );
}
