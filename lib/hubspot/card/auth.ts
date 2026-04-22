import { timingSafeEqual } from 'node:crypto';

export function verifyCardSecret(headers: Headers): boolean {
  const expected = process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET;
  if (!expected) return false;

  const provided = headers.get('x-ninja-card-secret');
  if (!provided) return false;
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
