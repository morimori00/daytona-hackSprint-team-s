import { getSignInUrl } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

import { isWorkOSConfigured } from '@/lib/auth';

export async function GET() {
  // Sending someone to WorkOS with no client id gives them an opaque error;
  // the setup page tells them exactly what is missing.
  if (!isWorkOSConfigured()) redirect('/auth/setup');

  redirect(await getSignInUrl({ returnTo: '/dashboard' }));
}
