/**
 * GitHub webhook signature verification.
 *
 * Without this, anyone who learns the ngrok URL can make us burn Daytona
 * sandboxes and LLM tokens on demand. Fail closed on every branch.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;

  const a = Buffer.from(signatureHeader, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // timingSafeEqual throws on length mismatch, so guard first.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
