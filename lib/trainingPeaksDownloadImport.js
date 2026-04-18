/**
 * Parse workouts exported / downloaded from TrainingPeaks (Quick View → Export):
 * .zwo (Zwift XML), .mrc / .erg (cycling text), or JSON (same as paste import).
 * Binary .fit is not supported — ask user to export .zwo or paste JSON.
 */

import { parseTrainingPeaksWorkout } from '@/lib/trainingPeaksImport';

const MAX_CHARS = 900_000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseXmlAttrs(attrStr) {
  const o = {};
  if (!attrStr || typeof attrStr !== 'string') return o;
  const re = /([\w:-]+)="([^"]*)"/g;
  let m;
  while ((m = re.exec(attrStr))) {
    o[m[1]] = m[2].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  }
  return o;
}

/** Map fractional FTP (0–1+) to Coggan-style power zone 1–5. */
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

function stepFromPowerDuration(label, durationSec, ftpFrac, opts = {}) {
  const dm = Math.max(0.05, durationSec / 60);
  const f = midFtpFraction(opts.powerLow, opts.powerHigh, ftpFrac);
  const zone = f != null ? zoneFromFtpFraction(f) : 3;
  const noteParts = [];
  if (f != null) noteParts.push(`~${Math.round(f * 100)}% FTP (ZWO)`);
  if (opts.extraNote) noteParts.push(opts.extraNote);
  const cad = num(opts.cadence);
  return {
    label,
    durationMin: dm,
    distanceKm: null,
    paceMinPerKm: '',
    paceMaxMinPerKm: '',
    intensityMode: 'zone',
    zoneBasis: 'power',
    zone,
    intensityNote: noteParts.join(' · ').slice(0, 500),
    cadenceRpm: cad != null && cad > 0 ? Math.round(cad) : null,
    garminStepType: '',
  };
}

function stepFromRunSpeed(label, durationSec, speedMps, cadence) {
  const dm = Math.max(0.05, durationSec / 60);
  const kph = speedMps != null && Number.isFinite(speedMps) ? speedMps * 3.6 : null;
  const note =
    kph != null ? `ZWO speed ${(speedMps * 3.6).toFixed(2)} kph (from TP export)` : 'ZWO run step';
  const cad = num(cadence);
  return {
    label,
    durationMin: dm,
    distanceKm: null,
    paceMinPerKm: '',
    paceMaxMinPerKm: '',
    intensityMode: kph != null ? 'open' : 'zone',
    zoneBasis: 'pace',
    zone: kph != null ? null : 3,
    speedKph: kph,
    intensityNote: note.slice(0, 500),
    cadenceRpm: cad != null && cad > 0 ? Math.round(cad) : null,
    garminStepType: '',
  };
}

function parseFtpFromHeader(block) {
  const m = String(block).match(/FTP\s*=\s*([\d.]+)/i);
  const v = m ? num(m[1]) : null;
  if (v != null && v >= 30 && v <= 750) return Math.round(v);
  return null;
}

/**
 * Zwift / TrainingPeaks .zwo — sequential tags inside <workout>...</workout>.
 * @returns {{ title: string, workoutType: string, steps: object[], ftpWatts?: number|null } | { error: string }}
 */
export function parseTrainingPeaksZwo(xml) {
  const s = String(xml).trim();
  if (!s.includes('<') || !s.toLowerCase().includes('workout')) {
    return { error: 'Not a Zwift workout (.zwo) XML file.' };
  }

  const titleMatch = s.match(/<name>([^<]*)<\/name>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  const sportMatch = s.match(/<sportType>([^<]+)<\/sportType>/i);
  const sportRaw = sportMatch ? sportMatch[1].trim().toLowerCase() : 'bike';
  const workoutType = /run|walk/i.test(sportRaw) ? 'run' : 'bike';

  const wm = s.match(/<workout[^>]*>([\s\S]*?)<\/workout>/i);
  if (!wm) {
    return { error: 'Missing <workout> block in .zwo file.' };
  }
  const inner = wm[1];
  const steps = [];
  const tagRe = /<([A-Za-z][A-Za-z0-9]*)\s+([^/>]*?)\s*\/>/g;
  let m;
  let idx = 0;

  while ((m = tagRe.exec(inner))) {
    const tag = m[1];
    const attrs = parseXmlAttrs(m[2]);
    const dur = num(attrs.Duration);
    const durationSec = dur != null && dur > 0 ? dur : null;

    const t = tag.toLowerCase();
    if (t === 'textevent') continue;

    const speedMps = num(attrs.Speed);

    if (t === 'intervalst' || t === 'intervals') {
      const reps = Math.min(40, Math.max(1, Math.round(num(attrs.Repeat) || 1)));
      const onDur = num(attrs.OnDuration) || num(attrs.onDuration);
      const offDur = num(attrs.OffDuration) || num(attrs.offDuration);
      if (!onDur || !offDur || onDur <= 0 || offDur <= 0) {
        return { error: `ZWO ${tag}: missing OnDuration/OffDuration.` };
      }
      const onPow = midFtpFraction(attrs.OnPowerLow, attrs.OnPowerHigh, attrs.OnPower);
      const offPow = midFtpFraction(attrs.OffPowerLow, attrs.OffPowerHigh, attrs.OffPower);
      const work = stepFromPowerDuration(`Work ${idx + 1}`, onDur, onPow, {
        powerLow: attrs.OnPowerLow,
        powerHigh: attrs.OnPowerHigh,
        cadence: attrs.Cadence,
      });
      const rest = stepFromPowerDuration(`Recovery ${idx + 1}`, offDur, offPow ?? 0.55, {
        powerLow: attrs.OffPowerLow,
        powerHigh: attrs.OffPowerHigh,
        cadence: attrs.CadenceResting,
        extraNote: 'recovery',
      });
      steps.push({
        kind: 'interval',
        label: `Intervals (${reps}×)`,
        reps,
        work,
        rest,
      });
      idx++;
      continue;
    }

    if (durationSec == null) {
      if (t === 'freeride' || t === 'maxeffort') {
        const fallback = t === 'maxeffort' ? 30 : 120;
        const sec = num(attrs.Duration) || fallback;
        if (t === 'maxeffort') {
          steps.push({
            kind: 'step',
            ...stepFromPowerDuration(tag, sec, 1.15, { extraNote: 'max effort (ZWO)' }),
          });
        } else {
          steps.push({
            kind: 'step',
            label: 'Free ride',
            durationMin: Math.max(0.05, sec / 60),
            distanceKm: null,
            paceMinPerKm: '',
            paceMaxMinPerKm: '',
            intensityMode: 'open',
            zone: null,
            intensityNote: 'ZWO FreeRide — set intensity manually if needed.',
            cadenceRpm: null,
            garminStepType: '',
          });
        }
        idx++;
      }
      continue;
    }

    if (t === 'steadystate') {
      if (workoutType === 'run' && speedMps != null) {
        steps.push({ kind: 'step', ...stepFromRunSpeed(`Steady ${idx + 1}`, durationSec, speedMps, attrs.Cadence) });
      } else {
        const pow = midFtpFraction(attrs.PowerLow, attrs.PowerHigh, attrs.Power);
        steps.push({
          kind: 'step',
          ...stepFromPowerDuration(`Steady ${idx + 1}`, durationSec, pow, {
            powerLow: attrs.PowerLow,
            powerHigh: attrs.PowerHigh,
            cadence: attrs.Cadence,
          }),
        });
      }
      idx++;
      continue;
    }

    if (t === 'warmup' || t === 'cooldown' || t === 'ramp') {
      const pow = midFtpFraction(attrs.PowerLow, attrs.PowerHigh, attrs.Power);
      steps.push({
        kind: 'step',
        ...stepFromPowerDuration(
          t === 'warmup' ? 'Warm up' : t === 'cooldown' ? 'Cool down' : 'Ramp',
          durationSec,
          pow,
          {
            powerLow: attrs.PowerLow,
            powerHigh: attrs.PowerHigh,
            cadence: attrs.Cadence,
            extraNote: attrs.PowerLow && attrs.PowerHigh ? 'ramp / range' : '',
          },
        ),
      });
      idx++;
      continue;
    }

    if (t === 'freeride') {
      steps.push({
        kind: 'step',
        label: 'Free ride',
        durationMin: durationSec / 60,
        distanceKm: null,
        paceMinPerKm: '',
        paceMaxMinPerKm: '',
        intensityMode: 'open',
        zone: null,
        intensityNote: 'ZWO FreeRide',
        cadenceRpm: num(attrs.Cadence),
        garminStepType: '',
      });
      idx++;
      continue;
    }

    if (t === 'maxeffort') {
      steps.push({
        kind: 'step',
        ...stepFromPowerDuration('Max effort', durationSec, 1.12, { extraNote: 'ZWO MaxEffort' }),
      });
      idx++;
      continue;
    }

    if (t === 'recover' || t === 'rest') {
      steps.push({
        kind: 'step',
        ...stepFromPowerDuration('Recovery', durationSec, midFtpFraction(attrs.PowerLow, attrs.PowerHigh, attrs.Power) ?? 0.5, {
          cadence: attrs.Cadence,
          extraNote: 'recovery',
        }),
      });
      idx++;
      continue;
    }
  }

  if (!steps.length) {
    return {
      error:
        'No supported ZWO steps found. Export from TrainingPeaks (Quick View → Export → .zwo) and ensure the file contains <workout> steps.',
    };
  }

  if (steps.length > 40) {
    return {
      error: `This .zwo maps to ${steps.length} blocks (max 40). Simplify the workout in TrainingPeaks or split into two imports.`,
    };
  }

  return { title, workoutType, steps, ftpWatts: null };
}

/**
 * Parse .mrc (minutes + %FTP) or .erg (seconds + watts) text exports.
 */
function mergeAdjacentSameLoad(segments) {
  const out = [];
  for (const seg of segments) {
    const prev = out[out.length - 1];
    if (prev && prev.key === seg.key) prev.sec += seg.sec;
    else out.push({ ...seg });
  }
  return out;
}

export function parseTrainingPeaksMrcErg(text, fileName) {
  const lower = String(fileName || '').toLowerCase();
  const isErg = lower.endsWith('.erg');
  const raw = String(text).replace(/\r\n/g, '\n');
  const dataIdx = (() => {
    const m = raw.search(/\[\s*COURSE\s+DATA\s*\]/i);
    if (m >= 0) return m;
    const m2 = raw.search(/\[\s*MAIN\s+COURSE\s*\]/i);
    if (m2 >= 0) return m2;
    const m3 = raw.search(/\[\s*END\s+COURSE\s+HEADER\s*\]/i);
    if (m3 >= 0) return m3 + raw.slice(m3).split('\n')[0].length;
    return -1;
  })();

  const header = dataIdx >= 0 ? raw.slice(0, dataIdx) : raw;
  const ftpWatts = parseFtpFromHeader(header);

  const dataPart = dataIdx >= 0 ? raw.slice(dataIdx) : raw;

  const lines = dataPart.split('\n');
  const points = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('[') || t.startsWith('#')) continue;
    const parts = t.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) continue;
    const a = num(parts[0]);
    const b = num(parts[1]);
    if (a == null || b == null) continue;
    points.push({ x: a, y: b });
  }

  if (points.length < 2) {
    return { error: 'Could not read interval rows from .mrc/.erg file. Check TrainingPeaks export format.' };
  }

  points.sort((p, q) => p.x - q.x);

  const rawSegs = [];
  if (isErg) {
    if (!ftpWatts) {
      return { error: '.erg file needs FTP= in [COURSE HEADER] to map watts to zones.' };
    }
    for (let i = 0; i < points.length - 1; i++) {
      const t0 = points[i].x;
      const t1 = points[i + 1].x;
      const watts = points[i].y;
      const sec = t1 - t0;
      if (sec <= 0) continue;
      rawSegs.push({
        sec,
        key: `w${Math.round(watts)}`,
        watts,
        frac: watts / ftpWatts,
      });
    }
  } else {
    for (let i = 0; i < points.length - 1; i++) {
      const min0 = points[i].x;
      const min1 = points[i + 1].x;
      const pct = points[i].y;
      const sec = (min1 - min0) * 60;
      if (sec <= 0) continue;
      rawSegs.push({
        sec,
        key: `p${Math.round(pct)}`,
        pct,
        frac: pct / 100,
      });
    }
  }

  const merged = mergeAdjacentSameLoad(rawSegs);
  const steps = merged.map((seg, i) => {
    if (isErg) {
      return {
        kind: 'step',
        ...stepFromPowerDuration(`ERG block ${i + 1}`, seg.sec, seg.frac, {
          extraNote: `${Math.round(seg.watts)} W`,
        }),
      };
    }
    return {
      kind: 'step',
      ...stepFromPowerDuration(`MRC block ${i + 1}`, seg.sec, seg.frac, {
        extraNote: `${Math.round(seg.pct)}% FTP`,
      }),
    };
  });

  if (!steps.length) return { error: 'No segments parsed from .mrc/.erg file.' };
  if (steps.length > 40) {
    return {
      error: `Merged .${isErg ? 'erg' : 'mrc'} still has ${steps.length} blocks (max 40). Shorten the workout or import .zwo instead.`,
    };
  }
  return { title: '', workoutType: 'bike', steps, ftpWatts: ftpWatts || null };
}

function looksLikeJson(t) {
  const s = t.trim();
  return (s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'));
}

function looksLikeZwo(t) {
  const l = t.slice(0, 8000).toLowerCase();
  return l.includes('<workout_file') || (l.includes('<workout') && l.includes('sporttype'));
}

function looksLikeMrcErg(t) {
  return /\[COURSE HEADER\]/i.test(t) && (/MINUTES|PERCENT|COURSE DATA/i.test(t) || /\.erg/i.test(t));
}

function isLikelyBinaryFit(fileName, text) {
  if (!/\.fit$/i.test(fileName)) return false;
  let bad = 0;
  const sample = text.slice(0, 2000);
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0 || (c < 9 && c !== 9 && c !== 10 && c !== 13)) bad++;
  }
  return bad > 3;
}

/**
 * @param {string} fileName
 * @param {string} utf8Text
 * @returns {{ title: string, workoutType: string|null, steps: object[], ftpWatts?: number|null } | { error: string }}
 */
export function parseTrainingPeaksDownloadedFile(fileName, utf8Text) {
  const name = String(fileName || 'export');
  let text = String(utf8Text || '');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.length > MAX_CHARS) {
    return { error: `File too large (max ${MAX_CHARS} characters).` };
  }

  if (isLikelyBinaryFit(name, text)) {
    return {
      error:
        'This looks like a binary .fit file. ForgeFit cannot read .fit here. In TrainingPeaks, open the workout on the calendar → Quick View → Export → choose .zwo (or .mrc/.erg for power indoor), or paste JSON from the TP API / export tool.',
    };
  }

  const lower = name.toLowerCase();
  if (lower.endsWith('.fit.gz') || (lower.endsWith('.gz') && lower.includes('fit'))) {
    return {
      error:
        'Binary .fit.gz cannot be read as text. Use Import file on an up-to-date CardioFit page (binary upload), or export .zwo / paste JSON instead.',
    };
  }
  if (lower.endsWith('.fit')) {
    return {
      error:
        'Binary .fit must upload through the file picker as binary (not drag-paste as text). Export .zwo from TrainingPeaks, or paste JSON, or use a current portal build for .fit / .fit.gz.',
    };
  }

  if (lower.endsWith('.zwo')) {
    return parseTrainingPeaksZwo(text);
  }

  if (lower.endsWith('.mrc') || lower.endsWith('.erg')) {
    return parseTrainingPeaksMrcErg(text, name);
  }

  if (lower.endsWith('.json')) {
    const j = parseTrainingPeaksWorkout(text);
    if (j.error) return j;
    return { ...j, ftpWatts: null };
  }

  if (looksLikeJson(text)) {
    const j = parseTrainingPeaksWorkout(text);
    if (!j.error) return { ...j, ftpWatts: null };
  }

  if (lower.endsWith('.xml') || looksLikeZwo(text)) {
    const z = parseTrainingPeaksZwo(text);
    if (!z.error) return z;
    if (lower.endsWith('.xml')) return z;
  }

  if (looksLikeMrcErg(text)) {
    const e = parseTrainingPeaksMrcErg(text, name);
    if (!e.error) return e;
  }

  if (looksLikeJson(text)) {
    const j = parseTrainingPeaksWorkout(text);
    if (!j.error) return { ...j, ftpWatts: null };
    return j;
  }

  return {
    error:
      'Unrecognized file. Supported: TrainingPeaks export .zwo, .mrc, .erg, or JSON (plan with Structure). See CardioFit help text for Export → .zwo.',
  };
}
