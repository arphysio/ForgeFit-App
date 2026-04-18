import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import {
  computeTrainingPacesFromRace,
  parseRaceClockToSeconds,
} from '@/lib/raceBasedTrainingPaces';

const DIST_PRESETS = {
  mile: 1.609344,
  '3k': 3,
  '5k': 5,
  '8k': 8,
  '10k': 10,
  '15k': 15,
  half_marathon: 21.0975,
  '30k': 30,
  marathon: 42.195,
};

/** POST — McMillan-style zone paces from a recent race (clinician portal). */
export async function POST(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const preset = typeof body.distancePreset === 'string' ? body.distancePreset.trim() : '';
  let distanceKm =
    body.distanceKm != null && body.distanceKm !== ''
      ? Number(body.distanceKm)
      : preset && DIST_PRESETS[preset] != null
        ? DIST_PRESETS[preset]
        : NaN;

  if (!Number.isFinite(distanceKm)) {
    return NextResponse.json(
      { error: 'Set distanceKm (number) or a known distancePreset (mile, 3k, 5k, 8k, 10k, 15k, half_marathon, 30k, marathon).' },
      { status: 400 }
    );
  }

  let timeSeconds =
    body.timeSeconds != null && body.timeSeconds !== '' ? Number(body.timeSeconds) : NaN;
  if (!Number.isFinite(timeSeconds) && typeof body.time === 'string') {
    timeSeconds = parseRaceClockToSeconds(body.time);
  }
  if (!Number.isFinite(timeSeconds)) {
    return NextResponse.json(
      { error: 'Provide timeSeconds (number) or time string like 42:30 or 1:12:03.' },
      { status: 400 }
    );
  }

  let targetDistanceKm = null;
  if (body.targetDistanceKm != null && body.targetDistanceKm !== '') {
    targetDistanceKm = Number(body.targetDistanceKm);
  } else if (typeof body.targetPreset === 'string' && DIST_PRESETS[body.targetPreset.trim()]) {
    targetDistanceKm = DIST_PRESETS[body.targetPreset.trim()];
  }

  const perfRaw =
    typeof body.performanceBasis === 'string'
      ? body.performanceBasis.trim().toLowerCase()
      : typeof body.basis === 'string'
        ? body.basis.trim().toLowerCase()
        : '';
  const performanceBasis =
    perfRaw === 'goal' || perfRaw === 'goal_event' ? 'goal_event' : 'recent_race';

  const out = computeTrainingPacesFromRace({
    distanceKm,
    timeSeconds,
    targetDistanceKm: Number.isFinite(targetDistanceKm) ? targetDistanceKm : null,
    performanceBasis,
  });

  if (out.error) {
    return NextResponse.json({ error: out.error }, { status: 400 });
  }

  return NextResponse.json(out);
}
