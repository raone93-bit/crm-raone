"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export type LoginState = { error?: string };

export async function authenticate(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-mail ou senha incorretos." };
    }
    // Redirect de sucesso do Auth.js precisa propagar.
    throw error;
  }
}
