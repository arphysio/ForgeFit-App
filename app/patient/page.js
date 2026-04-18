'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PatientMonthCalendar from '@/components/PatientMonthCalendar';
import { createClient } from '@/lib/supabase/browser';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function startOfWeek(d) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeek(start) {
  const e = new Date(start);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

function verdictStyles(verdict) {
  const v = String(verdict || 'moderate');
  if (v === 'rest_day') {
    return 'border-rose-800/80 bg-rose-950/25';
  }
  if (v === 'unload') {
    return 'border-amber-800/70 bg-amber-950/20';
  }
  if (v === 'full_go') {
    return 'border-emerald-800/60 bg-emerald-950/20';
  }
  return 'border-slate-800 bg-slate-900/40';
}

function TrainingGuidanceCard({ pack }) {
  const g = pack.guidance;
  if (!g) return null;
  const train =
    g.trainToday === true
      ? 'Train today: yes'
      : g.trainToday === false
        ? 'Train today: no'
        : 'Train today: use judgment';
  const adj =
    g.loadAdjustmentPct != null
      ? ` · Load vs baseline week: about ${Math.round(g.loadAdjustmentPct)}%`
      : '';
  const bullets = Array.isArray(g.bullets) ? g.bullets : [];
  return (
    <div className={`rounded-xl border px-4 py-3 space-y-2 ${verdictStyles(g.verdict)}`}>
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-slate-100">Training day guidance</h2>
        <span className="text-[11px] text-slate-500">{g.referenceDate}</span>
      </div>
      <p className="text-[11px] text-slate-400">
        {train}
        {adj}
      </p>
      <p className="text-sm text-slate-200 leading-snug">{g.headline}</p>
      {g.suggestedVolumeNote ? (
        <p className="text-xs text-slate-400 leading-relaxed">{g.suggestedVolumeNote}</p>
      ) : null}
      {bullets.length ? (
        <ul className="text-xs text-slate-300 space-y-1.5 list-disc pl-4 leading-relaxed">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      ) : null}
      {pack.recoveryQueryError ? (
        <p className="text-[11px] text-rose-400/90">Recovery data: {pack.recoveryQueryError}</p>
      ) : (
        <p className="text-[11px] text-slate-600">Recovery days in window: {pack.recoveryRowCount ?? 0}</p>
      )}
      {g.disclaimer ? <p className="text-[10px] text-slate-600 leading-relaxed pt-1">{g.disclaimer}</p> : null}
    </div>
  );
}

function ProgramPreview({ program }) {
  if (!program || typeof program !== 'object') {
    return (
      <div id="program" className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-semibold text-slate-200">Assigned program</h2>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          No program file is on your account yet. Your clinician publishes this from the ForgeFit portal after you sign
          up with the same email they have on file.
        </p>
      </div>
    );
  }
  const phases = Array.isArray(program.phases) ? program.phases : [];
  const name = typeof program.name === 'string' ? program.name : 'Your program';
  return (
    <div id="program" className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">Assigned program</h2>
        <p className="text-base font-medium text-slate-100 mt-1">{name}</p>
        {program.patient ? (
          <p className="text-xs text-slate-500 mt-0.5">{String(program.patient)}</p>
        ) : null}
      </div>
      {phases.length === 0 ? (
        <p className="text-sm text-slate-500">Your clinician has not added phase details yet.</p>
      ) : (
        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {phases.map((ph, i) => {
            const ex = Array.isArray(ph.exercises) ? ph.exercises : [];
            return (
              <div key={i} className="rounded-lg border border-slate-800/80 bg-slate-950/50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                  {ph.label || `Phase ${i + 1}`}
                </div>
                {ph.title ? <div className="text-sm font-medium text-slate-200 mt-1">{ph.title}</div> : null}
                {ph.subtitle ? <div className="text-xs text-slate-500 mt-0.5">{ph.subtitle}</div> : null}
                {ex.length ? (
                  <ul className="mt-2 space-y-2">
                    {ex.map((e, j) => (
                      <li key={j} className="text-sm text-slate-300 border-l-2 border-emerald-600/50 pl-2">
                        <span className="font-medium text-slate-100">{e.name || 'Exercise'}</span>
                        {e.desc || e.description ? (
                          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{e.desc || e.description}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-500 mt-2">No exercises listed for this phase.</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function PatientHubPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);
  const [program, setProgram] = useState(null);
  const [programUpdated, setProgramUpdated] = useState(null);
  const [logs, setLogs] = useState([]);
  const [vas, setVas] = useState('0');
  const [rpe, setRpe] = useState('');
  const [sessionType, setSessionType] = useState('run');
  const [notes, setNotes] = useState('');
  const [logSaving, setLogSaving] = useState(false);
  const [patientUserId, setPatientUserId] = useState('');
  const [trainingGuidance, setTrainingGuidance] = useState(null);
  const [trainingGuidanceErr, setTrainingGuidanceErr] = useState('');

  const month = useMemo(() => monthKeyFromDate(new Date()), []);

  const weekStats = useMemo(() => {
    const start = startOfWeek(new Date());
    const end = endOfWeek(start);
    let planned = 0;
    let completed = 0;
    for (const ev of events) {
      if (!ev.date) continue;
      const t = new Date(`${ev.date}T12:00:00`);
      if (t < start || t > end) continue;
      if (ev.status === 'completed') completed += 1;
      else planned += 1;
    }
    return { planned, completed, start, end };
  }, [events]);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return events
      .filter((e) => e.date >= today && e.status !== 'completed' && e.status !== 'cancelled')
      .sort((a, b) => (a.date + (a.timeHm || '')).localeCompare(b.date + (b.timeHm || '')))
      .slice(0, 5);
  }, [events]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [calRes, progRes, logRes, tgRes] = await Promise.all([
        fetch(`/api/calendar/me?month=${encodeURIComponent(month)}`, { credentials: 'include' }),
        fetch('/api/me/patient-program', { credentials: 'include' }),
        fetch('/api/me/patient-pain-log?limit=12', { credentials: 'include' }),
        fetch('/api/me/training-guidance?weeks=8', { credentials: 'include' }),
      ]);

      const calRaw = await calRes.text();
      let calJ = null;
      try {
        calJ = calRaw ? JSON.parse(calRaw) : null;
      } catch {
        calJ = null;
      }
      if (!calRes.ok) {
        throw new Error(calJ?.error || calRaw || 'Could not load schedule.');
      }
      setEvents(Array.isArray(calJ?.events) ? calJ.events : []);

      const progRaw = await progRes.text();
      let progJ = null;
      try {
        progJ = progRaw ? JSON.parse(progRaw) : null;
      } catch {
        progJ = null;
      }
      if (!progRes.ok) {
        throw new Error(progJ?.error || progRaw || 'Could not load program.');
      }
      const rawProg = progJ?.program ?? null;
      const isEmptyObj =
        rawProg &&
        typeof rawProg === 'object' &&
        !Array.isArray(rawProg) &&
        Object.keys(rawProg).length === 0;
      setProgram(isEmptyObj ? null : rawProg);
      setProgramUpdated(isEmptyObj ? null : progJ?.updatedAt ?? null);

      const logRaw = await logRes.text();
      let logJ = null;
      try {
        logJ = logRaw ? JSON.parse(logRaw) : null;
      } catch {
        logJ = null;
      }
      if (logRes.ok && Array.isArray(logJ?.logs)) setLogs(logJ.logs);
      else setLogs([]);

      const tgRaw = await tgRes.text();
      let tgJ = null;
      try {
        tgJ = tgRaw ? JSON.parse(tgRaw) : null;
      } catch {
        tgJ = null;
      }
      if (tgRes.ok && tgJ) {
        setTrainingGuidance(tgJ);
        setTrainingGuidanceErr('');
      } else {
        setTrainingGuidance(null);
        setTrainingGuidanceErr(tgJ?.error || tgRaw?.slice(0, 160) || 'Training guidance unavailable.');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong.');
      setEvents([]);
      setTrainingGuidance(null);
      setTrainingGuidanceErr('');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();
      if (!cancelled && user?.id) setPatientUserId(user.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitCheckIn(e) {
    e.preventDefault();
    setLogSaving(true);
    setError('');
    try {
      const vasN = parseInt(vas, 10);
      if (!Number.isInteger(vasN) || vasN < 0 || vasN > 10) {
        throw new Error('Pain score (VAS) must be 0–10.');
      }
      const body = { vas: vasN, sessionType, notes };
      if (rpe.trim()) {
        const r = parseInt(rpe, 10);
        if (!Number.isInteger(r) || r < 0 || r > 10) throw new Error('RPE must be 0–10.');
        body.rpe = r;
      }
      const res = await fetch('/api/me/patient-pain-log', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      let j = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        j = null;
      }
      if (!res.ok) throw new Error(j?.error || raw || 'Save failed.');
      setNotes('');
      setRpe('');
      setVas('0');
      await loadAll();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setLogSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold">My care</h1>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              Everything your clinician schedules for you appears here. Use the checklist below during the week.
            </p>
            {patientUserId ? (
              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                Your ForgeFit user ID (share with your clinician for scheduling):{' '}
                <code className="text-emerald-600/90 break-all">{patientUserId}</code>{' '}
                <button
                  type="button"
                  className="text-emerald-400 hover:underline ml-1"
                  onClick={() => navigator.clipboard?.writeText(patientUserId)}
                >
                  Copy
                </button>
              </p>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Link href="/join" className="text-xs text-emerald-400 hover:underline">
              Invite link
            </Link>
            <button
              type="button"
              onClick={async () => {
                const sb = createClient();
                await sb.auth.signOut();
                window.location.href = '/login?redirect=%2Fpatient';
              }}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Sign out
            </button>
          </div>
        </header>

        {error ? (
          <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        {loading ? (
          <p className="text-sm text-slate-400">Loading your care plan…</p>
        ) : (
          <>
            {trainingGuidance?.guidance ? (
              <TrainingGuidanceCard pack={trainingGuidance} />
            ) : trainingGuidanceErr ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 px-4 py-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Training guidance</p>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{trainingGuidanceErr}</p>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide">This week</div>
                <div className="text-2xl font-semibold text-slate-100 mt-1">{weekStats.planned + weekStats.completed}</div>
                <div className="text-xs text-slate-400 mt-1">sessions on calendar</div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide">Completed</div>
                <div className="text-2xl font-semibold text-emerald-400/90 mt-1">{weekStats.completed}</div>
                <div className="text-xs text-slate-400 mt-1">marked done</div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 px-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month</h2>
                <Link
                  href="/calendar"
                  className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 hover:underline shrink-0"
                >
                  Full schedule →
                </Link>
              </div>
              <p className="text-[11px] text-slate-500 px-1 leading-relaxed">
                Dots = planned sessions (run, bike, rehab, etc.). No dot means nothing scheduled that day.
              </p>
              <PatientMonthCalendar
                events={events}
                month={month}
                compact
                onDaySelect={(d) => router.push(`/calendar?focus=${encodeURIComponent(d)}`)}
              />
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-900/40 divide-y divide-slate-800/80">
              <Link
                href="/calendar"
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">My schedule</div>
                  <div className="text-xs text-slate-500 mt-0.5">Calendar, workouts, Strava sync</div>
                </div>
                <span className="text-slate-500">→</span>
              </Link>
              <Link
                href="/messages"
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">Messages</div>
                  <div className="text-xs text-slate-500 mt-0.5">Secure chat with your team</div>
                </div>
                <span className="text-slate-500">→</span>
              </Link>
              <a
                href="#program"
                className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div>
                  <div className="text-sm font-medium text-slate-100">Program details</div>
                  <div className="text-xs text-slate-500 mt-0.5">Phases and exercises</div>
                </div>
                <span className="text-slate-500">↓</span>
              </a>
            </div>

            {upcoming.length ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Up next</h2>
                <ul className="space-y-2">
                  {upcoming.map((ev, i) => (
                    <li key={ev.id || i} className="text-sm text-slate-300">
                      <span className="text-slate-500">{ev.date}</span>
                      <span className="text-slate-600"> · </span>
                      {ev.title}
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-slate-500 mt-2">Open My schedule to log completion or sync Strava.</p>
              </div>
            ) : null}

            <form onSubmit={submitCheckIn} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-slate-200">Quick check-in</h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                Log pain (0–10) and optional session RPE. Your clinician can review this in the portal.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Pain (VAS 0–10)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    required
                    value={vas}
                    onChange={(e) => setVas(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">RPE (optional)</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={rpe}
                    onChange={(e) => setRpe(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                    placeholder="—"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Session type</label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                >
                  <option value="run">Run</option>
                  <option value="gym">Gym</option>
                  <option value="rehab">Rehab</option>
                  <option value="workout">Workout</option>
                  <option value="appt">Appointment day</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  maxLength={4000}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm resize-y"
                  placeholder="How are you feeling?"
                />
              </div>
              <button
                type="submit"
                disabled={logSaving}
                className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 font-semibold py-2.5 text-sm text-slate-950"
              >
                {logSaving ? 'Saving…' : 'Save check-in'}
              </button>
            </form>

            {logs.length ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Recent check-ins</h2>
                <ul className="space-y-2 text-sm text-slate-400">
                  {logs.map((row) => (
                    <li key={row.id} className="flex justify-between gap-2 border-b border-slate-800/60 pb-2 last:border-0">
                      <span>
                        VAS {row.vas}
                        {row.rpe != null ? ` · RPE ${row.rpe}` : ''} · {row.session_type}
                      </span>
                      <span className="text-xs text-slate-600 shrink-0">
                        {row.logged_at ? new Date(row.logged_at).toLocaleDateString() : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <ProgramPreview program={program} />
            {program && programUpdated ? (
              <p className="text-[11px] text-slate-600 text-center">
                Program last updated {new Date(programUpdated).toLocaleString()}
              </p>
            ) : null}
          </>
        )}

        <p className="text-center text-xs text-slate-600 pb-4">
          <Link href="/" className="text-emerald-500/80 hover:underline">
            Workout tools
          </Link>
          <span className="mx-2 text-slate-700">·</span>
          <Link href="/login" className="text-slate-500 hover:underline">
            Switch account
          </Link>
        </p>
      </div>
    </div>
  );
}
