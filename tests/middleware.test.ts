import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isAdminPath, userHasAdminRole } from '../lib/auth/middleware-helpers';

describe('isAdminPath', () => {
  it('matches /admin and all sub-paths', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/products')).toBe(true);
    expect(isAdminPath('/admin/users')).toBe(true);
    expect(isAdminPath('/scenarios')).toBe(false);
  });
});

describe('userHasAdminRole', () => {
  it('returns true only for ADMIN role', () => {
    expect(userHasAdminRole({ role: 'ADMIN' })).toBe(true);
    expect(userHasAdminRole({ role: 'SALES' })).toBe(false);
    expect(userHasAdminRole(null)).toBe(false);
  });
});

// Verify the middleware source exempts the HubSpot webhook path
// so that unauthenticated-by-design endpoint never gets auth-redirected.
describe('middleware.ts — HubSpot public path exemptions', () => {
  const src = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');

  it('exempts /api/hubspot/webhooks/ from auth redirect', () => {
    expect(src).toContain("pathname.startsWith('/api/hubspot/webhooks/')");
  });

  it('keeps /api/quotes/ exempted (regression guard)', () => {
    expect(src).toContain("pathname.startsWith('/api/quotes/')");
  });

  it('keeps /api/mcp exempted (regression guard)', () => {
    expect(src).toContain("pathname.startsWith('/api/mcp')");
  });
});
