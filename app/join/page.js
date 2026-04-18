'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

export default function JoinPage() {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    const canonical = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '');
    const origin =
      typeof window !== 'undefined' ? window.location.origin : '';
    const base = canonical || origin;
    if (base) setInviteUrl(`${base}/join`);
  }, []);

  const copyInvite = useCallback(async () => {
    const url = inviteUrl || (typeof window !== 'undefined' ? `${window.location.origin}/join` : '');
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [inviteUrl]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-lg px-6 py-14 space-y-10">
        <div className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400/90">ForgeFit · Patient</p>
          <h1 className="text-2xl font-semibold tracking-tight">You have been invited to your care portal</h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            After you create an account, you can open your schedule, follow the program your clinician assigns, log how
            you feel, message your team, and mark workouts complete (including syncing from Strava when connected). Use
            the same email your clinician has on file so sessions and programs line up with your account.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
          <p className="text-sm font-medium text-slate-200">Clinicians: share this link</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-emerald-200/90 break-all">
              {inviteUrl || '…loading link…'}
            </code>
            <button
              type="button"
              onClick={copyInvite}
              className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-800 shrink-0"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Set <code className="text-slate-400">NEXT_PUBLIC_APP_URL</code> in your deployment env to your public
            https://… origin so this link is shareable even while you browse the app on localhost. Patients should
            bookmark after signup.
          </p>
          <p className="text-xs text-amber-200/90 bg-amber-950/35 border border-amber-900/40 rounded-lg px-3 py-2 leading-relaxed">
            If someone on another phone sees &quot;cannot connect&quot; or the page never loads, they are almost
            certainly opening <strong>localhost</strong> (which means their own phone, not your computer). Use your
            real deployed URL, or on the same Wi‑Fi use your computer’s LAN IP and port (for example{' '}
            <code className="text-amber-100/90">http://192.168.1.10:3000/join</code>) with{' '}
            <code className="text-amber-100/90">npm run dev</code>, which listens on all interfaces.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/signup?redirect=/patient"
            className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-center font-semibold py-3 text-slate-950 transition-colors"
          >
            Create account
          </Link>
          <Link
            href="/login?redirect=/patient"
            className="flex-1 rounded-xl border border-slate-600 text-center font-semibold py-3 text-slate-100 hover:bg-slate-800/80 transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="text-center text-xs text-slate-500">
          <Link href="/" className="text-emerald-400/90 hover:underline">
            Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}
