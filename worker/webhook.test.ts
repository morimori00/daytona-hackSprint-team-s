import { expect, test, describe, beforeEach } from 'bun:test';
import { createHmac } from 'node:crypto';
import { verifySignature } from './signature';
import { tryAcquire, release, _reset } from './dedup';

const SECRET = 'test-secret';
const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

describe('verifySignature', () => {
  const body = JSON.stringify({ action: 'labeled' });

  test('accepts a correctly signed payload', () => {
    expect(verifySignature(body, sign(body), SECRET)).toBe(true);
  });

  test('rejects a payload signed with the wrong secret', () => {
    expect(verifySignature(body, sign(body, 'attacker'), SECRET)).toBe(false);
  });

  test('rejects a tampered body', () => {
    const sig = sign(body);
    expect(verifySignature(JSON.stringify({ action: 'opened' }), sig, SECRET)).toBe(false);
  });

  test('fails closed on a missing or malformed header', () => {
    expect(verifySignature(body, null, SECRET)).toBe(false);
    expect(verifySignature(body, 'sha1=deadbeef', SECRET)).toBe(false);
    expect(verifySignature(body, 'garbage', SECRET)).toBe(false);
  });

  test('fails closed when no secret is configured', () => {
    expect(verifySignature(body, sign(body), '')).toBe(false);
  });
});

describe('dedup', () => {
  beforeEach(_reset);

  test('second label event for the same issue is rejected', () => {
    expect(tryAcquire('o/r', 42)).toBe(true);
    expect(tryAcquire('o/r', 42)).toBe(false);
  });

  test('different issues run concurrently', () => {
    expect(tryAcquire('o/r', 1)).toBe(true);
    expect(tryAcquire('o/r', 2)).toBe(true);
  });

  test('releasing lets the issue run again', () => {
    tryAcquire('o/r', 7);
    release('o/r', 7);
    expect(tryAcquire('o/r', 7)).toBe(true);
  });

  test('a crashed run does not wedge the issue forever', () => {
    const t0 = 1_000_000;
    expect(tryAcquire('o/r', 9, t0)).toBe(true);
    expect(tryAcquire('o/r', 9, t0 + 60_000)).toBe(false);
    expect(tryAcquire('o/r', 9, t0 + 16 * 60_000)).toBe(true);
  });
});
