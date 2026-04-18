/**
 * Map TrainingPeaks planned-workout "Structure" (Partner API / export JSON)
 * into ForgeFit `structure_json` for the endurance builder.
 *
 * Supports: Step rows, nested Repetition (expanded up to 50 reps), Second/Meter/Mile/Kilometer lengths,
 * HR % threshold / pace / power targets as coaching text + rough HR zone.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function tpLengthFields(length) {
  if (!length || typeof length !== 'object') return { durationMin: null, distanceKm: null };
  const u = String(length.Unit || '').toLowerCase();
  const v = num(length.Value);
  if (v == null) return { durationMin: null, distanceKm: null };
  if (u === 'second') return { durationMin: v / 60, distanceKm: null };
  if (u === 'meter') return { durationMin: null, distanceKm: v / 1000 };
  if (u === 'kilometer' || u === 'km') return { durationMin: null, distanceKm: v };
  if (u === 'mile') return { durationMin: null, distanceKm: v * 1.609344 };
  if (u === 'yard') return { durationMin: null, distanceKm: (v * 0.9144) / 1000 };
  return { durationMin: null, distanceKm: null };
}

function hrPctToZone(midPct) {
  if (midPct == null || !Number.isFinite(midPct)) return null;
  if (midPct < 72) return 1;
  if (midPct < 82) return 2;
  if (midPct < 92) return 3;
  if (midPct < 102) return 4;
  return 5;
}

function tpIntensityFields(step) {
  const t = step.IntensityTarget;
  if (!t || typeof t !== 'object') return { zone: null, intensityNote: '' };
  const unit = String(t.Unit || '');
  const minV = num(t.MinValue);
  const maxV = num(t.MaxValue);
  const val = num(t.Value);
  let note = '';
  let zone = null;

  if (/percentof.*hr|thresholdhr|heartrate/i.test(unit)) {
    const lo = minV ?? val;
    const hi = maxV ?? val;
    const mid = lo != null && hi != null ? (lo + hi) / 2 : val ?? lo ?? hi;
    zone = hrPctToZone(mid);
    note = `TP ${unit.replace(/([A-Z])/g, ' $1').trim()}: ${lo ?? '—'}–${hi ?? '—'}%`;
  } else if (/pace/i.test(unit)) {
    note = `TP pace: ${val ?? minV ?? ''}${maxV != null ? `–${maxV}` : ''} ${unit}`;
  } else if (/power|watt/i.test(unit)) {
    note = `TP power: ${minV ?? val ?? '—'}–${maxV ?? val ?? '—'} W`;
  } else if (unit) {
    note = `TP ${unit}: ${JSON.stringify(t).slice(0, 120)}`;
  }

  return { zone, intensityNote: note };
}

function tpCadence(step) {
  const c = step.CadenceTarget;
  if (!c || typeof c !== 'object') return null;
  const lo = num(c.MinValue);
  const hi = num(c.MaxValue);
  if (lo != null && hi != null) return Math.round((lo + hi) / 2);
  return num(c.Value) ?? lo ?? hi;
}

function mapTpStepToForge(step) {
  const name = typeof step.Name === 'string' ? step.Name.trim() : '';
  const label = name || 'Step';
  const { durationMin, distanceKm } = tpLengthFields(step.Length);
  const { zone, intensityNote } = tpIntensityFields(step);
  const cadenceRpm = tpCadence(step);
  const open = Boolean(step.OpenDuration);
  const bits = [];
  if (step.IntensityClass) bits.push(String(step.IntensityClass));
  const mergedNote = [bits.join(' '), intensityNote].filter(Boolean).join(' · ').slice(0, 500);

  let dm = durationMin;
  let dk = distanceKm;
  if (open && (dm == null || dm === 0) && (dk == null || dk === 0)) {
    dm = 5;
  }
  if ((dm == null || dm === 0) && (dk == null || dk === 0)) {
    dm = 1;
  }

  return {
    label,
    durationMin: dm,
    distanceKm: dk,
    paceMinPerKm: '',
    paceMaxMinPerKm: '',
    intensityMode: zone != null ? 'zone' : 'open',
    zoneBasis: zone != null ? 'hr' : undefined,
    vo2PercentMin: null,
    vo2PercentMax: null,
    speedKph: null,
    zone,
    intensityNote: mergedNote,
    cadenceRpm,
    garminStepType: '',
  };
}

function flattenTpStructure(nodes, maxReps = 50) {
  const out = [];
  const list = Array.isArray(nodes) ? nodes : [];

  for (const node of list) {
    if (!node || typeof node !== 'object') continue;
    const typ = String(node.Type || 'Step').toLowerCase();

    if (typ === 'repetition') {
      const count = Math.min(maxReps, Math.max(1, Math.round(num(node.Length?.Value) || 1)));
      const inner = Array.isArray(node.Steps) ? node.Steps : [];
      for (let r = 1; r <= count; r++) {
        for (const sub of inner) {
          if (!sub || typeof sub !== 'object') continue;
          const st = String(sub.Type || 'Step').toLowerCase();
          if (st === 'repetition') {
            out.push(...flattenTpStructure([sub], maxReps));
          } else {
            const baseName = typeof sub.Name === 'string' ? sub.Name.trim() : 'Step';
            const clone = { ...sub, Name: `${baseName} (rep ${r}/${count})` };
            out.push(mapTpStepToForge(clone));
          }
        }
      }
      continue;
    }

    out.push(mapTpStepToForge(node));
  }

  return out;
}

function workoutTypeToSport(workoutType) {
  const w = String(workoutType || '').toLowerCase();
  if (w.includes('bike') || w === 'mtb' || w.includes('cycl') || w === 'ebikeride') return 'bike';
  return 'run';
}

function parseStructureField(structureField) {
  if (structureField == null) return null;
  if (Array.isArray(structureField)) return structureField;
  if (typeof structureField === 'string') {
    const s = structureField.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * @param {unknown} raw - Full TP plan JSON, or `{ Structure: "..." }`, or the Structure array/string alone.
 * @returns {{ title: string, workoutType: string|null, steps: object[] } | { error: string }}
 */
export function parseTrainingPeaksWorkout(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return { error: 'Paste TrainingPeaks JSON (plan object or Structure array).' };
    try {
      obj = JSON.parse(t);
    } catch {
      return { error: 'Invalid JSON. Paste valid TrainingPeaks structure or plan export.' };
    }
  }

  if (!obj || typeof obj !== 'object') {
    return { error: 'Expected a JSON object or array.' };
  }

  let title = '';
  let workoutType = null;
  let structureNodes = null;

  if (Array.isArray(obj)) {
    structureNodes = obj;
  } else {
    title = typeof obj.Title === 'string' ? obj.Title.trim() : '';
    workoutType = obj.WorkoutType ?? obj.workoutType ?? null;
    structureNodes =
      parseStructureField(obj.Structure) ||
      parseStructureField(obj.structure) ||
      (Array.isArray(obj.Steps) ? obj.Steps : null);
  }

  if (!structureNodes || !structureNodes.length) {
    return {
      error:
        'No workout steps found. Include a TrainingPeaks `Structure` array (from API / export), or paste the full plan JSON that contains `Structure`.',
    };
  }

  const steps = flattenTpStructure(structureNodes);
  if (!steps.length) {
    return { error: 'Could not map any steps from this TrainingPeaks structure.' };
  }

  return { title, workoutType, steps };
}
