"use client";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const { error } = await createSupabaseBrowserClient().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setMessage(
        error
          ? "Could not send a link. Please try again."
          : "Check your inbox for a sign-in link.",
      );
    } catch {
      setMessage("Sign-in is not available right now. Please try again later.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form onSubmit={submit} className="mt-9 space-y-4">
      <label htmlFor="email" className="block text-sm font-medium">
        Email address
      </label>
      <input
        id="email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
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
        {message}
      </p>
    </form>
  );
}
