'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import WorkoutPlayer from '@/components/WorkoutPlayer';
import { createClient } from '@/lib/supabase/browser';

const LOGO_URL =
  'https://images.squarespace-cdn.com/content/v1/60a52be915c026765eb5a8a1/1621437533036-850KQJBDESR4SE035GAT/ARPhysio_Logo_White_Print_v%C6%92.png?format=400w';

const brandStyles = `
  :root {
    --ar-navy:   #1a2b3c;
    --ar-accent: #2e7d9e;
    --ar-amber:  #e8a020;
    --ar-amber-hover: #cf8e18;
    --ar-bg:     #f7f5f2;
    --ar-border: #e0ddd9;
    --ar-text:   #1f1f1f;
    --ar-muted:  #6b7280;
    --ar-card:   #ffffff;
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--ar-bg); color: var(--ar-text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  input, select, textarea {
    font-family: inherit;
    font-size: 0.875rem;
    border: 1px solid var(--ar-border);
    border-radius: 8px;
    padding: 0.5rem 0.75rem;
    background: white;
    color: var(--ar-text);
    width: 100%;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  input:focus, select:focus, textarea:focus {
    border-color: var(--ar-accent);
    box-shadow: 0 0 0 3px rgba(46,125,158,0.12);
  }
  label {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--ar-muted);
    display: block;
    margin-bottom: 5px;
    letter-spacing: 0.01em;
  }
`;

function Card({ children, style }) {
  return (
    <div
      style={{
        background: 'var(--ar-card)',
        border: '1px solid var(--ar-border)',
        borderRadius: 14,
        padding: '1.25rem 1.5rem',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionHeading({ title, subtitle, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '1rem',
      }}
    >
      <div>
        <h2 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--ar-navy)', margin: 0, letterSpacing: '0.01em' }}>
          {title}
        </h2>
        {subtitle && <p style={{ fontSize: '0.74rem', color: 'var(--ar-muted)', marginTop: 3 }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function AddButton({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: '0.74rem',
        padding: '0.3rem 0.8rem',
        border: '1px solid var(--ar-border)',
        borderRadius: 8,
        cursor: 'pointer',
        background: 'white',
        color: 'var(--ar-navy)',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function RemoveBtn({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontSize: '0.7rem',
        color: '#ef4444',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontFamily: 'inherit',
      }}
    >
      Remove
    </button>
  );
}

function PainFlagRow({ flag, index, onChange, onRemove }) {
  return (
    <div style={{ border: '1px solid #fde68a', borderRadius: 10, padding: '0.875rem', marginBottom: '0.625rem', background: '#fffbeb' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e' }}>Pain area {index + 1}</span>
        <RemoveBtn onClick={onRemove} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label>Body area / location</label>
          <input value={flag.area} onChange={(e) => onChange(index, 'area', e.target.value)} placeholder="e.g. left knee, lower back" />
        </div>
        <div>
          <label>Severity (0-10)</label>
          <input type="number" min="0" max="10" value={flag.severity} onChange={(e) => onChange(index, 'severity', Number(e.target.value))} />
        </div>
      </div>
      <div style={{ marginBottom: '0.5rem' }}>
        <label>Description of pain</label>
        <input value={flag.description} onChange={(e) => onChange(index, 'description', e.target.value)} placeholder="e.g. sharp on extension, dull ache at rest" />
      </div>
      <div>
        <label>When does it occur?</label>
        <input value={flag.onset} onChange={(e) => onChange(index, 'onset', e.target.value)} placeholder="e.g. during squats, after running, constant" />
      </div>
    </div>
  );
}

function SessionHistoryRow({ session, index, onChange, onRemove }) {
  return (
    <div style={{ border: '1px solid var(--ar-border)', borderRadius: 10, padding: '0.875rem', marginBottom: '0.625rem', background: '#fafaf9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.625rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ar-navy)' }}>Session {index + 1}</span>
        <RemoveBtn onClick={onRemove} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label>Date</label>
          <input type="date" value={session.date} onChange={(e) => onChange(index, 'date', e.target.value)} />
        </div>
        <div>
          <label>Workout title</label>
          <input value={session.workout_title} onChange={(e) => onChange(index, 'workout_title', e.target.value)} placeholder="e.g. Upper Body Strength" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div>
          <label>RPE (0-10)</label>
          <input type="number" min="0" max="10" value={session.rpe ?? ''} onChange={(e) => onChange(index, 'rpe', Number(e.target.value))} />
        </div>
        <div>
          <label>Pain (0-10)</label>
          <input type="number" min="0" max="10" value={session.pain_score ?? ''} onChange={(e) => onChange(index, 'pain_score', Number(e.target.value))} />
        </div>
        <div>
          <label>Intensity</label>
          <input type="number" min="1" max="10" value={session.intensity ?? ''} onChange={(e) => onChange(index, 'intensity', Number(e.target.value))} />
        </div>
      </div>
      {session.pain_score > 0 && (
        <div style={{ marginBottom: '0.5rem' }}>
          <label>Pain location</label>
          <input value={session.pain_location ?? ''} onChange={(e) => onChange(index, 'pain_location', e.target.value)} placeholder="e.g. left shoulder, lower back" />
        </div>
      )}
      <div>
        <label>Notes</label>
        <input value={session.notes ?? ''} onChange={(e) => onChange(index, 'notes', e.target.value)} placeholder="How did it go? Any issues?" />
      </div>
    </div>
  );
}

export default function Page() {
  const router = useRouter();
  const generationIdRef = useRef(null);
  const [sessionType, setSessionType] = useState('Strength');
  const [duration, setDuration] = useState(45);
  const [bodyAreas, setBodyAreas] = useState('Upper body, Core');
  const [intensity, setIntensity] = useState(7);
  const [equipment, setEquipment] = useState('Dumbbells, Bench');
  const [recoveryScore, setRecoveryScore] = useState(70);
  const [painFlags, setPainFlags] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [savedWorkouts, setSavedWorkouts] = useState([]);
  const [workout, setWorkout] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  function formatSavedWorkoutWhen(iso) {
    try {
      return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return '';
    }
  }

  async function loadSessionHistoryFromApi() {
    try {
      const res = await fetch('/api/workout-history', { credentials: 'include' });
      if (res.status === 401) {
        setSavedWorkouts([]);
        return;
      }
      const raw = await res.text();
      let j = null;
      try {
        j = raw ? JSON.parse(raw) : null;
      } catch {
        j = null;
      }
      if (!res.ok || !j?.history) {
        setSavedWorkouts([]);
        return;
      }
      setSessionHistory(j.history.slice(0, 20));
      setSavedWorkouts(Array.isArray(j.savedWorkouts) ? j.savedWorkouts : []);
    } catch (e) {
      console.warn('[ForgeFit] workout history load failed', e);
      setSavedWorkouts([]);
    }
  }

  useEffect(() => {
    loadSessionHistoryFromApi();
  }, []);

  function addPainFlag() {
    setPainFlags((p) => [...p, { area: '', severity: 0, description: '', onset: '' }]);
  }
  function updatePainFlag(i, field, val) {
    setPainFlags((p) => p.map((f, idx) => (idx === i ? { ...f, [field]: val } : f)));
  }
  function removePainFlag(i) {
    setPainFlags((p) => p.filter((_, idx) => idx !== i));
  }
  function addSession() {
    setSessionHistory((p) => [
      {
        date: new Date().toISOString().split('T')[0],
        workout_title: '',
        duration_min: 45,
        intensity: 7,
        rpe: null,
        pain_score: 0,
        pain_location: null,
        notes: '',
      },
      ...p,
    ]);
  }
  function updateSession(i, field, val) {
    setSessionHistory((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)));
  }
  function removeSession(i) {
    setSessionHistory((p) => p.filter((_, idx) => idx !== i));
  }
  async function handleSessionLog(log) {
    const gid = generationIdRef.current;
    if (gid) {
      try {
        const res = await fetch('/api/workout-history', {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: gid,
            rpe: log.rpe,
            pain_score: log.pain_score,
            pain_location: log.pain_location,
            notes: log.notes,
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          console.warn('[ForgeFit] workout feedback save failed', t);
        }
      } catch (e) {
        console.warn('[ForgeFit] workout feedback save failed', e);
      } finally {
        generationIdRef.current = null;
      }
    }
    await loadSessionHistoryFromApi();
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setWorkout(null);
    setIsLoading(true);
    try {
      const res = await fetch('/api/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionType,
          duration: Number(duration),
          bodyAreas: bodyAreas.split(',').map((x) => x.trim()).filter(Boolean),
          intensity: Number(intensity),
          equipment,
          recoveryScore: Number(recoveryScore),
          painFlags: painFlags.filter((f) => f.area.trim()),
          userHistory: sessionHistory,
        }),
      });
      const raw = await res.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }

      if (res.status === 429) {
        const retryAfter = payload?.retryAfterSeconds;
        const minutes = retryAfter ? Math.ceil(retryAfter / 60) : 60;
        setError(`You've generated a lot of workouts today. Please wait ${minutes} minute${minutes !== 1 ? 's' : ''} before generating another.`);
        return;
      }
      if (!res.ok) throw new Error(payload?.error || 'Failed to generate workout.');
      setWorkout(payload.workout);
      generationIdRef.current = null;
      try {
        const saveRes = await fetch('/api/workout-history', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workout: payload.workout,
            sessionType,
            duration: Number(duration),
            bodyAreas: bodyAreas.split(',').map((x) => x.trim()).filter(Boolean),
            intensity: Number(intensity),
            equipment,
            recoveryScore: Number(recoveryScore),
            painFlags: painFlags.filter((f) => f.area.trim()),
          }),
        });
        if (saveRes.ok) {
          const sj = await saveRes.json().catch(() => ({}));
          if (sj?.id) generationIdRef.current = sj.id;
        }
      } catch (e) {
        console.warn('[ForgeFit] workout not saved to profile (sign in or check Supabase migration).', e);
      }
      await loadSessionHistoryFromApi();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: brandStyles }} />
      <header
        style={{
          background: 'var(--ar-navy)',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 2rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <img src={LOGO_URL} alt="AR Physio" style={{ height: 34, objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <Link
            href="/forgefit-complete.html"
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.88)',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '0.3rem 0.65rem',
            }}
          >
            Clinician Portal
          </Link>
          <Link
            href="/program-builder"
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.88)',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '0.3rem 0.65rem',
            }}
          >
            Program Builder
          </Link>
          <Link
            href="/messages"
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.88)',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '0.3rem 0.65rem',
            }}
          >
            Messages
          </Link>
          <Link
            href="/calendar"
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.88)',
              textDecoration: 'none',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '0.3rem 0.65rem',
            }}
          >
            Schedule
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.88)',
              background: 'transparent',
              cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.25)',
              borderRadius: 999,
              padding: '0.3rem 0.65rem',
            }}
          >
            Sign out
          </button>
          <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            ForgeFit
          </span>
        </div>
      </header>

      <div style={{ background: 'var(--ar-navy)', padding: '3rem 2rem 3.5rem', textAlign: 'center', borderBottom: '3px solid var(--ar-amber)' }}>
        <p style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--ar-amber)', marginBottom: '0.6rem' }}>
          Powered by AR Physio
        </p>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: '0.75rem' }}>
          ForgeFit Workout Generator
        </h1>
        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', maxWidth: 480, margin: '0 auto', lineHeight: 1.6 }}>
          Build your session, flag any pain or injury, and get a personalised program adapted to your history.
        </p>
      </div>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '2rem 1.25rem 0' }}>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '1.25rem' }}>
          <Card>
            <SectionHeading title="Session settings" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
              <div>
                <label>Session type</label>
                <select value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
                  <option>Strength</option>
                  <option>Hypertrophy</option>
                  <option>Mobility</option>
                  <option>Conditioning</option>
                  <option>Rehabilitation</option>
                </select>
              </div>
              <div>
                <label>Duration (minutes)</label>
                <input type="number" min="10" max="120" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </div>
              <div>
                <label>Body areas (comma separated)</label>
                <input value={bodyAreas} onChange={(e) => setBodyAreas(e.target.value)} />
              </div>
              <div>
                <label>Target intensity (1-10)</label>
                <input type="number" min="1" max="10" value={intensity} onChange={(e) => setIntensity(e.target.value)} />
              </div>
              <div>
                <label>Equipment available</label>
                <input value={equipment} onChange={(e) => setEquipment(e.target.value)} />
              </div>
              <div>
                <label>Recovery score today (0-100)</label>
                <input type="number" min="0" max="100" value={recoveryScore} onChange={(e) => setRecoveryScore(e.target.value)} />
              </div>
            </div>
          </Card>

          <Card>
            <SectionHeading
              title="Pain & injury flags"
              subtitle="Claude will modify or avoid exercises that aggravate these areas."
              action={<AddButton onClick={addPainFlag} label="+ Add area" />}
            />
            {painFlags.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ar-muted)', fontStyle: 'italic' }}>
                No pain flags added - all exercises will be included.
              </p>
            )}
            {painFlags.map((flag, i) => (
              <PainFlagRow key={i} flag={flag} index={i} onChange={updatePainFlag} onRemove={() => removePainFlag(i)} />
            ))}
          </Card>

          <Card>
            <SectionHeading
              title="Recent session history"
              subtitle="When you are signed in, each generated workout is saved to your profile. Claude uses this list (and your completion log after a session) to progress the next workout."
              action={<AddButton onClick={addSession} label="+ Add session" />}
            />
            {sessionHistory.length === 0 && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ar-muted)', fontStyle: 'italic' }}>No history yet - Claude will generate a baseline session.</p>
            )}
            {sessionHistory.map((session, i) => (
              <SessionHistoryRow key={i} session={session} index={i} onChange={updateSession} onRemove={() => removeSession(i)} />
            ))}
          </Card>

          {savedWorkouts.length > 0 && (
            <Card>
              <SectionHeading
                title="Saved workouts"
                subtitle="Each generated session is stored on your profile. Log how it went under the workout player so the next one can progress safely."
              />
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {savedWorkouts.map((s, i) => (
                  <li
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      gap: '0.75rem',
                      padding: '0.65rem 0',
                      borderBottom: i < savedWorkouts.length - 1 ? '1px solid var(--ar-border)' : 'none',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: 'var(--ar-navy)', lineHeight: 1.35 }}>{s.title}</div>
                      <div style={{ color: 'var(--ar-muted)', fontSize: '0.72rem', marginTop: 3, lineHeight: 1.45 }}>
                        {formatSavedWorkoutWhen(s.created_at)}
                        {s.session_type ? ` · ${s.session_type}` : ''}
                        {s.duration_min != null ? ` · ${s.duration_min} min` : ''}
                      </div>
                    </div>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '0.65rem',
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        padding: '0.2rem 0.45rem',
                        borderRadius: 6,
                        background: s.completed ? '#e1f5ee' : '#f3f4f6',
                        color: s.completed ? '#085041' : 'var(--ar-muted)',
                        alignSelf: 'center',
                      }}
                    >
                      {s.completed
                        ? `Logged${s.rpe != null ? ` · RPE ${s.rpe}` : ''}${s.pain_score != null ? ` · Pain ${s.pain_score}` : ''}`
                        : 'Awaiting log'}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {error && (
            <div style={{ padding: '0.875rem 1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, color: '#991b1b', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <div style={{ background: 'var(--ar-navy)', borderRadius: 16, padding: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="submit"
              disabled={isLoading}
              style={{
                width: '100%',
                maxWidth: 420,
                padding: '0.95rem 2rem',
                background: isLoading ? '#94a3b8' : 'var(--ar-amber)',
                color: isLoading ? 'white' : '#1a1a1a',
                border: 'none',
                borderRadius: 12,
                fontSize: '1rem',
                fontWeight: 700,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                letterSpacing: '0.02em',
                transition: 'background 0.15s, transform 0.1s',
                boxShadow: isLoading ? 'none' : '0 4px 14px rgba(232,160,32,0.35)',
              }}
            >
              {isLoading ? 'Generating your session...' : 'Generate workout'}
            </button>
            <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', margin: 0 }}>Personalised by Claude AI - Adapted to your pain flags and history</p>
          </div>
        </form>

        {workout && (
          <div style={{ marginTop: '2rem' }}>
            <WorkoutPlayer workout={workout} onSessionLog={handleSessionLog} />
          </div>
        )}
      </main>

      <footer
        style={{
          background: 'var(--ar-navy)',
          color: 'rgba(255,255,255,0.45)',
          textAlign: 'center',
          padding: '2rem 1.5rem',
          marginTop: '3rem',
          fontSize: '0.75rem',
          lineHeight: 1.7,
        }}
      >
        <img src={LOGO_URL} alt="AR Physio" style={{ height: 26, objectFit: 'contain', marginBottom: '0.75rem', opacity: 0.6 }} />
        <p style={{ margin: 0 }}>
          © AR Physio · 196A Delta Street, Etobicoke, ON ·{' '}
          <a href="https://arphysio.janeapp.com/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'underline' }}>
            Book an appointment
          </a>
        </p>
        <p style={{ margin: '4px 0 0', fontSize: '0.68rem', color: 'rgba(255,255,255,0.25)' }}>
          ForgeFit is a fitness tool and does not replace professional physiotherapy advice.
        </p>
        <p style={{ margin: '10px 0 0', fontSize: '0.72rem' }}>
          <Link href="/join" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'underline' }}>
            Patient invite link (sign up & care hub)
          </Link>
        </p>
      </footer>
    </>
  );
}
