import { describe, it, expect, beforeEach } from 'vitest';
import { verifyCardAuth } from './auth';

describe('verifyCardAuth', () => {
  beforeEach(() => {
    process.env.HUBSPOT_ACCESS_TOKEN = 'test-token';
  });

  it('true when Authorization Bearer matches env', () => {
    const headers = new Headers({ authorization: 'Bearer test-token' });
    expect(verifyCardAuth(headers)).toBe(true);
  });

  it('false when Authorization header missing', () => {
    expect(verifyCardAuth(new Headers())).toBe(false);
  });

  it('false when token does not match', () => {
    const headers = new Headers({ authorization: 'Bearer wrong-token' });
    expect(verifyCardAuth(headers)).toBe(false);
  });

  it('false when env var is unset', () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    const headers = new Headers({ authorization: 'Bearer test-token' });
    expect(verifyCardAuth(headers)).toBe(false);
  });

  it('false when non-bearer scheme (e.g. Basic) is used', () => {
    const headers = new Headers({ authorization: 'Basic dXNlcjpwYXNz' });
    expect(verifyCardAuth(headers)).toBe(false);
  });
});
