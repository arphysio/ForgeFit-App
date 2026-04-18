/**
 * Map Garmin / TrainingPeaks workout FIT (after gunzip) into ForgeFit endurance steps.
 */

import { extractWorkoutStepsFromFitBuffer } from '@/lib/fitWorkoutRecordsParse';

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** FIT global profile `wkt_step_duration` (global_message_number 27, field 1). */
const WKT_STEP_DURATION_BY_NUM = {
  0: 'time',
  1: 'distance',
  2: 'hr_less_than',
  3: 'hr_greater_than',
  4: 'calories',
  5: 'open',
  6: 'repeat_until_steps_cmplt',
  7: 'repeat_until_time',
  8: 'repeat_until_distance',
  9: 'repeat_until_calories',
  10: 'repeat_until_hr_less_than',
  11: 'repeat_until_hr_greater_than',
  12: 'repeat_until_power_less_than',
  13: 'repeat_until_power_greater_than',
  14: 'power_less_than',
  15: 'power_greater_than',
  16: 'training_peaks_tss',
  17: 'repeat_until_power_last_lap_less_than',
  18: 'repeat_until_max_power_last_lap_less_than',
  19: 'power_3s_less_than',
  20: 'power_10s_less_than',
  21: 'power_30s_less_than',
  22: 'power_3s_greater_than',
  23: 'power_10s_greater_than',
  24: 'power_30s_greater_than',
  25: 'power_lap_less_than',
  26: 'power_lap_greater_than',
  27: 'repeat_until_training_peaks_tss',
  28: 'repetition_time',
  29: 'reps',
};

function normalizeWktStepDurationType(v) {
  if (typeof v === 'number' && Number.isFinite(v) && WKT_STEP_DURATION_BY_NUM[v]) {
    return WKT_STEP_DURATION_BY_NUM[v];
  }
  return String(v || '').toLowerCase();
}

/**
 * FIT spec says `duration_value` for `time` is seconds, but some exports (e.g. TP / Garmin
 * variants) store milliseconds. Convert to minutes and clamp to builder limits.
 */
function fitTimeRawToMinutes(raw) {
  const v = num(raw);
  if (v == null || v <= 0) return null;
  const asSec = v / 60;
  if (asSec > 0 && asSec <= 600) return Math.max(0.05, asSec);
  const asMs = v / 60000;
  if (asMs > 0 && asMs <= 600) return Math.max(0.05, asMs);
  const asMinLiteral = v;
  if (asMinLiteral > 0 && asMinLiteral <= 600) return Math.max(0.05, asMinLiteral);
  return Math.min(600, Math.max(0.05, asSec));
}

/** Coggan-style zone from fractional FTP (0–1+). */
function zoneFromFtpFraction(f) {
  if (f == null || !Number.isFinite(f)) return 3;
  const pct = f * 100;
  if (pct < 60) return 1;
  if (pct < 75) return 2;
  if (pct < 88) return 3;
  if (pct < 102) return 4;
  return 5;
}

function midFtpFraction(low, high, single) {
  const lo = num(low);
  const hi = num(high);
  const s = num(single);
  if (s != null) return s;
  if (lo != null && hi != null) return (lo + hi) / 2;
  return lo ?? hi ?? null;
}

function sportFromFitWorkout(workout, sports) {
  const raw = String(workout?.sport || '').toLowerCase();
  if (raw.includes('bike') || raw.includes('cycl') || raw === 'ebikeride' || raw === 'mtb') return 'bike';
  if (raw.includes('run') || raw.includes('walk')) return 'run';
  const first = sports?.[0];
  const sr = String(first?.name || first?.sport || '').toLowerCase();
  if (sr.includes('bike') || sr.includes('cycl')) return 'bike';
  return 'run';
}

function ftpFractionFromPowerTargets(st, ftpWatts) {
  const lo = num(st.custom_target_value_low);
  const hi = num(st.custom_target_value_high);
  const tv = num(st.target_value);
  if (ftpWatts != null && ftpWatts > 0) {
    if (lo != null && lo > 10 && lo < 2000) {
      const fracLo = lo / ftpWatts;
      const fracHi = hi != null && hi > 10 ? hi / ftpWatts : fracLo;
      if (fracLo > 0.2 && fracLo < 2.5) return midFtpFraction(fracLo, fracHi, null);
    }
  }
  if (lo != null && hi != null && lo <= 200 && hi <= 200 && lo >= 30) {
    return midFtpFraction(lo / 100, hi / 100, null);
  }
  if (tv != null && tv > 30 && tv <= 200) return tv / 100;
  return null;
}

/**
 * @param {Uint8Array|Buffer|ArrayBuffer} buffer — raw FIT (not gzip)
 * @returns {{ title: string, workoutType: string, steps: object[], ftpWatts?: number|null } | { error: string }}
 */
export function parseFitWorkoutBufferToEndurance(buffer) {
  const { workout, workoutSteps, fileIds, sports, error } = extractWorkoutStepsFromFitBuffer(buffer);
  if (error) return { error };

  const idTypes = (fileIds || []).map((f) => f?.type).filter(Boolean);
  if (idTypes.includes('activity')) {
    return {
      error:
        'This FIT file is an activity recording, not a planned workout. In TrainingPeaks use Quick View → Export → .zwo / .mrc / .erg, or export the planned workout FIT (not the completed session).',
    };
  }

  if (!workoutSteps.length) {
    return {
      error:
        'No workout steps found in this FIT file. If this came from TrainingPeaks, try exporting .zwo from Quick View, or ensure the file is a workout download (not an activity).',
    };
  }

  const sport = sportFromFitWorkout(workout, sports);
  const title =
    (typeof workout?.wkt_name === 'string' && workout.wkt_name.trim()) ||
    (typeof workout?.name === 'string' && workout.name.trim()) ||
    'Imported workout';

  const ftpWatts = num(workout?.target_value) && num(workout.target_value) > 30 && num(workout.target_value) < 750
    ? Math.round(num(workout.target_value))
    : null;

  const steps = [];
  let i = 0;
  for (const st of workoutSteps) {
    const durType = normalizeWktStepDurationType(st.duration_type);
    if (
      durType.includes('repeat') ||
      durType === 'repeat_until_steps_cmplt' ||
      durType === 'repetition_time'
    ) {
      return {
        error:
          'This workout uses FIT repeat / lap rules that ForgeFit does not expand yet. Export .zwo from TrainingPeaks (Quick View → Export) or paste JSON with Structure.',
      };
    }

    const labelBase =
      (typeof st.wkt_step_name === 'string' && st.wkt_step_name.trim()) ||
      `${String(st.intensity || 'step').replace(/_/g, ' ')} ${i + 1}`;

    let durationMin = null;
    let distanceKm = null;

    if (durType === 'time') {
      durationMin = fitTimeRawToMinutes(st.duration_value);
    } else if (durType === 'distance') {
      const m = num(st.duration_value);
      if (m != null && m > 0) {
        const km = m / 1000;
        distanceKm = Math.max(0.001, Math.min(500, km));
      }
    } else if (durType === 'open' || durType === 'reps' || durType === '') {
      const openMin = fitTimeRawToMinutes(st.duration_value);
      durationMin = openMin != null ? openMin : 10;
    } else if (durType === 'calories') {
      durationMin = 15;
    } else {
      return {
        error: `Unsupported FIT step duration type "${st.duration_type}". Try a .zwo export or simplify the workout in TrainingPeaks.`,
      };
    }

    if ((durationMin == null || durationMin === 0) && (distanceKm == null || distanceKm === 0)) {
      return { error: `Could not derive duration or distance for step "${labelBase}".` };
    }

    const targetType = String(st.target_type || 'open').toLowerCase();
    const intensity = String(st.intensity || 'active').toLowerCase();

    let intensityMode = 'zone';
    let zoneBasis = sport === 'bike' ? 'power' : 'pace';
    let zone = 3;
    let intensityNote = `FIT import · ${targetType || 'open'}${durType ? ` · ${durType}` : ''}`.slice(0, 500);
    const cadenceRpm = num(st.target_type === 'cadence' ? st.target_value : st.cadence) || null;

    if (targetType === 'power' || targetType === 'power_3s' || targetType === 'power_10s') {
      zoneBasis = 'power';
      const f = ftpFractionFromPowerTargets(st, ftpWatts);
      zone = f != null ? zoneFromFtpFraction(f) : 3;
      if (f != null) intensityNote = (`~${Math.round(f * 100)}% FTP (FIT)`).slice(0, 500);
    } else if (targetType === 'heart_rate') {
      zoneBasis = 'hr';
      zone = 3;
    } else if (targetType === 'cadence') {
      zoneBasis = sport === 'bike' ? 'power' : 'pace';
      zone = 3;
      intensityNote = (`Cadence target (FIT) · ${labelBase}`).slice(0, 500);
    } else if (targetType === 'speed' && sport === 'run') {
      zoneBasis = 'pace';
      const mps = num(st.target_value) || num(st.custom_target_value_low);
      if (mps != null && mps > 0.5 && mps < 12) {
        const kph = mps * 3.6;
        intensityMode = 'open';
        zone = null;
        steps.push({
          kind: 'step',
          label: labelBase.slice(0, 120),
          durationMin,
          distanceKm,
          paceMinPerKm: '',
          paceMaxMinPerKm: '',
          intensityMode: 'open',
          zoneBasis: 'pace',
          zone: null,
          speedKph: kph,
          intensityNote: (`~${kph.toFixed(2)} kph from FIT`).slice(0, 500),
          cadenceRpm: cadenceRpm && cadenceRpm > 0 && cadenceRpm < 300 ? Math.round(cadenceRpm) : null,
          garminStepType: intensity.slice(0, 20),
        });
        i++;
        continue;
      }
    } else if (targetType === 'open' || targetType === 'cadence' || !targetType) {
      if (intensity === 'rest' || intensity === 'recovery') {
        zone = 1;
        zoneBasis = sport === 'bike' ? 'power' : 'hr';
      } else {
        zone = 3;
      }
    }

    steps.push({
      kind: 'step',
      label: labelBase.slice(0, 120),
      durationMin,
      distanceKm,
      paceMinPerKm: '',
      paceMaxMinPerKm: '',
      intensityMode,
      zoneBasis,
      zone,
      speedKph: null,
      intensityNote,
      cadenceRpm: cadenceRpm && cadenceRpm > 0 && cadenceRpm < 300 ? Math.round(cadenceRpm) : null,
      garminStepType: intensity.slice(0, 20),
    });
    i++;
  }

  return {
    title: title.slice(0, 500),
    workoutType: sport,
    steps,
    ftpWatts: ftpWatts || null,
  };
}
