"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { authenticate, type LoginState } from "./actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Entrando…" : "Entrar"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(authenticate, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="label">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          placeholder="voce@empresa.com"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="label">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="input"
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-iron/40 bg-iron/10 px-3 py-2 text-sm text-iron">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
