import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const authConfigSrc = readFileSync(join(process.cwd(), 'auth.config.ts'), 'utf-8');
const middlewareSrc = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');

describe('auth.config.ts — no Prisma imports (edge-compatible)', () => {
  it('does not import @prisma/client', () => {
    expect(authConfigSrc).not.toContain('@prisma/client');
  });

  it('does not import @auth/prisma-adapter', () => {
    expect(authConfigSrc).not.toContain('prisma-adapter');
  });

  it('does not import the Prisma DB client singleton', () => {
    expect(authConfigSrc).not.toMatch(/@\/lib\/db\/client|lib\/db\/client/);
  });
});

describe('middleware.ts — no Prisma in import chain', () => {
  it('imports from auth.config (not from @/auth which has Prisma)', () => {
    expect(middlewareSrc).toContain('auth.config');
    expect(middlewareSrc).not.toMatch(/from ['"]@\/auth['"]/);
  });

  it('does not import @prisma/client directly', () => {
    expect(middlewareSrc).not.toContain('@prisma/client');
  });

  it('does not import the Prisma DB client singleton directly', () => {
    expect(middlewareSrc).not.toMatch(/@\/lib\/db\/client|lib\/db\/client/);
  });
});

describe('authConfig.callbacks.session — reads role from JWT token, not DB', () => {
  it('populates session.user.role from token.role (JWT claim, not DB lookup)', async () => {
    const { authConfig } = await import('../auth.config');
    const sessionCb = authConfig.callbacks?.session as Function;
    const result = await sessionCb({
      session: { user: { email: 'a@b.com' }, expires: '2099-01-01' },
      token: { role: 'ADMIN', id: 'u-1', sub: 'u-1' },
    });
    expect(result.user.role).toBe('ADMIN');
    expect(result.user.id).toBe('u-1');
  });

  it('defaults to SALES when token has no role', async () => {
    const { authConfig } = await import('../auth.config');
    const sessionCb = authConfig.callbacks?.session as Function;
    const result = await sessionCb({
      session: { user: { email: 'a@b.com' }, expires: '2099-01-01' },
      token: { sub: 'u-2' },
    });
    expect(result.user.role).toBe('SALES');
  });
});

describe('admin guard behavior (preserved after refactor)', () => {
  it('isAdminPath detects /admin routes', async () => {
    const { isAdminPath } = await import('../lib/auth/middleware-helpers');
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/users')).toBe(true);
    expect(isAdminPath('/scenarios')).toBe(false);
    expect(isAdminPath('/')).toBe(false);
  });

  it('userHasAdminRole: true only for ADMIN, not SALES, not null', async () => {
    const { userHasAdminRole } = await import('../lib/auth/middleware-helpers');
    expect(userHasAdminRole({ role: 'ADMIN' })).toBe(true);
    expect(userHasAdminRole({ role: 'SALES' })).toBe(false);
    expect(userHasAdminRole(null)).toBe(false);
    expect(userHasAdminRole(undefined)).toBe(false);
  });
});
