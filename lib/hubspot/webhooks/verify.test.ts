import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { verifyHubSpotSignatureV3 } from './verify';

const SECRET = 'client-secret';

function sign(method: string, uri: string, body: string, timestamp: string): string {
  const raw = method + uri + body + timestamp;
  return createHmac('sha256', SECRET).update(raw).digest('base64');
}

describe('verifyHubSpotSignatureV3', () => {
  it('returns true for a valid signature within window', () => {
    const timestamp = String(Date.now());
    const body = '{"foo":"bar"}';
    const signature = sign('POST', 'https://example.com/hooks', body, timestamp);
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      }),
    ).toBe(true);
  });

  it('returns false when signature is tampered', () => {
    const timestamp = String(Date.now());
    const body = '{"foo":"bar"}';
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature: 'notavalidsignature',
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('returns false when timestamp is > 5 minutes old (replay)', () => {
    const timestamp = String(Date.now() - 6 * 60 * 1000);
    const body = '{}';
    const signature = sign('POST', 'https://example.com/hooks', body, timestamp);
    expect(
      verifyHubSpotSignatureV3({
        method: 'POST',
        url: 'https://example.com/hooks',
        rawBody: body,
        timestamp,
        signature,
        secret: SECRET,
      }),
    ).toBe(false);
  });
});
