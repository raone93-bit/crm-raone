import type { NextAuthConfig } from "next-auth";

/**
 * Configuração compartilhada e segura para o Edge (middleware).
 * Não importa Prisma, bcrypt nem nada de runtime Node aqui.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [], // preenchido em auth.ts (runtime Node)
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      const isPublicApi =
        nextUrl.pathname.startsWith("/api/webhooks") ||
        nextUrl.pathname.startsWith("/api/cron") ||
        nextUrl.pathname.startsWith("/api/auth");

      if (isPublicApi) return true;
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.organizationId = user.organizationId;
        token.sellerId = user.sellerId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role;
        session.user.organizationId = token.organizationId;
        session.user.sellerId = token.sellerId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
