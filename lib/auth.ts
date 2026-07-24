/**
 * WorkOS is optional. Without credentials the dashboard still renders, so the
 * product can be shown without an account -- the same shape the hackathon
 * template uses. What it must never do is pretend someone is signed in.
 */

const REQUIRED = [
  'WORKOS_API_KEY',
  'WORKOS_CLIENT_ID',
  'WORKOS_COOKIE_PASSWORD',
  'NEXT_PUBLIC_WORKOS_REDIRECT_URI',
] as const;

export function isWorkOSConfigured(): boolean {
  return REQUIRED.every((name) => {
    const value = process.env[name];
    // Placeholders copied out of .env.example are not configuration.
    return Boolean(value && !value.includes('your_') && !value.includes('replace_'));
  });
}

export const WORKOS_ENV_VARS = REQUIRED;
