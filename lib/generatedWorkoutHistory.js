/**
 * Map a generated_workouts row into the shape /api/workout expects in userHistory.
 */

function exerciseNamesSummary(workout) {
  const ex = Array.isArray(workout?.exercises) ? workout.exercises : [];
  return ex
    .slice(0, 14)
    .map((e) => (e && e.name ? String(e.name) : ''))
    .filter(Boolean)
    .join('; ');
}

/** Compact row for patient UI (Saved workouts list). */
export function mapGeneratedRowToSavedSummary(row) {
  const w = row.workout_json || {};
  const fb = row.session_feedback && typeof row.session_feedback === 'object' ? row.session_feedback : null;
  return {
    id: row.id,
    created_at: row.created_at,
    title: w.title || 'ForgeFit session',
    session_type: row.session_type || '',
    duration_min: row.duration_min ?? w.duration_min ?? null,
    completed: !!fb,
    rpe: fb && fb.rpe != null ? Number(fb.rpe) : null,
    pain_score: fb && fb.pain_score != null ? Number(fb.pain_score) : null,
  };
}

export function mapGeneratedRowToUserHistory(row) {
  const w = row.workout_json || {};
  const fb = row.session_feedback && typeof row.session_feedback === 'object' ? row.session_feedback : null;
  const dateSource = fb?.logged_at || row.created_at;
  let dateStr = '';
  try {
    dateStr = new Date(dateSource).toISOString().split('T')[0];
  } catch {
    dateStr = '';
  }

  const bodyAreas = Array.isArray(row.body_areas) ? row.body_areas : [];
  const extras = [];
  if (bodyAreas.length) extras.push(`Body areas: ${bodyAreas.join(', ')}`);
  const exSum = exerciseNamesSummary(w);
  if (exSum) extras.push(`Session exercises: ${exSum}`);

  let notes = fb?.notes != null ? String(fb.notes) : '';
  if (!fb) {
    const hint = w.ai_note ? `Coach note: ${String(w.ai_note)}` : '';
    const parts = [hint, ...extras].filter(Boolean);
    notes = parts.length ? parts.join(' | ') : extras.join(' | ') || 'Generated session — add completion log after you train.';
  } else if (extras.length) {
    notes = [notes, extras.join(' | ')].filter(Boolean).join(' | ');
  }

  return {
    date: dateStr,
    workout_title: w.title || 'ForgeFit session',
    duration_min: row.duration_min ?? w.duration_min ?? null,
    intensity: row.target_intensity ?? w.intensity ?? null,
    rpe: fb && fb.rpe != null ? Number(fb.rpe) : null,
    pain_score: fb && fb.pain_score != null ? Number(fb.pain_score) : null,
    pain_location: fb?.pain_location ?? null,
    notes,
  };
}
