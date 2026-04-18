import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { assertClinicianPortalRequest } from '@/lib/portalAuth';
import { parseTrainingPeaksWorkout } from '@/lib/trainingPeaksImport';
import { parseTrainingPeaksDownloadedFile } from '@/lib/trainingPeaksDownloadImport';
import { validateEnduranceStructure } from '@/lib/enduranceWorkout';
import { decodeFitUploadBuffer } from '@/lib/fitUploadDecode';
import { parseFitWorkoutBufferToEndurance } from '@/lib/fitWorkoutToEndurance';

const MAX_BASE64_BYTES = 4_500_000;

function workoutTypeToSport(workoutType) {
  const w = String(workoutType || '').toLowerCase();
  if (w.includes('bike') || w === 'mtb' || w.includes('cycl') || w === 'ebikeride') return 'bike';
  return 'run';
}

/** POST — parse pasted TrainingPeaks plan / Structure JSON into ForgeFit endurance structure. */
export async function POST(req) {
  const denied = assertClinicianPortalRequest(req);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const fileText = typeof body.fileText === 'string' ? body.fileText : null;
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const fileBase64Raw = typeof body.fileBase64 === 'string' ? body.fileBase64.trim() : '';

  let parsed;
  if (fileBase64Raw) {
    const comma = fileBase64Raw.indexOf(',');
    const b64 =
      fileBase64Raw.startsWith('data:') && comma !== -1
        ? fileBase64Raw.slice(comma + 1).trim()
        : fileBase64Raw.replace(/\s/g, '');
    let buf;
    try {
      buf = Buffer.from(b64, 'base64');
    } catch {
      return NextResponse.json({ error: 'Invalid base64 file payload.' }, { status: 400 });
    }
    if (!buf.length) {
      return NextResponse.json({ error: 'Empty file upload.' }, { status: 400 });
    }
    if (buf.length > MAX_BASE64_BYTES) {
      return NextResponse.json(
        { error: `File too large after decode (max ${MAX_BASE64_BYTES} bytes).` },
        { status: 400 }
      );
    }
    const decoded = decodeFitUploadBuffer(buf);
    if (decoded.error) {
      return NextResponse.json({ error: decoded.error }, { status: 400 });
    }
    parsed = parseFitWorkoutBufferToEndurance(decoded);
  } else if (fileText != null && fileText.trim()) {
    parsed = parseTrainingPeaksDownloadedFile(fileName || 'workout.zwo', fileText);
  } else {
    const raw = body.raw != null ? body.raw : body.payload != null ? body.payload : body;
    parsed = parseTrainingPeaksWorkout(raw);
  }

  if (parsed.error) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const sport = body.sport === 'bike' || body.sport === 'run' ? body.sport : workoutTypeToSport(parsed.workoutType);
  const title =
    typeof body.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 500)
      : parsed.title || 'Imported workout';

  const v = validateEnduranceStructure({
    version: 1,
    sport,
    steps: parsed.steps,
    ftpWatts: parsed.ftpWatts,
    thresholdPaceMinPerKm:
      typeof body.thresholdPaceMinPerKm === 'string' ? body.thresholdPaceMinPerKm : undefined,
  });
  if (v.error) {
    return NextResponse.json({ error: v.error }, { status: 400 });
  }

  return NextResponse.json({
    title,
    sport: v.structure.sport,
    structure: v.structure,
  });
}
