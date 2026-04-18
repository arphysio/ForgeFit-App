'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

const styles = `
  *, *::before, *::after { box-sizing: border-box; }
  .pb-shell { display: flex; height: calc(100vh - 64px); min-height: 720px; overflow: hidden; background: #f5f4f0; color: #1a1917; font-family: "DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  .pb-left { width: 320px; border-right: 1px solid rgba(0,0,0,0.08); background: #fff; display: flex; flex-direction: column; }
  .pb-head { padding: 16px; border-bottom: 1px solid rgba(0,0,0,0.08); }
  .pb-head-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .pb-title { font-size: 13px; font-weight: 600; }
  .pb-toggle { display: flex; background: #f0efeb; border-radius: 6px; padding: 3px; }
  .pb-toggle button { border: none; background: transparent; border-radius: 4px; font-size: 12px; padding: 5px 10px; cursor: pointer; color: #6b6a66; }
  .pb-toggle .active { background: #fff; color: #1a1917; box-shadow: 0 1px 3px rgba(0,0,0,0.09); }
  .pb-panel { flex: 1; overflow: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
  .pb-subhead { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #a8a7a3; margin: 4px 2px 2px; font-weight: 600; }
  .pb-template { border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 12px; cursor: pointer; }
  .pb-template:hover, .pb-template.selected { border-color: #1d9e75; background: #e1f5ee; }
  .pb-template-name { font-size: 13px; font-weight: 500; margin-bottom: 3px; }
  .pb-template-desc { font-size: 11px; color: #6b6a66; line-height: 1.5; }
  .pb-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .pb-tag { font-size: 10px; font-weight: 500; border-radius: 999px; padding: 2px 8px; }
  .pb-t-green { background: #e1f5ee; color: #085041; }
  .pb-t-blue { background: #eff6ff; color: #1e40af; }
  .pb-form { display: grid; gap: 10px; }
  .pb-field label { display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #6b6a66; font-weight: 500; }
  .pb-field input, .pb-field select, .pb-field textarea { width: 100%; border: 1px solid rgba(0,0,0,0.14); border-radius: 6px; padding: 8px 9px; font-size: 13px; background: #f0efeb; }
  .pb-field textarea { min-height: 74px; resize: vertical; }
  .pb-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .pb-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .pb-preset { font-size: 11px; padding: 4px 9px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.1); background: #fff; cursor: pointer; color: #6b6a66; font-family: inherit; }
  .pb-preset:hover { border-color: #1d9e75; color: #085041; background: #e1f5ee; }
  .pb-hint { font-size: 10px; color: #a8a7a3; margin-top: 6px; line-height: 1.45; }
  .pb-generate { border: none; border-radius: 6px; background: #1d9e75; color: white; padding: 9px; font-size: 13px; font-weight: 600; cursor: pointer; }
  .pb-generate:disabled { background: #a8a7a3; cursor: not-allowed; }
  .pb-right { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .pb-right-head { height: 50px; border-bottom: 1px solid rgba(0,0,0,0.08); background: #fff; padding: 0 16px; display: flex; align-items: center; justify-content: space-between; }
  .pb-right-title { font-size: 14px; font-weight: 600; }
  .pb-content { flex: 1; overflow: auto; padding: 16px; }
  .pb-empty { height: 100%; display: grid; place-content: center; text-align: center; color: #a8a7a3; }
  .pb-header-card { background: #fff; border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; padding: 14px; margin-bottom: 12px; }
  .pb-header-card h2 { font-size: 18px; margin: 0 0 4px; }
  .pb-header-card p { color: #6b6a66; margin: 0 0 10px; font-size: 13px; }
  .pb-phase { margin-bottom: 16px; }
  .pb-phase-head { display: flex; align-items: center; gap: 10px; margin-bottom: 9px; }
  .pb-phase-badge { background: #eff6ff; color: #1e40af; font-size: 10px; font-weight: 700; border-radius: 999px; padding: 4px 8px; text-transform: uppercase; letter-spacing: .04em; }
  .pb-ex-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .pb-ex { border: 1px solid rgba(0,0,0,0.08); border-radius: 10px; background: white; padding: 10px; }
  .pb-ex h4 { font-size: 13px; margin: 0 0 6px; }
  .pb-ex p { margin: 0; color: #6b6a66; font-size: 11px; line-height: 1.45; }
  .pb-ex-meta { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  .pb-ex-pill { background: #f0efeb; border-radius: 4px; padding: 2px 6px; font-size: 10px; color: #6b6a66; }
  .pb-error { margin-top: 8px; font-size: 12px; color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 8px; }
  .pb-seg { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 4px; }
  .pb-seg button { flex: 1; min-width: 0; font-size: 11px; font-weight: 600; padding: 8px 6px; border-radius: 8px; border: 1px solid rgba(0,0,0,0.1); background: #f0efeb; color: #6b6a66; cursor: pointer; font-family: inherit; }
  .pb-seg button.pb-on { background: #1d9e75; color: #fff; border-color: #1d9e75; }
  .pb-check { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: #4b5563; margin-top: 4px; }
  .pb-check input { margin-top: 3px; }
`;

const templateCards = [
  { id: 'rtr-post', name: 'Tibialis posterior - 12-week RTR', desc: 'Phase-based return-to-run progression with pain rules and load management.', tags: ['12 weeks', 'RTR', '3 phases'] },
  { id: 'rtr-generic', name: 'General running injury - 8-week RTR', desc: 'Flexible lower limb return-to-run framework.', tags: ['8 weeks', 'RTR', '3 phases'] },
  { id: 'strength-rtr', name: 'Running rehab - gym companion', desc: 'Strength progression to support return-to-run phases.', tags: ['12 weeks', 'Gym', '3 phases'] },
  { id: 'vestibular', name: 'Vestibular rehab - BPPV / hypofunction', desc: 'Gaze, habituation, and balance progressions.', tags: ['6 weeks', 'Vestibular'] },
];

const builtInTemplate = {
  name: 'Tibialis posterior - 12-week RTR',
  patient: 'Template program',
  tags: [{ label: '12 weeks', cls: 'pb-t-green' }, { label: 'Return to run', cls: 'pb-t-blue' }, { label: '3 phases', cls: 'pb-t-green' }],
  phases: [
    {
      label: 'Phase 1',
      title: 'Load reduction and tissue prep',
      subtitle: 'Weeks 1-4',
      exercises: [
        { name: 'Single-leg calf raise', sets: '3', reps: '15', rest: '60s', cue: 'Slow eccentric. Keep pain 3/10 or less.' },
        { name: 'Tibialis posterior isometric', sets: '3', reps: '10 x 10s', rest: '30s', cue: 'Press into resistance, no symptom flare.' },
      ],
    },
    {
      label: 'Phase 2',
      title: 'Progressive loading and walk-run intervals',
      subtitle: 'Weeks 5-8',
      exercises: [
        { name: 'Weighted calf raise', sets: '4', reps: '12', rest: '90s', cue: 'Add load only if symptoms stable 24h later.' },
        { name: 'Walk-run intervals', sets: '1', reps: '3 x 5 min', rest: '2 min walk', cue: 'Flat route, RPE 4-5, stop above pain threshold.' },
      ],
    },
  ],
  painRules: [
    'Stop if pain exceeds 3/10 during activity.',
    'If pain >4/10 next morning, reduce next session load by 30%.',
  ],
};

function workoutToProgram(workout, context) {
  const horizonTag = context.timelineLabel || `${context.durationWeeks ?? 12} wk`;
  const ph = context.phaseCount != null ? String(context.phaseCount) : '3';
  const ageBit = context.patientAge && String(context.patientAge).trim() ? ` · Age ${String(context.patientAge).trim()}` : '';
  const rules = ['Adjust exercise selection using clinical notes, goals, pain flags, and session history.'];
  if (context.clinicalNotes && String(context.clinicalNotes).trim()) {
    rules.push(String(context.clinicalNotes).trim());
  }
  if (context.patientGoals && String(context.patientGoals).trim()) {
    rules.push(`Patient goals: ${String(context.patientGoals).trim()}`);
  }
  return {
    name: workout?.title || `${context.type} program`,
    patient: `Diagnosis: ${context.diagnosis}${ageBit}`,
    tags: [
      { label: horizonTag, cls: 'pb-t-green' },
      { label: context.type, cls: 'pb-t-blue' },
      { label: `${ph} phases`, cls: 'pb-t-green' },
    ],
    phases: [
      {
        label: 'Phase 1',
        title: 'AI generated session',
        subtitle: `${workout?.duration_min ?? 45} min`,
        exercises: (workout?.exercises || []).map((e) => ({
          name: e.name,
          sets: String(e.sets ?? '-'),
          reps: String(e.reps ?? e.hold_seconds ?? '-'),
          rest: `${e.rest_seconds ?? '-'}s`,
          cue: e.notes || 'Follow controlled tempo and pain-aware progression.',
        })),
      },
    ],
    painRules: rules,
  };
}

/** Map API multi-phase `program` object into preview shape. */
function programApiToPreview(p, ctx) {
  const name = p.program_name || p.programName || 'Generated program';
  const phases = (p.phases || []).map((ph, i) => ({
    label: ph.label || `Phase ${i + 1}`,
    title: ph.title || '',
    subtitle: ph.weeks || ph.subtitle || '',
    exercises: (ph.exercises || []).map((e) => ({
      name: e.name || 'Exercise',
      sets: String(e.sets ?? '-'),
      reps: String(e.reps ?? e.hold_seconds ?? '-'),
      rest:
        e.rest_seconds != null && e.rest_seconds !== ''
          ? `${e.rest_seconds}s`
          : String(e.rest || '-'),
      cue: e.notes || e.cue || '',
    })),
  }));
  const pr = Array.isArray(p.pain_rules) ? p.pain_rules : Array.isArray(p.painRules) ? p.painRules : [];
  const extra = [];
  if (ctx.clinicalNotes && String(ctx.clinicalNotes).trim()) extra.push(String(ctx.clinicalNotes).trim());
  if (ctx.patientGoals && String(ctx.patientGoals).trim()) extra.push(`Patient goals: ${String(ctx.patientGoals).trim()}`);
  const ageBit = ctx.patientAge && String(ctx.patientAge).trim() ? ` · Age ${String(ctx.patientAge).trim()}` : '';
  const spanLabel =
    p.duration_label || ctx.timelineLabel || (ctx.durationUnit === 'days' ? `${ctx.programSpan}-day plan` : `${ctx.programSpan} wk plan`);
  return {
    name,
    overview: p.overview || '',
    patient: `Diagnosis: ${ctx.diagnosis}${ageBit}`,
    tags: [
      { label: spanLabel, cls: 'pb-t-green' },
      { label: ctx.type, cls: 'pb-t-blue' },
      { label: `${phases.length} phases`, cls: 'pb-t-green' },
    ],
    phases: phases.length ? phases : [{ label: 'Phase 1', title: 'Program', subtitle: '', exercises: [] }],
    painRules: [...pr.filter(Boolean), ...extra],
  };
}

function programToSaveWorkout(programObj, sessionMinutes) {
  const first = programObj?.phases?.[0];
  const ex = Array.isArray(first?.exercises) ? first.exercises : [];
  const mapped =
    ex.length > 0
      ? ex.slice(0, 12).map((e) => ({
          name: e.name || 'Exercise',
          sets: Number(e.sets) || 1,
          reps: e.reps != null ? Number(e.reps) : null,
          hold_seconds: e.hold_seconds != null ? Number(e.hold_seconds) : null,
          rest_seconds: Number(e.rest_seconds) || 60,
          body_areas: Array.isArray(e.body_areas) ? e.body_areas : [],
          notes: e.notes || '',
        }))
      : [
          {
            name: 'See program preview',
            sets: 1,
            reps: 1,
            hold_seconds: null,
            rest_seconds: 0,
            body_areas: [],
            notes: 'Full multi-phase program saved — open builder preview for all phases.',
          },
        ];
  return {
    title: programObj.program_name || programObj.programName || 'Program',
    duration_min: sessionMinutes,
    intensity: 6,
    ai_note: programObj.overview || '',
    estimated_tss: 0,
    exercises: mapped,
  };
}

export default function ProgramBuilderPage() {
  const router = useRouter();
  const [mode, setMode] = useState('template');
  const [selectedTemplate, setSelectedTemplate] = useState('rtr-post');
  const [program, setProgram] = useState(builtInTemplate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [userHistoryForAi, setUserHistoryForAi] = useState([]);
  const [form, setForm] = useState({
    buildLayout: 'session',
    onlyOneDay: false,
    durationUnit: 'weeks',
    programSpan: '12',
    type: 'Return-to-run',
    diagnosis: 'Tibialis posterior tendinopathy',
    phaseCount: '3',
    sessionDurationMin: '45',
    age: '',
    level: 'Active',
    equipment: 'Gym, bands, dumbbells',
    clinicalNotes: '',
    patientGoals: '',
  });

  const sessionMinutes = useMemo(() => {
    const m = Number.parseInt(String(form.sessionDurationMin), 10);
    if (Number.isFinite(m) && m >= 15 && m <= 180) return m;
    const w = Number.parseInt(String(form.programSpan), 10);
    if (Number.isFinite(w) && w > 0) {
      return Math.max(20, Math.min(120, Math.round(w * 3.5)));
    }
    return 45;
  }, [form.sessionDurationMin, form.programSpan]);

  async function loadWorkoutHistoryForAi() {
    try {
      const res = await fetch('/api/workout-history', { credentials: 'include' });
      if (res.status === 401) return;
      const j = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(j.history)) {
        setUserHistoryForAi(j.history.slice(0, 10));
      }
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadWorkoutHistoryForAi();
  }, []);

  function handleTemplateClick(id) {
    setSelectedTemplate(id);
    if (id === 'rtr-post') {
      setProgram(builtInTemplate);
      setError('');
      return;
    }
    setProgram({
      ...builtInTemplate,
      name: templateCards.find((t) => t.id === id)?.name || builtInTemplate.name,
      patient: 'Template preview',
    });
    setError('');
  }

  async function generateProgram() {
    setError('');
    setLoading(true);
    try {
      const spanNum = Math.min(120, Math.max(1, Number.parseInt(String(form.programSpan), 10) || 12));
      const spanWeeks = Math.min(104, Math.max(1, spanNum));
      const phases = Math.min(24, Math.max(1, Number.parseInt(String(form.phaseCount), 10) || 3));
      const isProgram = form.buildLayout === 'program';

      let programWeeksBody;
      let programDaysBody;
      if (isProgram) {
        if (form.durationUnit === 'weeks') programWeeksBody = spanWeeks;
        else programDaysBody = spanNum;
      } else if (form.onlyOneDay) {
        programDaysBody = 1;
      } else if (form.durationUnit === 'weeks') {
        programWeeksBody = spanWeeks;
      } else {
        programDaysBody = spanNum;
      }

      const timelineLabel = form.durationUnit === 'days' ? `${spanNum}-day` : `${spanWeeks} wk`;

      const ctx = {
        buildLayout: form.buildLayout,
        type: form.type,
        diagnosis: form.diagnosis.trim(),
        durationWeeks: spanWeeks,
        programSpan: spanNum,
        timelineLabel,
        durationUnit: form.durationUnit,
        phaseCount: phases,
        clinicalNotes: form.clinicalNotes,
        patientGoals: form.patientGoals,
        patientAge: form.age,
      };

      const reqBody = {
        outputKind: isProgram ? 'program' : 'session',
        sessionSpan: !isProgram && form.onlyOneDay ? 'one_day' : 'rolling',
        sessionType: form.type,
        duration: sessionMinutes,
        bodyAreas: [form.diagnosis.trim()],
        intensity: form.level === 'Athlete' ? 8 : 6,
        equipment: form.equipment || 'standard gym',
        recoveryScore: 70,
        painFlags: [],
        userHistory: userHistoryForAi.slice(0, 5),
        phaseCount: phases,
        clinicalNotes: form.clinicalNotes,
        patientGoals: form.patientGoals,
        patientAge: form.age,
      };
      if (programWeeksBody != null) reqBody.programWeeks = programWeeksBody;
      if (programDaysBody != null) reqBody.programDays = programDaysBody;

      const response = await fetch('/api/workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
      });

      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        throw new Error(
          payload?.error ||
            (raw && raw.trim().startsWith('<')
              ? 'Server returned an HTML error page. Check /api/workout logs and API keys.'
              : 'Failed to generate program.')
        );
      }
      const kind = payload?.kind || (payload?.program ? 'program' : payload?.workout ? 'session' : null);
      if (kind === 'program' && payload?.program) {
        setProgram(programApiToPreview(payload.program, ctx));
      } else if (payload?.workout) {
        setProgram(workoutToProgram(payload.workout, ctx));
      } else {
        throw new Error('No workout or program payload returned from /api/workout.');
      }
      try {
        const toSave =
          kind === 'program' && payload?.program
            ? programToSaveWorkout(payload.program, sessionMinutes)
            : payload.workout;
        await fetch('/api/workout-history', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workout: toSave,
            sessionType: form.type,
            duration: sessionMinutes,
            bodyAreas: [form.diagnosis.trim()],
            intensity: form.level === 'Athlete' ? 8 : 6,
            equipment: form.equipment || 'standard gym',
            recoveryScore: 70,
            painFlags: [],
          }),
        });
        await loadWorkoutHistoryForAi();
      } catch {
        /* optional when not signed in */
      }
    } catch (e) {
      setError(e?.message || 'Network error while generating program.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="pb-shell">
        <aside className="pb-left">
          <div className="pb-head">
            <div className="pb-head-row">
              <div className="pb-title">Program builder</div>
              <div className="pb-toggle">
                <button className={mode === 'template' ? 'active' : ''} onClick={() => setMode('template')}>Templates</button>
                <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>AI generate</button>
              </div>
            </div>
          </div>

          {mode === 'template' ? (
            <div className="pb-panel">
              <div className="pb-subhead">Template library</div>
              {templateCards.map((tpl) => (
                <div
                  key={tpl.id}
                  role="button"
                  tabIndex={0}
                  className={`pb-template ${selectedTemplate === tpl.id ? 'selected' : ''}`}
                  onClick={() => handleTemplateClick(tpl.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTemplateClick(tpl.id)}
                >
                  <div className="pb-template-name">{tpl.name}</div>
                  <div className="pb-template-desc">{tpl.desc}</div>
                  <div className="pb-tags">
                    {tpl.tags.map((tag) => (
                      <span key={tag} className={`pb-tag ${tag.includes('RTR') ? 'pb-t-blue' : 'pb-t-green'}`}>{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="pb-panel">
              <div className="pb-form">
                <div className="pb-field">
                  <label>Program type</label>
                  <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                    <option>Return-to-run</option>
                    <option>Strength & gym</option>
                    <option>Vestibular rehab</option>
                    <option>Concussion rehab</option>
                  </select>
                </div>
                <div className="pb-field">
                  <label>Diagnosis / condition</label>
                  <input value={form.diagnosis} onChange={(e) => setForm((p) => ({ ...p, diagnosis: e.target.value }))} />
                </div>
                <div className="pb-field">
                  <label>What to generate</label>
                  <div className="pb-seg">
                    <button
                      type="button"
                      className={form.buildLayout === 'session' ? 'pb-on' : ''}
                      onClick={() => setForm((p) => ({ ...p, buildLayout: 'session' }))}
                    >
                      Single workout
                    </button>
                    <button
                      type="button"
                      className={form.buildLayout === 'program' ? 'pb-on' : ''}
                      onClick={() => setForm((p) => ({ ...p, buildLayout: 'program' }))}
                    >
                      Full phased program
                    </button>
                  </div>
                  <div className="pb-hint">
                    Single = one session for a training block. Full = every phase in one JSON across the horizon you set (weeks or days).
                  </div>
                </div>

                {form.buildLayout === 'session' && (
                  <label className="pb-check">
                    <input
                      type="checkbox"
                      checked={form.onlyOneDay}
                      onChange={(e) => setForm((p) => ({ ...p, onlyOneDay: e.target.checked }))}
                    />
                    <span>One calendar day only — one session, no multi-week plan in the title unless your notes require it.</span>
                  </label>
                )}

                {(form.buildLayout === 'program' || (form.buildLayout === 'session' && !form.onlyOneDay)) && (
                  <>
                    <div className="pb-field">
                      <label>Horizon unit</label>
                      <div className="pb-seg">
                        <button
                          type="button"
                          className={form.durationUnit === 'weeks' ? 'pb-on' : ''}
                          onClick={() => setForm((p) => ({ ...p, durationUnit: 'weeks' }))}
                        >
                          Weeks
                        </button>
                        <button
                          type="button"
                          className={form.durationUnit === 'days' ? 'pb-on' : ''}
                          onClick={() => setForm((p) => ({ ...p, durationUnit: 'days' }))}
                        >
                          Days
                        </button>
                      </div>
                    </div>
                    <div className="pb-field">
                      <label>{form.durationUnit === 'weeks' ? 'Length (weeks)' : 'Length (days)'}</label>
                      <input
                        type="number"
                        min={1}
                        max={form.durationUnit === 'weeks' ? 104 : 120}
                        step={1}
                        value={form.programSpan}
                        onChange={(e) => setForm((p) => ({ ...p, programSpan: e.target.value }))}
                      />
                      <div className="pb-presets" aria-label="Span presets">
                        {(form.durationUnit === 'weeks' ? [4, 6, 8, 12, 16, 20, 24, 52] : [1, 3, 7, 10, 14, 21, 28, 56]).map((x) => (
                          <button key={x} type="button" className="pb-preset" onClick={() => setForm((p) => ({ ...p, programSpan: String(x) }))}>
                            {x}
                            {form.durationUnit === 'weeks' ? ' wk' : ' d'}
                          </button>
                        ))}
                      </div>
                      <div className="pb-hint">
                        {form.buildLayout === 'program'
                          ? 'Total span the phased program should cover.'
                          : 'Timeline context for this single session (still one JSON workout).'}
                      </div>
                    </div>
                  </>
                )}

                <div className="pb-field">
                  <label>{form.buildLayout === 'program' ? 'Number of phases (in output)' : 'Macro phases (context)'}</label>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    step={1}
                    value={form.phaseCount}
                    onChange={(e) => setForm((p) => ({ ...p, phaseCount: e.target.value }))}
                  />
                  <div className="pb-presets" aria-label="Phase presets">
                    {[2, 3, 4, 5, 6, 8, 10, 12].map((n) => (
                      <button key={n} type="button" className="pb-preset" onClick={() => setForm((p) => ({ ...p, phaseCount: String(n) }))}>
                        {n} phases
                      </button>
                    ))}
                  </div>
                  <div className="pb-hint">
                    {form.buildLayout === 'program'
                      ? 'How many phase objects appear in the JSON (each with its own exercise list).'
                      : 'How many macro-phases the clinician expects across the programme (shapes emphasis in this session).'}
                  </div>
                </div>
                <div className="pb-field">
                  <label>{form.buildLayout === 'program' ? 'Typical session length (minutes)' : 'Session length (minutes)'}</label>
                  <input
                    type="number"
                    min={15}
                    max={180}
                    step={5}
                    value={form.sessionDurationMin}
                    onChange={(e) => setForm((p) => ({ ...p, sessionDurationMin: e.target.value }))}
                  />
                  <div className="pb-presets" aria-label="Session length presets">
                    {[30, 45, 60, 75, 90].map((m) => (
                      <button key={m} type="button" className="pb-preset" onClick={() => setForm((p) => ({ ...p, sessionDurationMin: String(m) }))}>
                        {m} min
                      </button>
                    ))}
                  </div>
                  <div className="pb-hint">
                    {form.buildLayout === 'program'
                      ? 'Guides how much work fits in a typical training day inside each phase.'
                      : 'Length of the generated workout (15–180 min). If invalid, estimated from horizon.'}
                  </div>
                </div>
                <div className="pb-row2">
                  <div className="pb-field">
                    <label>Patient age</label>
                    <input value={form.age} type="number" min={0} max={120} onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))} />
                  </div>
                  <div className="pb-field">
                    <label>Activity level</label>
                    <select value={form.level} onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}>
                      <option>Sedentary</option>
                      <option>Recreational</option>
                      <option>Active</option>
                      <option>Athlete</option>
                    </select>
                  </div>
                </div>
                <div className="pb-field">
                  <label>Equipment available</label>
                  <input value={form.equipment} onChange={(e) => setForm((p) => ({ ...p, equipment: e.target.value }))} />
                </div>
                <div className="pb-field">
                  <label>Clinical notes</label>
                  <textarea
                    value={form.clinicalNotes}
                    onChange={(e) => setForm((p) => ({ ...p, clinicalNotes: e.target.value }))}
                    placeholder="Impairments, precautions, prior treatments, red flags, load rules…"
                  />
                  <div className="pb-hint">Passed to the model as clinician context — be specific.</div>
                </div>
                <div className="pb-field">
                  <label>Patient goals</label>
                  <textarea
                    value={form.patientGoals}
                    onChange={(e) => setForm((p) => ({ ...p, patientGoals: e.target.value }))}
                    placeholder="e.g. return to 5k run, desk work without pain, sport clearance…"
                  />
                  <div className="pb-hint">What success looks like for the patient; shapes exercise emphasis and coaching tone.</div>
                </div>
                <button className="pb-generate" disabled={loading || !form.diagnosis.trim()} onClick={generateProgram}>
                  {loading ? 'Generating...' : 'Generate program with AI'}
                </button>
                {error && <div className="pb-error">{error}</div>}
              </div>
            </div>
          )}
        </aside>

        <section className="pb-right">
          <div className="pb-right-head">
            <div className="pb-right-title">Program preview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/" style={{ fontSize: 12, color: '#1d9e75', textDecoration: 'none', fontWeight: 600 }}>
                Home
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 6,
                  padding: '5px 10px',
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#6b6a66',
                }}
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="pb-content">
            {!program ? (
              <div className="pb-empty">
                <div>No program yet</div>
                <div>Pick a template or generate with AI.</div>
              </div>
            ) : (
              <>
                <div className="pb-header-card">
                  <h2>{program.name}</h2>
                  <p>{program.patient}</p>
                  {program.overview ? (
                    <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6b6a66', lineHeight: 1.55 }}>{program.overview}</p>
                  ) : null}
                  <div className="pb-tags">
                    {(program.tags || []).map((tag, ti) => (
                      <span key={`${tag.label}-${ti}`} className={`pb-tag ${tag.cls}`}>{tag.label}</span>
                    ))}
                  </div>
                </div>
                {(program.phases || []).map((phase) => (
                  <div key={`${phase.label}-${phase.title}`} className="pb-phase">
                    <div className="pb-phase-head">
                      <span className="pb-phase-badge">{phase.label}</span>
                      <strong>{phase.title}</strong>
                      <span style={{ marginLeft: 'auto', color: '#6b6a66', fontSize: 12 }}>{phase.subtitle}</span>
                    </div>
                    <div className="pb-ex-grid">
                      {(phase.exercises || []).map((ex) => (
                        <article className="pb-ex" key={`${phase.label}-${ex.name}`}>
                          <h4>{ex.name}</h4>
                          <div className="pb-ex-meta">
                            <span className="pb-ex-pill">{ex.sets} sets</span>
                            <span className="pb-ex-pill">{ex.reps}</span>
                            <span className="pb-ex-pill">rest {ex.rest}</span>
                          </div>
                          <p>{ex.cue}</p>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
                {(program.painRules || []).length > 0 && (
                  <div className="pb-header-card" style={{ background: '#fff7ed', borderColor: '#fed7aa' }}>
                    <div style={{ marginBottom: 8, color: '#9a3412', fontSize: 11, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 700 }}>
                      Pain rules
                    </div>
                    {(program.painRules || []).map((rule) => (
                      <p key={rule} style={{ marginBottom: 6, color: '#7c2d12', fontSize: 12 }}>
                        - {rule}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
