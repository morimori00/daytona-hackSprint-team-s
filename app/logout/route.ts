import { signOut } from '@workos-inc/authkit-nextjs';
import { redirect } from 'next/navigation';

import { isWorkOSConfigured } from '@/lib/auth';

export async function GET() {
  if (!isWorkOSConfigured()) redirect('/');
  await signOut({ returnTo: '/' });
}
