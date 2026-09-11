import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Protege tudo, menos assets estáticos. Webhooks e cron são liberados
  // dentro do callback `authorized` (auth.config.ts).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
