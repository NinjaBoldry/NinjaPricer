import { auth } from '@/auth';

export default auth((req) => {
  const isAuthed = !!req.auth;
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');
  if (!isPublic && !isAuthed) {
    const url = req.nextUrl.clone();
    url.pathname = '/api/auth/signin';
    return Response.redirect(url);
  }
  return undefined;
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
