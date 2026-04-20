import type { NextAuthConfig } from 'next-auth';

// Edge-safe subset of the NextAuth config — no Prisma, no providers, no signIn callback.
// Full config (PrismaAdapter, providers, signIn domain check, jwt callback) lives in auth.ts
// and runs only in the Node.js runtime. Middleware imports this file; auth.ts spreads it.
//
// Role staleness tradeoff: role is written into the JWT at sign-in and cached until the token
// expires (default 30 days). If an admin changes another user's role, the change won't be
// reflected until that user signs out and back in. This is acceptable for an internal tool
// with infrequent role changes. If tighter enforcement is needed, reduce `session.maxAge`.
export const authConfig = {
  session: { strategy: 'jwt' as const },
  callbacks: {
    session({ session, token }) {
      if (session.user && token) {
        session.user.id = (token.id ?? token.sub) as string;
        session.user.role = token.role === 'ADMIN' ? 'ADMIN' : 'SALES';
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
