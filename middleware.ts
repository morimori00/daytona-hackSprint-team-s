/**
 * Gates the dashboard behind WorkOS when it is configured, and gets out of the
 * way when it isn't.
 *
 * The webhook is excluded from the matcher rather than listed as a public path:
 * it authenticates itself with an HMAC over the raw body, and routing it
 * through an auth proxy risks a redirect where GitHub expects a fast 200.
 */

import { authkitMiddleware } from '@workos-inc/authkit-nextjs';
import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { isWorkOSConfigured } from '@/lib/auth';

const withAuthkit = authkitMiddleware({
  middlewareAuth: {
    enabled: true,
    unauthenticatedPaths: ['/', '/auth/setup', '/login', '/auth/callback'],
  },
});

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  if (!isWorkOSConfigured()) return NextResponse.next();
  return withAuthkit(request, event);
}

export const config = {
  // The trailing alternative excludes anything with a file extension. Without
  // it the landing page's own hero video redirects to a login, because /public
  // assets are requests like any other as far as the matcher is concerned.
  matcher: ['/((?!api/webhook|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
