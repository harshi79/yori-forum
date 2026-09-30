"use client";
import { useActionState } from "react";
import { requestMagicLink } from "./actions";
export function LoginForm() {
  const [state, action, pending] = useActionState(requestMagicLink, {
    message: "",
  });
  return (
    <form action={action} className="mt-9 space-y-4">
      <label htmlFor="email" className="block text-sm font-medium">
        Email address
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        placeholder="you@example.com"
        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 outline-none focus:border-violet-400"
      />
      <button
        disabled={pending}
        className="w-full rounded-xl bg-violet-400 px-4 py-3 font-semibold text-[#151126] hover:bg-violet-300 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send magic link →"}
      </button>
      <p
        role="status"
        aria-live="polite"
        className="min-h-6 text-sm text-violet-300"
      >
        {state.message}
      </p>
    </form>
  );
}
