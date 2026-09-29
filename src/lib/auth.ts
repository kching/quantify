import NextAuth from 'next-auth';
import type { DefaultSession } from 'next-auth';
import Google from 'next-auth/providers/google';
import { ensureUserProfile } from '@/core/db';

export function googleUserId(subject: string): string {
  return `google:${subject}`;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: 'jwt' },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== 'google' || !account.providerAccountId) return false;
      const name = typeof profile?.name === 'string' && profile.name.trim() ? profile.name : user.name ?? 'Quantify user';
      await ensureUserProfile({
        id: googleUserId(account.providerAccountId),
        name,
        email: user.email,
        image: user.image,
        googleSubject: account.providerAccountId,
      });
      return true;
    },
    jwt({ token, account }) {
      if (account?.provider === 'google' && account.providerAccountId) token.userId = googleUserId(account.providerAccountId);
      return token;
    },
    session({ session, token }) {
      if (session.user && typeof token.userId === 'string') session.user.id = token.userId;
      return session;
    },
  },
});

declare module 'next-auth' {
  interface Session { user: { id: string } & DefaultSession['user'] }
  interface JWT { userId?: string }
}
