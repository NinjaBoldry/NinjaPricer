import { describe, it, expect } from 'vitest';
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
