import { auth } from '@/auth';
import { isAdminPath, userHasAdminRole } from '@/lib/auth/middleware-helpers';
import { NextResponse } from 'next/server';

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const user = req.auth?.user ?? null;
  const isAuthed = !!req.auth;
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  if (!isPublic && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/auth/signin';
    return NextResponse.redirect(url);
  }

  if (isAdminPath(pathname) && !userHasAdminRole(user)) {
    const url = req.nextUrl.clone();
    url.pathname = isAuthed ? '/scenarios' : '/api/auth/signin';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
