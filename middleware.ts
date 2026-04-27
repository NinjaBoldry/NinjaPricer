import NextAuth from 'next-auth';
import { authConfig } from './auth.config';
import { isAdminPath, userHasAdminRole } from '@/lib/auth/middleware-helpers';
import { NextResponse } from 'next/server';

export default NextAuth(authConfig).auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user ?? null;
  const isAuthed = !!req.auth;
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/mcp') ||
    pathname.startsWith('/api/quotes/') ||
    pathname.startsWith('/api/hubspot/webhooks/') ||
    // OAuth 2.1 endpoints — DCR (open registration), token exchange, and metadata
    // discovery must be reachable without an existing NextAuth session. The
    // /authorize endpoint enforces its own session check and bounces to sign-in.
    pathname.startsWith('/api/oauth/register') ||
    pathname.startsWith('/api/oauth/token') ||
    pathname.startsWith('/.well-known/') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  if (!isPublic && !isAuthed) {
    return NextResponse.redirect(new URL('/api/auth/signin', req.url));
  }

  if (isAdminPath(pathname) && !userHasAdminRole(user)) {
    return NextResponse.redirect(new URL(isAuthed ? '/scenarios' : '/api/auth/signin', req.url));
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
