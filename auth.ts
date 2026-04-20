import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db/client';
import { authConfig } from './auth.config';

const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN ?? '';
const isDev = process.env.NODE_ENV === 'development';

const devCredentialsProvider = Credentials({
  id: 'dev-credentials',
  name: 'Dev Login',
  credentials: { email: { label: 'Email', type: 'email' } },
  async authorize({ email }) {
    if (!isDev || !email) return null;
    const existing = await prisma.user.findUnique({ where: { email: email as string } });
    if (existing)
      return { id: existing.id, email: existing.email, name: existing.name, role: existing.role };
    const created = await prisma.user.create({
      data: { email: email as string, name: email as string, role: 'ADMIN' },
    });
    return { id: created.id, email: created.email, name: created.name, role: created.role };
  },
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    MicrosoftEntraID({
      clientId: process.env.MICROSOFT_ENTRA_CLIENT_ID!,
      clientSecret: process.env.MICROSOFT_ENTRA_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.MICROSOFT_ENTRA_TENANT_ID}/v2.0`,
      // Entra returns tenant-verified emails, so it's safe to link an Entra account
      // to an existing User row matched by email. This is what lets admin-invited
      // users (created by email before their first sign-in) log in and have the
      // OAuth account linked to their pre-provisioned User + role.
      allowDangerousEmailAccountLinking: true,
    }),
    ...(isDev ? [devCredentialsProvider] : []),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      const email = user.email ?? '';
      if (allowedDomain && !email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`)) {
        return false;
      }
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? 'SALES';
        token.id = user.id;
      }
      return token;
    },
  },
});
