'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PatientMonthCalendar from '@/components/PatientMonthCalendar';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthKeyFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function formatMonthLabel(ym) {
  const [y, m] = ym.split('-').map((x) => parseInt(x, 10));
  if (!y || !m) return ym;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function planSummary(ev) {
  const p = ev?.plannedLoad;
  if (!p) return null;
  const bits = [`~${Math.round(p.durationSec / 60)} min`];
  if (p.distanceM) bits.push(`${(p.distanceM / 1000).toFixed(1)} km`);
  if (p.tss != null) bits.push(`TSS ${p.tss}`);
  if (p.intensityFactor != null) bits.push(`IF ${p.intensityFactor}`);
  return bits.join(' · ');
}

function doneSummary(ev) {
  const c = ev?.completedLoad;
  if (!c) return null;
  const bits = [];
  if (c.durationSec != null) bits.push(`${Math.round(Number(c.durationSec) / 60)} min`);
  if (c.distanceM != null) bits.push(`${(Number(c.distanceM) / 1000).toFixed(2)} km`);
  if (c.tss != null) bits.push(`TSS ${c.tss}`);
  if (c.intensityFactor != null) bits.push(`IF ${c.intensityFactor}`);
  return bits.length ? bits.join(' · ') : null;
}

/** Stacked bar chart from server `phaseBars` (width = time, height ~ intensity, hue = flow phase). */
function WorkoutFlowChart({ bars, size = 'mini' }) {
  if (!bars?.length) return null;
  const barMax = size === 'large' ? 108 : 14;
  const legendRows = [];
  const seen = new Set();
  for (const b of bars) {
    const k = b.flowPhase || 'active';
    if (seen.has(k)) continue;
    seen.add(k);
    legendRows.push(b);
  }
  return (
    <div
      className={
        size === 'large'
          ? 'rounded-lg border border-slate-700/80 bg-slate-950/50 p-2'
          : 'rounded-md border border-slate-800/60 bg-slate-950/30 px-1 pt-1'
      }
    >
      <div className="flex items-end gap-px overflow-hidden rounded-t" style={{ minHeight: barMax + 6 }}>
        {bars.map((bar, idx) => {
          const grow = Math.max(0.02, Number(bar.widthPct) || 0);
          const fh = bar.flowHue != null ? bar.flowHue : bar.hue ?? 200;
          const hp = Number.isFinite(Number(bar.barHeightPct)) ? Number(bar.barHeightPct) : 55;
          const h = Math.max(size === 'large' ? 10 : 4, Math.round((barMax * Math.min(100, Math.max(25, hp))) / 100));
          const tip = `${bar.roleLabel || ''}: ${bar.label || ''} · ~${Math.round((Number(bar.durationSec) || 0) / 60)} min`;
          return (
            <div
              key={idx}
              title={tip}
              className="min-w-[2px] rounded-t"
              style={{
                flex: `${grow} 1 0`,
                height: h,
                background: `hsl(${fh}, 68%, 46%)`,
              }}
            />
          );
        })}
      </div>
      {size === 'large' && legendRows.length ? (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
          {legendRows.map((b) => (
            <span key={b.flowPhase + (b.roleLabel || '')} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{
                  background: `hsl(${b.flowHue != null ? b.flowHue : b.hue}, 68%, 46%)`,
                }}
              />
              {b.roleLabel || b.flowPhase}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CalendarPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dayFilter, setDayFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState('09:00');
  const [title, setTitle] = useState('');
  const [type, setType] = useState('workout');
  const [status, setStatus] = useState('planned');
  const [notes, setNotes] = useState('');
  const [logEvent, setLogEvent] = useState(null);
  const [durMin, setDurMin] = useState('');
  const [distKm, setDistKm] = useState('');
  const [tssVal, setTssVal] = useState('');
  const [ifVal, setIfVal] = useState('');
  const [logSaving, setLogSaving] = useState(false);
  const [stravaSyncing, setStravaSyncing] = useState(false);
  const [fitImporting, setFitImporting] = useState(false);
  const activityFitInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/me?month=${encodeURIComponent(month)}`, {
        credentials: 'include',
      });
      const raw = await res.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(payload?.error || raw || 'Could not load calendar.');
      }
      setEvents(Array.isArray(payload?.events) ? payload.events : []);
    } catch (e) {
      setError(e.message || 'Failed to load');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const focus = searchParams.get('focus');
    if (focus && /^\d{4}-\d{2}-\d{2}$/.test(focus)) {
      setDayFilter(focus);
      const ym = focus.slice(0, 7);
      setMonth((prev) => (ym !== prev ? ym : prev));
    } else {
      setDayFilter(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!logEvent) return;
    const c = logEvent.completedLoad;
    setDurMin(
      c?.durationSec != null ? String(Math.round((Number(c.durationSec) / 60) * 10) / 10) : ''
    );
    setDistKm(
      c?.distanceM != null
        ? String(Math.round((Number(c.distanceM) / 1000) * 100) / 100)
        : ''
    );
    setTssVal(c?.tss != null ? String(c.tss) : '');
    setIfVal(c?.intensityFactor != null ? String(c.intensityFactor) : '');
  }, [logEvent]);

  async function handleAdd(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/calendar', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, time, title: title.trim(), type, status, notes: notes.trim() }),
      });
      const raw = await res.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(payload?.error || raw || 'Could not save.');
      }
      setTitle('');
      setNotes('');
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function shiftMonth(delta) {
    const [y, m] = month.split('-').map((x) => parseInt(x, 10));
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(monthKeyFromDate(d));
    setDayFilter(null);
    router.replace('/calendar', { scroll: false });
  }

  const listEvents =
    dayFilter != null ? events.filter((e) => (e.date || '').slice(0, 10) === dayFilter) : events;

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = String(reader.result || '');
        const i = r.indexOf(',');
        resolve(i >= 0 ? r.slice(i + 1) : r);
      };
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });
  }

  async function importActivityFitFromFile() {
    const inp = activityFitInputRef.current;
    const file = inp?.files?.[0];
    if (!file) {
      setError('Choose a .fit or .fit.gz file (e.g. from Zwift my.zwift.com → Activities → download).');
      return;
    }
    setFitImporting(true);
    setError('');
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await fetch('/api/calendar/me/import-activity-fit', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileBase64, fileName: file.name }),
      });
      const raw = await res.text();
      let j = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        j = null;
      }
      if (!res.ok) {
        throw new Error(j?.error || raw || 'Import failed.');
      }
      if (inp) inp.value = '';
      await load();
    } catch (e) {
      setError(e.message || 'Import failed');
    } finally {
      setFitImporting(false);
    }
  }

  async function saveCompletion() {
    if (!logEvent?.id) return;
    setLogSaving(true);
    setError('');
    try {
      const cm = { ...(logEvent.completedLoad && typeof logEvent.completedLoad === 'object' ? logEvent.completedLoad : {}) };
      if (durMin.trim()) {
        const dm = Number(durMin.trim());
        if (Number.isFinite(dm) && dm > 0) cm.durationSec = Math.round(dm * 60);
        else delete cm.durationSec;
      } else {
        delete cm.durationSec;
      }
      if (distKm.trim()) {
        const dk = Number(distKm.trim());
        if (Number.isFinite(dk) && dk >= 0) cm.distanceM = Math.round(dk * 1000);
        else delete cm.distanceM;
      } else {
        delete cm.distanceM;
      }
      if (tssVal.trim()) {
        const t = Number(tssVal.trim());
        if (Number.isFinite(t) && t >= 0) cm.tss = Math.round(t * 10) / 10;
        else delete cm.tss;
      } else {
        delete cm.tss;
      }
      if (ifVal.trim()) {
        const f = Number(ifVal.trim());
        if (Number.isFinite(f) && f > 0) cm.intensityFactor = Math.round(f * 1000) / 1000;
        else delete cm.intensityFactor;
      } else {
        delete cm.intensityFactor;
      }
      const patchBody = { status: 'completed' };
      if (Object.keys(cm).length) patchBody.completedMetrics = cm;
      const res = await fetch(`/api/calendar/me/${encodeURIComponent(logEvent.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchBody),
      });
      const raw = await res.text();
      let resJson = null;
      try {
        resJson = raw ? JSON.parse(raw) : null;
      } catch {
        resJson = null;
      }
      if (!res.ok) {
        throw new Error(resJson?.error || raw || 'Could not save completion.');
      }
      setLogEvent(null);
      await load();
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setLogSaving(false);
    }
  }

  async function syncStravaForSession() {
    if (!logEvent?.id) return;
    setStravaSyncing(true);
    setError('');
    try {
      const res = await fetch(`/api/calendar/me/${encodeURIComponent(logEvent.id)}/strava-sync`, {
        method: 'POST',
        credentials: 'include',
      });
      const raw = await res.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!res.ok) {
        throw new Error(payload?.error || raw || 'Strava sync failed.');
      }
      setLogEvent(null);
      await load();
    } catch (err) {
      setError(err.message || 'Strava sync failed');
    } finally {
      setStravaSyncing(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Link href="/patient" className="text-sm text-emerald-400 hover:underline">
            ← My care
          </Link>
          <h1 className="text-lg font-semibold">My schedule</h1>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300 w-16 text-right">
            Tools
          </Link>
        </div>

        <p className="text-sm text-slate-400 leading-relaxed">
          The month view shows days your clinician planned (colored dots by type: run, bike, rehab, etc.). Days with no
          session show an em dash. Tap a day to filter the list; add your own sessions below.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            ← Prev
          </button>
          <span className="text-sm font-medium">{formatMonthLabel(month)}</span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Next →
          </button>
        </div>

        {!loading ? (
          <PatientMonthCalendar
            events={events}
            month={month}
            selectedDate={dayFilter}
            onDaySelect={(d) => {
              setDayFilter((prev) => {
                const next = prev === d ? null : d;
                const url = next ? `/calendar?focus=${encodeURIComponent(next)}` : '/calendar';
                router.replace(url, { scroll: false });
                return next;
              });
            }}
          />
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <p className="text-sm text-slate-400">Loading calendar…</p>
          </div>
        )}

        {dayFilter ? (
          <div className="flex items-center justify-between rounded-lg border border-amber-900/40 bg-amber-950/25 px-3 py-2 text-sm">
            <span className="text-amber-100/90">
              Showing <strong>{dayFilter}</strong> ({listEvents.length} session{listEvents.length === 1 ? '' : 's'})
            </span>
            <button
              type="button"
              className="text-amber-300 hover:text-amber-200 text-xs font-medium"
              onClick={() => {
                setDayFilter(null);
                router.replace('/calendar', { scroll: false });
              }}
            >
              Clear
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-rose-400 bg-rose-950/40 border border-rose-900/50 rounded-lg px-3 py-2">{error}</p>
        ) : null}

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {dayFilter ? 'Sessions on selected day' : 'This month (list)'}
          </h2>
          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : listEvents.length === 0 ? (
            <p className="text-sm text-slate-400">
              {dayFilter ? 'Nothing scheduled that day. Try another date or clear the filter.' : 'No sessions yet. Add one below.'}
            </p>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {listEvents.map((ev, i) => {
                const key = ev.id || `${ev.date}-${ev.time}-${i}`;
                const plan = planSummary(ev);
                const done = doneSummary(ev);
                const adh = ev.compliance?.overallPercent != null ? `${ev.compliance.overallPercent}% adherence` : null;
                return (
                  <li
                    key={key}
                    className={`text-sm border-b border-slate-800/80 pb-2 last:border-0 last:pb-0 ${ev.id ? 'cursor-pointer hover:bg-slate-800/40 rounded-lg px-1 -mx-1' : ''}`}
                    onClick={() => {
                      if (ev.id) setLogEvent(ev);
                    }}
                    onKeyDown={(e) => {
                      if (ev.id && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setLogEvent(ev);
                      }
                    }}
                    role={ev.id ? 'button' : undefined}
                    tabIndex={ev.id ? 0 : undefined}
                  >
                    <span className="text-slate-300 font-medium">{ev.date}</span>
                    <span className="text-slate-500"> · {ev.time}</span>
                    <div className="text-slate-200 mt-0.5">{ev.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {ev.type} · {ev.status}
                      {ev.id ? <span className="text-emerald-500/90"> · tap to log</span> : null}
                    </div>
                    {plan ? <div className="text-[11px] text-slate-500 mt-1">Plan: {plan}</div> : null}
                    {done ? <div className="text-[11px] text-slate-400 mt-0.5">Done: {done}</div> : null}
                    {adh ? <div className="text-[11px] text-amber-400/90 mt-0.5">{adh}</div> : null}
                    {ev.phaseBars?.length ? (
                      <div className="mt-2">
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500 mb-1">Flow</div>
                        <WorkoutFlowChart bars={ev.phaseBars} size="mini" />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-200">Zwift &amp; indoor activities</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Zwift does not offer a public “sign in with Zwift” API for apps like ForgeFit. The usual path is{' '}
            <strong>Zwift → Strava</strong> auto-upload, then <strong>Sync from Strava</strong> on a planned session (we
            match <code className="text-emerald-500/90">VirtualRide</code> / <code className="text-emerald-500/90">VirtualRun</code>
            ). Or download your completed session <strong>.fit</strong> from{' '}
            <a
              href="https://my.zwift.com/profile/activities"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              my.zwift.com
            </a>{' '}
            and import it here—it creates a <strong>completed</strong> calendar entry with time and distance.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <input
              ref={activityFitInputRef}
              type="file"
              accept=".fit,.fit.gz,.gz,application/gzip,application/octet-stream"
              className="text-xs text-slate-300 file:mr-2 file:rounded file:border-0 file:bg-slate-700 file:px-2 file:py-1 file:text-slate-200"
            />
            <button
              type="button"
              disabled={fitImporting}
              onClick={() => importActivityFitFromFile()}
              className="rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-950/60 disabled:opacity-50"
            >
              {fitImporting ? 'Importing…' : 'Import activity .fit'}
            </button>
          </div>
        </div>

        <form
          onSubmit={handleAdd}
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-slate-200">Add session</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Title</label>
            <input
              required
              maxLength={500}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easy run 30 min"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              >
                <option value="run">Run</option>
                <option value="bike">Bike</option>
                <option value="gym">Gym / strength</option>
                <option value="rehab">Rehab</option>
                <option value="workout">Workout</option>
                <option value="appt">Appointment</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
              >
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Notes (optional)</label>
            <textarea
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm resize-y"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-semibold py-2.5 text-sm"
          >
            {saving ? 'Saving…' : 'Save to calendar'}
          </button>
        </form>
      </div>

      {logEvent ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
          onClick={() => setLogEvent(null)}
          onKeyDown={(e) => e.key === 'Escape' && setLogEvent(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="log-modal-title"
          >
            <h2 id="log-modal-title" className="text-base font-semibold text-slate-100 pr-8">
              Log workout
            </h2>
            <p className="text-xs text-slate-500 mt-1 mb-3">
              {logEvent.date} · {logEvent.title}
            </p>
            {planSummary(logEvent) ? (
              <p className="text-xs text-slate-400 mb-3">Planned: {planSummary(logEvent)}</p>
            ) : null}
            {logEvent.phaseBars?.length ? (
              <div className="mb-4">
                <p className="text-xs font-medium text-slate-400 mb-2">Planned workout flow</p>
                <WorkoutFlowChart bars={logEvent.phaseBars} size="large" />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Duration (min)</label>
                <input
                  value={durMin}
                  onChange={(e) => setDurMin(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="e.g. 54"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Distance (km)</label>
                <input
                  value={distKm}
                  onChange={(e) => setDistKm(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="e.g. 10.2"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">TSS (optional)</label>
                <input
                  value={tssVal}
                  onChange={(e) => setTssVal(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="from device / app"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">IF (optional)</label>
                <input
                  value={ifVal}
                  onChange={(e) => setIfVal(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-2 text-sm"
                  inputMode="decimal"
                  placeholder="e.g. 0.85"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
              Strava sync picks the best same-calendar-day activity (run/ride) and fills duration, distance, and rough load
              from Strava data. Connect Strava under your ForgeFit integrations.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={logSaving || stravaSyncing}
                onClick={() => saveCompletion()}
                className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-semibold py-2.5 text-sm"
              >
                {logSaving ? 'Saving…' : 'Save completion'}
              </button>
              <button
                type="button"
                disabled={logSaving || stravaSyncing}
                onClick={() => syncStravaForSession()}
                className="flex-1 rounded-lg border border-slate-600 text-slate-100 py-2.5 text-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {stravaSyncing ? 'Syncing Strava…' : 'Sync from Strava'}
              </button>
              <button
                type="button"
                onClick={() => setLogEvent(null)}
                className="flex-1 rounded-lg border border-slate-700 text-slate-300 py-2.5 text-sm hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 p-6 flex items-center justify-center">
          <p className="text-sm text-slate-400">Loading schedule…</p>
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
