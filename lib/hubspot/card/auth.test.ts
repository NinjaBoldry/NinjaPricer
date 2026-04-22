import { describe, it, expect, beforeEach } from 'vitest';
import { verifyCardSecret } from './auth';

describe('verifyCardSecret', () => {
  beforeEach(() => {
    process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET = 'expected-secret';
  });

  it('true when X-Ninja-Card-Secret matches env', () => {
    const headers = new Headers({ 'x-ninja-card-secret': 'expected-secret' });
    expect(verifyCardSecret(headers)).toBe(true);
  });

  it('false when header missing', () => {
    expect(verifyCardSecret(new Headers())).toBe(false);
  });

  it('false when header does not match', () => {
    const headers = new Headers({ 'x-ninja-card-secret': 'wrong' });
    expect(verifyCardSecret(headers)).toBe(false);
  });

  it('false when env is unset', () => {
    delete process.env.HUBSPOT_APP_FUNCTION_SHARED_SECRET;
    const headers = new Headers({ 'x-ninja-card-secret': 'anything' });
    expect(verifyCardSecret(headers)).toBe(false);
  });
});
