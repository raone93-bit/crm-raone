import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="label mb-2 text-accent">CRM Raone</p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-medium">
            Entrar no CRM
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            Conversas reais de WhatsApp, Instagram e Messenger viram oportunidade
            comercial organizada.
          </p>
        </div>

        <div className="card p-6 shadow-sm">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-ink-soft">
          Acesso restrito. Fale com o administrador para receber suas credenciais.
        </p>
      </div>
    </main>
  );
}
