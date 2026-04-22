import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_AGE_MS = 5 * 60 * 1000;

export interface VerifyInput {
  method: string;
  url: string;
  rawBody: string;
  timestamp: string;
  signature: string;
  secret: string;
}

export function verifyHubSpotSignatureV3(input: VerifyInput): boolean {
  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Date.now() - ts) > MAX_AGE_MS) return false;

  const raw = input.method + input.url + input.rawBody + input.timestamp;
  const expected = createHmac('sha256', input.secret).update(raw).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, 'base64');
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}
