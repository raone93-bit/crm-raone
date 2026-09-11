/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "bcryptjs", "@anthropic-ai/sdk", "pdf-lib"],
  images: { remotePatterns: [] },

  // Fase 0/1: o build não é bloqueado por lint nem por erros de tipo, porque o
  // ambiente local ainda não roda `tsc`. Rode `npm run typecheck` e `npm run lint`
  // ao instalar o Node e remova estes dois blocos assim que estiverem limpos.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
