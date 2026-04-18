/** ForgeFit endurance structure validation and Garmin Connect mapping (best-effort). */

const HR_ZONE_BASE = [0, 108, 122, 136, 150, 165];

export function parsePaceSecondsPerKm(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  const m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) {
    const min = parseInt(m[1], 10);
    const sec = parseInt(m[2], 10);
    if (Number.isFinite(min) && Number.isFinite(sec)) return min * 60 + sec;
  }
  const n = parseFloat(s);
  if (Number.isFinite(n) && n > 0) return Math.round(n * 60);
  return null;
}

function hrBandFromZone(z) {
  const zone = Math.min(5, Math.max(1, Math.round(Number(z) || 3)));
  const low = HR_ZONE_BASE[zone] || 120;
  const high = HR_ZONE_BASE[zone + 1] ? HR_ZONE_BASE[zone + 1] - 1 : low + 14;
  return { low, high };
}

/** Rough HR band from %VO2max (or %threshold) for Garmin HEART_RATE target when pace not set. */
function hrBandFromVo2Percent(loPct, hiPct) {
  const lo = Number(loPct);
  const hi = Number(hiPct);
  const mid =
    Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : Number.isFinite(lo) ? lo : 75;
  const p = Math.min(125, Math.max(50, mid));
  const approxHr = 95 + ((p - 50) * (182 - 95)) / 75;
  const spread = 7;
  return {
    low: Math.max(60, Math.round(approxHr - spread)),
    high: Math.min(195, Math.round(approxHr + spread)),
  };
}

function normalizeIntensityMode(raw) {
  const s = String(raw || 'open').toLowerCase().trim();
  if (s === 'zone' || s === 'z') return 'zone';
  if (s === 'vo2_pct' || s === 'vo2' || s === 'vo2max') return 'vo2_pct';
  return 'open';
}

/** How Z1–5 should be interpreted when intensity is Zone (Garmin target + load model). */
export function normalizeZoneBasis(raw) {
  const s = String(raw || 'hr').toLowerCase().trim();
  if (s === 'pace' || s === 'p') return 'pace';
  if (s === 'power' || s === 'pwr' || s === 'w' || s === 'ftp') return 'power';
  return 'hr';
}

/** Midpoint %FTP by zone (Coggan-style ballpark). */
const ZONE_POWER_PCT_MID = { 1: 0.55, 2: 0.68, 3: 0.83, 4: 0.98, 5: 1.12 };

/** Speed vs threshold speed for running pace zones (threshold = 1). */
const ZONE_PACE_SPEED_FACTOR = { 1: 0.78, 2: 0.85, 3: 0.93, 4: 1.02, 5: 1.08 };

/** Static bike “pace zone” proxy as kph mid when no FTP (fallback). */
const ZONE_BIKE_KPH_MID = { 1: 22, 2: 26, 3: 30, 4: 34, 5: 39 };

/** Rough intensity factor by HR zone for planned TSS / chart shading. */
const ZONE_IF = { 1: 0.62, 2: 0.72, 3: 0.82, 4: 0.92, 5: 1.02 };

function cleanSegment(st, labelPrefix, index, role, sport = 'run') {
  const label =
    typeof st.label === 'string'
      ? st.label.trim().slice(0, 120)
      : `${labelPrefix} ${role}`.slice(0, 120);
  const durationMin =
    st.durationMin != null && st.durationMin !== '' ? Number(st.durationMin) : null;
  const distanceKm =
    st.distanceKm != null && st.distanceKm !== '' ? Number(st.distanceKm) : null;
  const paceMinPerKm =
    typeof st.paceMinPerKm === 'string' ? st.paceMinPerKm.trim().slice(0, 12) : '';
  const paceMaxMinPerKm =
    typeof st.paceMaxMinPerKm === 'string' ? st.paceMaxMinPerKm.trim().slice(0, 12) : '';
  const speedKph =
    st.speedKph != null && st.speedKph !== '' ? Number(st.speedKph) : null;
  const zone = st.zone != null && st.zone !== '' ? Number(st.zone) : null;
  const vo2PercentMin =
    st.vo2PercentMin != null && st.vo2PercentMin !== '' ? Number(st.vo2PercentMin) : null;
  const vo2PercentMax =
    st.vo2PercentMax != null && st.vo2PercentMax !== '' ? Number(st.vo2PercentMax) : null;
  let intensityMode = normalizeIntensityMode(st.intensityMode);
  const intensityNote =
    typeof st.intensityNote === 'string' ? st.intensityNote.trim().slice(0, 500) : '';
  const cadenceRpm =
    st.cadenceRpm != null && st.cadenceRpm !== '' ? Number(st.cadenceRpm) : null;
  const garminStepType =
    typeof st.garminStepType === 'string' ? st.garminStepType.trim().toLowerCase().slice(0, 20) : '';

  const dm = durationMin != null && Number.isFinite(durationMin) ? durationMin : null;
  const dk = distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : null;
  const sk = speedKph != null && Number.isFinite(speedKph) ? speedKph : null;
  const zn = zone != null && Number.isFinite(zone) ? zone : null;
  const v2a = vo2PercentMin != null && Number.isFinite(vo2PercentMin) ? vo2PercentMin : null;
  const v2b = vo2PercentMax != null && Number.isFinite(vo2PercentMax) ? vo2PercentMax : null;
  const cad = cadenceRpm != null && Number.isFinite(cadenceRpm) ? cadenceRpm : null;

  if (intensityMode === 'open') {
    if (zn != null && zn >= 1 && zn <= 5) intensityMode = 'zone';
    else if (v2a != null || v2b != null) intensityMode = 'vo2_pct';
  }

  if (dm != null && (dm < 0 || dm > 600)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): duration must be 0–600 min.` };
  }
  if (dk != null && (dk < 0 || dk > 500)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): distance must be 0–500 km.` };
  }
  if (sk != null && (sk < 0 || sk > 90)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): speed must be 0–90 kph.` };
  }
  if (zn != null && (zn < 1 || zn > 5)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): zone must be 1–5.` };
  }
  if (cad != null && (cad < 0 || cad > 220)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): cadence must be 0–220 rpm.` };
  }
  if (v2a != null && (v2a < 40 || v2a > 130)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): VO2 % min must be 40–130.` };
  }
  if (v2b != null && (v2b < 40 || v2b > 130)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): VO2 % max must be 40–130.` };
  }

  if ((dm == null || dm === 0) && (dk == null || dk === 0)) {
    return {
      error: `${labelPrefix} step ${index + 1} (${role}): set duration (min) and/or distance (km).`,
    };
  }

  if (intensityMode === 'zone' && (zn == null || zn < 1 || zn > 5)) {
    return { error: `${labelPrefix} step ${index + 1} (${role}): pick zone 1–5 when intensity is Zone.` };
  }
  if (intensityMode === 'vo2_pct' && v2a == null && v2b == null) {
    return {
      error: `${labelPrefix} step ${index + 1} (${role}): set VO2 % min and/or max when intensity is %VO2.` };
  }

  let zoneBasis = normalizeZoneBasis(st.zoneBasis);
  if (intensityMode !== 'zone') {
    zoneBasis = 'hr';
  }

  const out = {
    label: label || `${labelPrefix} ${role}`,
    durationMin: dm,
    distanceKm: dk,
    paceMinPerKm,
    paceMaxMinPerKm,
    speedKph: sk,
    intensityMode,
    zone: zn,
    vo2PercentMin: v2a,
    vo2PercentMax: v2b,
    intensityNote,
    cadenceRpm: cad,
    garminStepType,
  };
  if (intensityMode === 'zone') {
    out.zoneBasis = zoneBasis;
  }
  return out;
}

function cleanSimpleStep(st, i, sport) {
  const out = cleanSegment(st, 'Block', i, 'main', sport);
  if (out.error) return out;
  return {
    kind: 'step',
    ...out,
  };
}

function cleanIntervalStep(st, i, sport) {
  const label = typeof st.label === 'string' ? st.label.trim().slice(0, 120) : `Intervals ${i + 1}`;
  const repsRaw = st.reps != null && st.reps !== '' ? Number(st.reps) : null;
  const reps = repsRaw != null && Number.isFinite(repsRaw) ? Math.round(repsRaw) : null;
  if (reps == null || reps < 1 || reps > 40) {
    return { error: `Interval block ${i + 1}: set repetitions between 1 and 40.` };
  }
  if (!st.work || typeof st.work !== 'object') {
    return { error: `Interval block ${i + 1}: missing work segment.` };
  }
  if (!st.rest || typeof st.rest !== 'object') {
    return { error: `Interval block ${i + 1}: missing rest segment.` };
  }
  const work = cleanSegment(st.work, `I${i + 1}`, i, 'work', sport);
  if (work.error) return work;
  const rest = cleanSegment(st.rest, `I${i + 1}`, i, 'rest', sport);
  if (rest.error) return rest;
  return {
    kind: 'interval',
    label: label || `Intervals ${i + 1}`,
    reps,
    work,
    rest,
  };
}

function cleanLadderStep(st, i, sport) {
  const label = typeof st.label === 'string' ? st.label.trim().slice(0, 120) : `Ladder ${i + 1}`;
  const rungsIn = Array.isArray(st.rungs) ? st.rungs : [];
  if (rungsIn.length < 1 || rungsIn.length > 20) {
    return { error: `Ladder block ${i + 1}: add 1–20 rungs (each rung = work + rest).` };
  }
  const rungs = [];
  for (let r = 0; r < rungsIn.length; r++) {
    const g = rungsIn[r];
    if (!g || typeof g !== 'object') {
      return { error: `Ladder block ${i + 1}, rung ${r + 1}: invalid rung.` };
    }
    const wk = cleanSegment(g.work || {}, `L${i + 1}R${r + 1}`, i, 'work', sport);
    if (wk.error) return wk;
    const rs = cleanSegment(g.rest || {}, `L${i + 1}R${r + 1}`, i, 'rest', sport);
    if (rs.error) return rs;
    rungs.push({ work: wk, rest: rs });
  }
  return {
    kind: 'ladder',
    label: label || `Ladder ${i + 1}`,
    rungs,
  };
}

function cleanRepeatSetStep(st, i, sport) {
  const label = typeof st.label === 'string' ? st.label.trim().slice(0, 120) : `Repeat ${i + 1}`;
  const repsRaw = st.reps != null && st.reps !== '' ? Number(st.reps) : null;
  const reps = repsRaw != null && Number.isFinite(repsRaw) ? Math.round(repsRaw) : null;
  if (reps == null || reps < 1 || reps > 40) {
    return { error: `Repeat block ${i + 1}: set repetitions between 1 and 40.` };
  }
  const segmentsIn = Array.isArray(st.segments) ? st.segments : [];
  if (segmentsIn.length < 2 || segmentsIn.length > 16) {
    return { error: `Repeat block ${i + 1}: add 2–16 segments in the pattern.` };
  }
  const segments = [];
  for (let s = 0; s < segmentsIn.length; s++) {
    const row = cleanSegment(segmentsIn[s] || {}, `R${i + 1}S${s + 1}`, i, `seg${s + 1}`, sport);
    if (row.error) return row;
    segments.push(row);
  }
  return {
    kind: 'repeat_set',
    label: label || `Repeat ${i + 1}`,
    reps,
    segments,
  };
}

function countFlattenedSteps(steps) {
  let n = 0;
  for (const st of steps || []) {
    if (st.kind === 'interval') n += (st.reps || 0) * 2;
    else if (st.kind === 'ladder' && Array.isArray(st.rungs)) n += st.rungs.length * 2;
    else if (st.kind === 'repeat_set' && Array.isArray(st.segments))
      n += (st.reps || 0) * st.segments.length;
    else n += 1;
  }
  return n;
}

function cleanStructureThresholds(body) {
  let thresholdPaceMinPerKm = '';
  if (typeof body.thresholdPaceMinPerKm === 'string') {
    thresholdPaceMinPerKm = body.thresholdPaceMinPerKm.trim().slice(0, 12);
  }
  let ftpWatts = null;
  if (body.ftpWatts != null && body.ftpWatts !== '') {
    const f = Number(body.ftpWatts);
    if (Number.isFinite(f) && f >= 30 && f <= 750) ftpWatts = Math.round(f);
  }
  return { thresholdPaceMinPerKm, ftpWatts };
}

export function validateEnduranceStructure(body) {
  if (!body || typeof body !== 'object') return { error: 'Structure must be an object.' };
  const sport = body.sport === 'bike' ? 'bike' : 'run';
  const steps = Array.isArray(body.steps) ? body.steps : [];
  if (steps.length === 0) return { error: 'Add at least one step.' };
  if (steps.length > 40) return { error: 'Too many blocks (max 40).' };

  const { thresholdPaceMinPerKm, ftpWatts } = cleanStructureThresholds(body);

  const cleaned = [];
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    const kind =
      st.kind === 'interval'
        ? 'interval'
        : st.kind === 'ladder'
          ? 'ladder'
          : st.kind === 'repeat_set'
            ? 'repeat_set'
            : 'step';
    if (kind === 'interval') {
      const row = cleanIntervalStep(st, i, sport);
      if (row.error) return row;
      cleaned.push(row);
    } else if (kind === 'ladder') {
      const row = cleanLadderStep(st, i, sport);
      if (row.error) return row;
      cleaned.push(row);
    } else if (kind === 'repeat_set') {
      const row = cleanRepeatSetStep(st, i, sport);
      if (row.error) return row;
      cleaned.push(row);
    } else {
      const row = cleanSimpleStep(st, i, sport);
      if (row.error) return row;
      cleaned.push(row);
    }
  }

  if (countFlattenedSteps(cleaned) > 100) {
    return { error: 'Workout is too long when expanded (max 100 work/rest segments for export).' };
  }

  const structure = { version: 3, sport, steps: cleaned };
  if (thresholdPaceMinPerKm) structure.thresholdPaceMinPerKm = thresholdPaceMinPerKm;
  if (ftpWatts != null) structure.ftpWatts = ftpWatts;
  return { structure };
}

export function stepDurationSeconds(step, sport) {
  const dm = step.durationMin;
  if (dm != null && dm > 0) return Math.round(dm * 60);
  const dist = step.distanceKm;
  if (dist != null && dist > 0) {
    if (sport === 'bike' && step.speedKph != null && step.speedKph > 0) {
      return Math.max(30, Math.round((dist / step.speedKph) * 3600));
    }
    const paceSec =
      parsePaceSecondsPerKm(step.paceMinPerKm) ||
      parsePaceSecondsPerKm(step.paceMaxMinPerKm) ||
      360;
    return Math.max(30, Math.round(dist * paceSec));
  }
  return 300;
}

/** Expand interval blocks into a flat list of segments (for Garmin, Strava totals, display). */
export function flattenWorkoutSteps(steps, sport) {
  const out = [];
  for (const st of steps || []) {
    if (st.kind === 'interval' && st.work && st.rest && st.reps) {
      for (let r = 1; r <= st.reps; r++) {
        out.push({
          ...st.work,
          label: `${st.label || 'Interval'} · work ${r}/${st.reps}`,
          garminStepType: st.work.garminStepType || 'work',
        });
        out.push({
          ...st.rest,
          label: `${st.label || 'Interval'} · rest ${r}/${st.reps}`,
          garminStepType: st.rest.garminStepType || 'recovery',
        });
      }
    } else if (st.kind === 'ladder' && Array.isArray(st.rungs)) {
      for (let r = 0; r < st.rungs.length; r++) {
        const g = st.rungs[r];
        out.push({
          ...g.work,
          label: `${st.label || 'Ladder'} · rung ${r + 1} work`,
          garminStepType: g.work.garminStepType || 'work',
        });
        out.push({
          ...g.rest,
          label: `${st.label || 'Ladder'} · rung ${r + 1} rest`,
          garminStepType: g.rest.garminStepType || 'recovery',
        });
      }
    } else if (st.kind === 'repeat_set' && Array.isArray(st.segments) && st.reps) {
      for (let rep = 1; rep <= st.reps; rep++) {
        for (let si = 0; si < st.segments.length; si++) {
          const seg = st.segments[si];
          out.push({
            ...seg,
            label: `${st.label || 'Repeat'} · rep ${rep}/${st.reps} · ${seg.label || `part ${si + 1}`}`,
            garminStepType: seg.garminStepType || (si === st.segments.length - 1 ? 'recovery' : 'work'),
          });
        }
      }
    } else {
      out.push({ ...st, kind: undefined });
    }
  }
  return out.map((s) => {
    const { kind: _k, ...rest } = s;
    void _k;
    return rest;
  });
}

export function totalSecondsFromStructure(structure) {
  if (!structure?.steps?.length) return null;
  const flat = flattenWorkoutSteps(structure.steps, structure.sport);
  let sum = 0;
  for (const st of flat) {
    sum += stepDurationSeconds(st, structure.sport);
  }
  return Math.max(60, Math.round(sum));
}

export function totalMetersFromStructure(structure) {
  if (!structure?.steps?.length) return null;
  const flat = flattenWorkoutSteps(structure.steps, structure.sport);
  let m = 0;
  for (const st of flat) {
    const dk = st.distanceKm != null ? Number(st.distanceKm) : 0;
    if (dk > 0) m += dk * 1000;
  }
  return m > 0 ? Math.round(m) : null;
}

function garminStepTypeKey(step, index, total) {
  const g = step.garminStepType;
  if (g === 'warmup' || g === 'warm_up') return 'warmup';
  if (g === 'cooldown' || g === 'cool_down') return 'cooldown';
  if (g === 'recovery') return 'recovery';
  if (g === 'work') return 'work';
  if (index === 0) return 'warmup';
  if (index === total - 1) return 'cooldown';
  return 'work';
}

function segmentToGarminTargets(step, structure) {
  const mode = normalizeIntensityMode(step.intensityMode);
  const sport = structure.sport === 'bike' ? 'bike' : 'run';

  if (mode === 'zone' && step.zone != null && step.zone >= 1 && step.zone <= 5) {
    const zb = normalizeZoneBasis(step.zoneBasis);
    if (zb === 'hr') {
      const { low, high } = hrBandFromZone(step.zone);
      return { target_type: 'HEART_RATE', target_low: low, target_high: high };
    }
    if (zb === 'pace') {
      const zn = Math.min(5, Math.max(1, Math.round(Number(step.zone))));
      if (sport === 'run') {
        const thSec = parsePaceSecondsPerKm(structure.thresholdPaceMinPerKm);
        const f = ZONE_PACE_SPEED_FACTOR[zn] || 1;
        if (thSec && thSec > 0) {
          const mpsMid = (1000 / thSec) * f;
          const band = 0.04;
          return {
            target_type: 'PACE',
            target_low: Math.round(mpsMid * (1 - band) * 100) / 100,
            target_high: Math.round(mpsMid * (1 + band) * 100) / 100,
          };
        }
        const { low, high } = hrBandFromZone(step.zone);
        return { target_type: 'HEART_RATE', target_low: low, target_high: high };
      }
      const kph = ZONE_BIKE_KPH_MID[zn] || 28;
      const mps = (kph * 1000) / 3600;
      return {
        target_type: 'SPEED',
        target_low: Math.round(mps * 0.95 * 100) / 100,
        target_high: Math.round(mps * 1.05 * 100) / 100,
      };
    }
    if (zb === 'power') {
      const ftp = Number(structure.ftpWatts) || (sport === 'bike' ? 200 : 0);
      if (ftp >= 40) {
        const znPw = Math.min(5, Math.max(1, Math.round(Number(step.zone))));
        const pct = ZONE_POWER_PCT_MID[znPw] || 0.85;
        const wMid = ftp * pct;
        const spread = Math.max(10, Math.round(wMid * 0.08));
        const w = Math.round(wMid);
        return {
          target_type: 'POWER',
          target_low: Math.max(10, w - spread),
          target_high: w + spread,
        };
      }
      const { low, high } = hrBandFromZone(step.zone);
      return { target_type: 'HEART_RATE', target_low: low, target_high: high };
    }
  }

  if (mode === 'vo2_pct') {
    const lo = step.vo2PercentMin ?? step.vo2PercentMax;
    const hi = step.vo2PercentMax ?? step.vo2PercentMin;
    const { low, high } = hrBandFromVo2Percent(lo, hi);
    return { target_type: 'HEART_RATE', target_low: low, target_high: high };
  }

  if (structure.sport === 'bike' && step.speedKph != null && step.speedKph > 0) {
    const mps = (step.speedKph * 1000) / 3600;
    const v = Math.round(mps * 100) / 100;
    return { target_type: 'SPEED', target_low: v, target_high: v };
  }

  const fastSec = parsePaceSecondsPerKm(step.paceMinPerKm);
  const slowSec = parsePaceSecondsPerKm(step.paceMaxMinPerKm || step.paceMinPerKm);
  if (fastSec != null && fastSec > 0) {
    const mpsFast = 1000 / fastSec;
    const mpsSlow = slowSec != null && slowSec > 0 ? 1000 / slowSec : mpsFast;
    const lo = Math.round(Math.min(mpsFast, mpsSlow) * 100) / 100;
    const hi = Math.round(Math.max(mpsFast, mpsSlow) * 100) / 100;
    return { target_type: 'PACE', target_low: lo, target_high: hi };
  }

  return { target_type: 'OPEN', target_low: 0, target_high: 0 };
}

/**
 * Maps ForgeFit structure to the shape expected by `pushWorkoutToGarmin`.
 */
export function structureToGarminWorkout(structure, title) {
  const sport = structure.sport === 'bike' ? 'cycling' : 'running';
  const stepsIn = flattenWorkoutSteps(structure.steps || [], structure.sport);
  const steps = [];
  const displayTitle =
    typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : 'ForgeFit workout';

  stepsIn.forEach((step, index) => {
    const duration_value = stepDurationSeconds(step, structure.sport);
    const type = garminStepTypeKey(step, index, stepsIn.length);
    const { target_type, target_low, target_high } = segmentToGarminTargets(step, structure);

    steps.push({
      type,
      duration_type: 'TIME',
      duration_value,
      target_type,
      target_low,
      target_high,
    });
  });

  return {
    title: displayTitle,
    sport,
    steps,
  };
}

/** Intensity factor proxy per segment (planned load / chart colour). */
export function estimateSegmentIF(seg, structure) {
  const sport = structure.sport === 'bike' ? 'bike' : 'run';
  const mode = normalizeIntensityMode(seg.intensityMode);
  if (mode === 'zone' && seg.zone != null && seg.zone >= 1 && seg.zone <= 5) {
    const z = Math.min(5, Math.max(1, Math.round(Number(seg.zone))));
    return ZONE_IF[z] || 0.8;
  }
  if (mode === 'vo2_pct') {
    const lo = seg.vo2PercentMin ?? seg.vo2PercentMax ?? 75;
    const hi = seg.vo2PercentMax ?? seg.vo2PercentMin ?? lo;
    const mid = (Number(lo) + Number(hi)) / 2;
    if (Number.isFinite(mid)) {
      return Math.min(1.12, Math.max(0.55, (mid / 100) * 1.05));
    }
  }
  const thSec = parsePaceSecondsPerKm(structure.thresholdPaceMinPerKm);
  const pLo = parsePaceSecondsPerKm(seg.paceMinPerKm);
  const pHi = parsePaceSecondsPerKm(seg.paceMaxMinPerKm || seg.paceMinPerKm);
  if (thSec && thSec > 0 && sport === 'run') {
    const paceSec = pLo || pHi;
    if (paceSec && paceSec > 0) {
      const ratio = paceSec / thSec;
      return Math.min(1.1, Math.max(0.55, 1.05 - (ratio - 1) * 0.4));
    }
  }
  if (sport === 'bike' && seg.speedKph != null && seg.speedKph > 0) {
    return Math.min(1.08, Math.max(0.55, seg.speedKph / 30));
  }
  return 0.78;
}

/** Planned duration, distance, Banister-style TSS from segment IF×time. */
export function computePlannedLoad(structure) {
  if (!structure?.steps?.length) return null;
  const sport = structure.sport === 'bike' ? 'bike' : 'run';
  const flat = flattenWorkoutSteps(structure.steps, sport);
  let durationSec = 0;
  let distanceM = 0;
  let weightedIf = 0;
  let wDen = 0;
  for (const seg of flat) {
    const sec = stepDurationSeconds(seg, sport);
    durationSec += sec;
    const dk = seg.distanceKm != null ? Number(seg.distanceKm) : 0;
    if (dk > 0) distanceM += dk * 1000;
    const ifv = estimateSegmentIF(seg, structure);
    weightedIf += ifv * sec;
    wDen += sec;
  }
  const intensityFactor =
    wDen > 0 ? Math.round((weightedIf / wDen) * 1000) / 1000 : null;
  const hours = durationSec / 3600;
  const tss =
    intensityFactor != null
      ? Math.round(hours * intensityFactor * intensityFactor * 100)
      : null;
  return {
    durationSec,
    distanceM: distanceM > 0 ? Math.round(distanceM) : null,
    tss,
    intensityFactor,
  };
}

/** Compare logged completion to plan (per dimension + overall). */
export function summarizeCompliance(planned, completed) {
  if (!planned || !completed || typeof completed !== 'object') return null;
  const dims = [];
  function pushDim(key, label, act, plan) {
    if (plan == null || plan <= 0 || act == null || !Number.isFinite(Number(act))) return;
    const pct = Math.min(150, (Number(act) / Number(plan)) * 100);
    dims.push({ key, label, percent: Math.round(pct) });
  }
  pushDim('durationSec', 'Duration', completed.durationSec, planned.durationSec);
  pushDim('distanceM', 'Distance', completed.distanceM, planned.distanceM);
  pushDim('tss', 'TSS', completed.tss, planned.tss);
  pushDim('intensityFactor', 'IF', completed.intensityFactor, planned.intensityFactor);
  if (!dims.length) return null;
  const overallPercent = Math.round(
    dims.reduce((a, d) => a + Math.min(100, d.percent), 0) / dims.length
  );
  return { overallPercent, dimensions: dims };
}

/**
 * Visual workout-flow bucket for charts (warmup / main work / recovery / rest / cooldown).
 * Uses garminStepType when set, else label heuristics, else position + intensity.
 */
export function classifyWorkoutFlowSegment(seg, index, totalLen, structure) {
  const g = String(seg.garminStepType || '')
    .toLowerCase()
    .trim();
  if (g === 'warmup' || g === 'warm_up') {
    return { flowPhase: 'warmup', flowHue: 102, roleLabel: 'Warm up' };
  }
  if (g === 'cooldown' || g === 'cool_down') {
    return { flowPhase: 'cooldown', flowHue: 212, roleLabel: 'Cool down' };
  }
  if (g === 'rest') {
    return { flowPhase: 'rest', flowHue: 235, roleLabel: 'Rest' };
  }
  if (g === 'recovery') {
    return { flowPhase: 'recovery', flowHue: 158, roleLabel: 'Recovery' };
  }
  if (g === 'work') {
    return { flowPhase: 'active', flowHue: 26, roleLabel: 'Work / active' };
  }

  const lab = String(seg.label || '').toLowerCase();
  if (/\b(warm|w-up|wu\b)/.test(lab)) {
    return { flowPhase: 'warmup', flowHue: 102, roleLabel: 'Warm up' };
  }
  if (/\b(cool|cd\b|cooldown)/.test(lab)) {
    return { flowPhase: 'cooldown', flowHue: 212, roleLabel: 'Cool down' };
  }
  if (/\brest\b/.test(lab) && !/interval|rep /.test(lab)) {
    return { flowPhase: 'rest', flowHue: 235, roleLabel: 'Rest' };
  }
  if (/\b(recover|easy|jog|float|walk)\b/.test(lab)) {
    return { flowPhase: 'recovery', flowHue: 158, roleLabel: 'Recovery' };
  }
  if (/· rest |rest \d|· recovery/.test(lab)) {
    return { flowPhase: 'recovery', flowHue: 158, roleLabel: 'Recovery' };
  }
  if (/· work |work \d/.test(lab)) {
    return { flowPhase: 'active', flowHue: 26, roleLabel: 'Work / active' };
  }

  const ifProxy = estimateSegmentIF(seg, structure);
  if (index === 0 && ifProxy < 0.72) {
    return { flowPhase: 'warmup', flowHue: 102, roleLabel: 'Warm up' };
  }
  if (index === totalLen - 1 && ifProxy < 0.78) {
    return { flowPhase: 'cooldown', flowHue: 212, roleLabel: 'Cool down' };
  }
  return { flowPhase: 'active', flowHue: 26, roleLabel: 'Work / active' };
}

/** Relative widths and intensity for a stacked phase bar (UI). */
export function buildPhaseChartBars(structure) {
  if (!structure?.steps?.length) return [];
  const sport = structure.sport === 'bike' ? 'bike' : 'run';
  const flat = flattenWorkoutSteps(structure.steps, sport);
  const totalSec =
    flat.reduce((s, seg) => s + stepDurationSeconds(seg, sport), 0) || 1;
  let order = 0;
  const n = flat.length;
  return flat.map((seg, idx) => {
    const sec = stepDurationSeconds(seg, sport);
    const ifProxy = estimateSegmentIF(seg, structure);
    const intensity01 = Math.min(1, Math.max(0, (ifProxy - 0.55) / 0.52));
    const hue = Math.round(210 - intensity01 * 165);
    const flow = classifyWorkoutFlowSegment(seg, idx, n, structure);
    const barHeightPct = Math.round(42 + intensity01 * 58);
    return {
      widthPct: (sec / totalSec) * 100,
      durationSec: sec,
      intensity01,
      ifProxy,
      hue: Math.min(45, Math.max(175, hue)),
      label: seg.label || '',
      order: order++,
      flowPhase: flow.flowPhase,
      flowHue: flow.flowHue,
      roleLabel: flow.roleLabel,
      barHeightPct,
    };
  });
}
