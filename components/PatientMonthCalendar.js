'use client';

import { useMemo } from 'react';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function typeStyle(ev) {
  const t = String(ev?.type || 'workout').toLowerCase();
  if (t === 'run') return { dot: 'bg-emerald-400', label: 'Run' };
  if (t === 'bike') return { dot: 'bg-sky-400', label: 'Bike' };
  if (t === 'gym') return { dot: 'bg-violet-400', label: 'Gym' };
  if (t === 'rehab') return { dot: 'bg-amber-400', label: 'Rehab' };
  if (t === 'appt') return { dot: 'bg-rose-400', label: 'Appt' };
  return { dot: 'bg-slate-400', label: 'Session' };
}

function cellBackground(eventsForDay) {
  if (!eventsForDay?.length) return 'bg-slate-900/30';
  const planned = eventsForDay.some((e) => e.status !== 'completed');
  const done = eventsForDay.some((e) => e.status === 'completed');
  if (planned && done) return 'bg-slate-800/70';
  if (done) return 'bg-emerald-950/35';
  return 'bg-slate-800/50';
}

/**
 * @param {object} props
 * @param {Array} props.events — from /api/calendar/me (date, type, status, title, …)
 * @param {string} props.month — YYYY-MM
 * @param {boolean} [props.compact]
 * @param {string | null} [props.selectedDate] — YYYY-MM-DD highlight
 * @param {(date: string | null) => void} [props.onDaySelect]
 * @param {string} [props.todayYmd] — optional override for tests
 */
export default function PatientMonthCalendar({
  events,
  month,
  compact = false,
  selectedDate = null,
  onDaySelect,
  todayYmd,
}) {
  const today = todayYmd || new Date().toISOString().slice(0, 10);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const ev of events || []) {
      const d = ev.date?.slice?.(0, 10);
      if (!d) continue;
      if (!m.has(d)) m.set(d, []);
      m.get(d).push(ev);
    }
    return m;
  }, [events]);

  const cells = useMemo(() => {
    const [y, mo] = month.split('-').map((x) => parseInt(x, 10));
    if (!y || !mo) return [];
    const first = new Date(y, mo - 1, 1);
    const lastDay = new Date(y, mo, 0).getDate();
    const startPad = first.getDay();
    const out = [];
    for (let i = 0; i < startPad; i++) {
      out.push({ kind: 'pad', key: `p-${i}` });
    }
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${pad2(mo)}-${pad2(d)}`;
      out.push({ kind: 'day', dateStr, day: d });
    }
    while (out.length % 7 !== 0) {
      out.push({ kind: 'pad', key: `e-${out.length}` });
    }
    return out;
  }, [month]);

  const pad = compact ? 'p-0.5 min-h-[2.25rem]' : 'p-1 min-h-[3.25rem]';
  const dayNum = compact ? 'text-[11px]' : 'text-sm';

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-2 sm:p-3">
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className={`pb-1 font-medium text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px] uppercase tracking-wide'}`}
          >
            {w}
          </div>
        ))}
        {cells.map((c) => {
          if (c.kind === 'pad') {
            return <div key={c.key} className={`rounded-lg ${pad} bg-transparent`} />;
          }
          const list = byDate.get(c.dateStr) || [];
          const isToday = c.dateStr === today;
          const isSelected = selectedDate && c.dateStr === selectedDate;
          const bg = cellBackground(list);

          return (
            <button
              key={c.dateStr}
              type="button"
              onClick={() => onDaySelect?.(c.dateStr)}
              className={`rounded-lg border text-left transition-colors ${pad} ${bg} ${
                isToday ? 'border-emerald-500/60 ring-1 ring-emerald-500/25' : 'border-slate-800/60'
              } ${isSelected ? 'ring-2 ring-amber-400/70 border-amber-500/40' : ''} ${
                onDaySelect ? 'hover:border-slate-600 cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className={`font-medium text-slate-200 ${dayNum}`}>{c.day}</div>
              {list.length ? (
                <div className="mt-0.5 flex flex-wrap gap-0.5 justify-start">
                  {list.slice(0, compact ? 3 : 4).map((ev, i) => {
                    const st = typeStyle(ev);
                    const done = ev.status === 'completed';
                    return (
                      <span
                        key={ev.id || `${c.dateStr}-${i}`}
                        title={`${ev.title || ev.type}${done ? ' · done' : ' · planned'}`}
                        className={`h-1.5 w-1.5 rounded-full ${st.dot} ${done ? 'opacity-60' : ''}`}
                      />
                    );
                  })}
                  {list.length > (compact ? 3 : 4) ? (
                    <span className="text-[9px] text-slate-500 leading-none">+{list.length - (compact ? 3 : 4)}</span>
                  ) : null}
                </div>
              ) : (
                <div className={`mt-0.5 text-slate-600 ${compact ? 'text-[8px]' : 'text-[9px]'}`}>—</div>
              )}
            </button>
          );
        })}
      </div>
      <div className={`mt-2 flex flex-wrap gap-x-3 gap-y-1 text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Run
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Bike
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400" /> Gym
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Rehab
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Appt
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Other
        </span>
        <span className="text-slate-600">· — = no session</span>
      </div>
    </div>
  );
}
