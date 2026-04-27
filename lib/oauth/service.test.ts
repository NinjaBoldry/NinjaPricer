import { describe, it, expect } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { verifyPkceS256 } from './service';

function s256Challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

describe('verifyPkceS256', () => {
  it('returns true when challenge matches verifier', () => {
    const verifier = randomBytes(32).toString('base64url');
    const challenge = s256Challenge(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it('returns false when challenge does not match', () => {
    const verifier = 'a'.repeat(48);
    const wrong = 'b'.repeat(43);
    expect(verifyPkceS256(verifier, wrong)).toBe(false);
  });

  it('uses constant-time comparison (length mismatch returns false)', () => {
    const verifier = 'verifier-string';
    const truncated = s256Challenge(verifier).slice(0, 10);
    expect(verifyPkceS256(verifier, truncated)).toBe(false);
  });
});
