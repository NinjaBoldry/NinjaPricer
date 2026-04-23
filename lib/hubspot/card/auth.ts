import { timingSafeEqual } from 'node:crypto';

/**
 * Verify an incoming App Card request against the HubSpot private app access token.
 * HubSpot auto-injects the same token into App Functions as process.env.PRIVATE_APP_ACCESS_TOKEN,
 * so App Functions forward it as a bearer header and this function compares it timing-safely
 * against the pricer's HUBSPOT_ACCESS_TOKEN env var. No separate shared secret required.
 */
export function verifyCardAuth(headers: Headers): boolean {
  const expected = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!expected) return false;

  const authHeader = headers.get('authorization');
  if (!authHeader) return false;

  const match = /^Bearer (.+)$/i.exec(authHeader);
  if (!match || !match[1]) return false;

  const provided = match[1];
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
