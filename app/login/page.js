"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const errParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(
    errParam === "auth" ? "Could not complete sign-in. Try again." : ""
  );

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace(redirect);
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">ForgeFit</h1>
          <p className="text-slate-400 text-sm">Sign in with your email and password</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 space-y-5 shadow-xl"
        >
          {message ? (
            <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg px-3 py-2">
              {message}
            </p>
          ) : null}

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
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/60"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold py-3 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-center text-sm text-slate-400">
            No account?{" "}
            <Link
              href={
                redirect && redirect.startsWith("/") && !redirect.startsWith("//")
                  ? `/signup?redirect=${encodeURIComponent(redirect)}`
                  : "/signup?redirect=%2Fpatient"
              }
              className="text-emerald-400 hover:text-emerald-300 font-medium"
            >
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
