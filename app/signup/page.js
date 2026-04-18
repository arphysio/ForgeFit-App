"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/patient";

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    if (password.length < 6) {
      setMessage("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const meta = {};
    if (displayName.trim()) meta.full_name = displayName.trim();

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: origin ? `${origin}/auth/callback` : undefined,
        ...(Object.keys(meta).length ? { data: meta } : {}),
      },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    if (data?.session) {
      const next =
        redirect && redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/patient";
      router.replace(next);
      router.refresh();
      return;
    }
    setMessage(
      "Check your email to confirm your account, then sign in. If confirmation is disabled in your project, you can go to Sign in now."
    );
  }

  const loginHref =
    redirect && redirect.startsWith("/") && !redirect.startsWith("//")
      ? `/login?redirect=${encodeURIComponent(redirect)}`
      : "/login?redirect=%2Fpatient";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Create account</h1>
          <p className="text-slate-400 text-sm">
            ForgeFit uses your email as your sign-in ID (Supabase Auth). After signup you will land in your care hub.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 space-y-5 shadow-xl"
        >
          {message ? (
            <p
              className={`text-sm rounded-lg px-3 py-2 border ${
                message.includes("Check your email")
                  ? "text-amber-200 bg-amber-950/40 border-amber-900/50"
                  : "text-rose-400 bg-rose-950/40 border-rose-900/50"
              }`}
            >
              {message}
            </p>
          ) : null}

          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-slate-300 mb-1.5">
              Display name <span className="text-slate-500 font-normal">(optional)</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              type="text"
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              placeholder="How you want your clinician to see you"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-1.5">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-slate-300 mb-1.5">
              Confirm password
            </label>
            <input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold py-3 transition-colors"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>

          <p className="text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link href={loginHref} className="text-emerald-400 hover:text-emerald-300 font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}
