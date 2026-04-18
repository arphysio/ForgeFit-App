import Anthropic from '@anthropic-ai/sdk';
import { parseWorkoutFromModelText } from '@/lib/parseWorkoutJson';
import { parseProgramFromModelText } from '@/lib/parseProgramJson';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function clipText(v, max) {
  const s = String(v ?? '')
    .replace(/\r\n/g, '\n')
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

export async function POST(req) {
  try {
    const {
      sessionType,
      duration,
      bodyAreas,
      intensity,
      equipment,
      recoveryScore,
      painFlags = [],
      userHistory = [],
      programWeeks: programWeeksRaw,
      programDays: programDaysRaw,
      phaseCount: phaseCountRaw,
      clinicalNotes: clinicalNotesRaw,
      patientGoals: patientGoalsRaw,
      patientAge: patientAgeRaw,
      outputKind: outputKindRaw,
      sessionSpan: sessionSpanRaw,
    } = await req.json();

    const outputKind = String(outputKindRaw || 'session').toLowerCase() === 'program' ? 'program' : 'session';
    const sessionSpan = String(sessionSpanRaw || '').toLowerCase();

    // ── Build pain flags section ─────────────────────────────────────────────
    const activePainFlags = painFlags.filter((f) => f?.area?.trim());
    const painFlagsText =
      activePainFlags.length > 0
        ? activePainFlags
            .map(
              (f) =>
                `- ${f.area} (severity ${f.severity}/10): ${f.description || 'no description'}. Occurs: ${f.onset || 'unspecified'}.`
            )
            .join('\n')
        : 'None reported.';

    // ── Build session history section ────────────────────────────────────────
    const recentSessions = [...userHistory].sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    ).slice(0, 5);

    const historyText =
      recentSessions.length > 0
        ? recentSessions
            .map((s) => {
              const lines = [
                `Date: ${s.date} | Workout: ${s.workout_title || 'Unknown'} | Duration: ${s.duration_min ?? '?'} min`,
                `Intensity: ${s.intensity ?? '?'}/10 | RPE: ${s.rpe != null ? `${s.rpe}/10` : 'not recorded'} | Pain: ${s.pain_score != null ? `${s.pain_score}/10` : 'not recorded'}`,
              ];
              if (s.pain_score > 0 && s.pain_location) lines.push(`Pain location: ${s.pain_location}`);
              if (s.notes) lines.push(`Notes: ${s.notes}`);
              return lines.join('\n');
            })
            .join('\n\n')
        : 'No previous sessions recorded — treat this as a baseline session.';

    // ── Derive progression guidance from history ──────────────────────────────
    const lastSession = recentSessions[0];
    const lastRpe = lastSession?.rpe;
    const lastPain = lastSession?.pain_score ?? 0;

    let progressionGuidance = '';
    if (lastRpe != null) {
      if (lastRpe <= 5) {
        progressionGuidance =
          'Last session RPE was low — consider progressing load, volume, or complexity today.';
      } else if (lastRpe >= 9) {
        progressionGuidance =
          'Last session RPE was very high — consider reducing intensity or volume today to allow recovery.';
      } else {
        progressionGuidance =
          'Last session RPE was moderate — maintain or make small incremental progressions today.';
      }
    }
    if (lastPain >= 4) {
      progressionGuidance += ` Pain was ${lastPain}/10 in the last session${
        lastSession?.pain_location ? ` at ${lastSession.pain_location}` : ''
      } — be conservative and avoid aggravating movements.`;
    }

    const programWeeks = Number(programWeeksRaw);
    const programDays = Number(programDaysRaw);
    const phaseCount = Number(phaseCountRaw);
    const clinicalNotes = clipText(clinicalNotesRaw, 8000);
    const patientGoals = clipText(patientGoalsRaw, 6000);
    const patientAge = clipText(patientAgeRaw, 80);
    const durationNum = Math.round(Number(duration) || 45);

    const programContextLines = [];

    if (outputKind === 'program') {
      if (Number.isFinite(programDays) && programDays >= 1 && programDays <= 120) {
        programContextLines.push(
          `OUTPUT: a COMPLETE multi-phase PROGRAM spanning approximately ${Math.round(programDays)} calendar day(s). Each phase must state which days/weeks it covers in the "weeks" field (e.g. "Days 1–3" or "Weeks 1–2").`
        );
      } else if (Number.isFinite(programWeeks) && programWeeks >= 1 && programWeeks <= 104) {
        programContextLines.push(
          `OUTPUT: a COMPLETE multi-phase PROGRAM spanning approximately ${Math.round(programWeeks)} week(s). Each phase must state the week range in the "weeks" field.`
        );
      } else {
        programContextLines.push(
          'OUTPUT: a COMPLETE multi-phase PROGRAM appropriate to the diagnosis and parameters; label realistic day/week spans per phase.'
        );
      }
      if (Number.isFinite(phaseCount) && phaseCount >= 1 && phaseCount <= 24) {
        programContextLines.push(
          `Include exactly ${Math.round(phaseCount)} phase object(s) in the "phases" array (Phase 1 …), unless clinical notes clearly require fewer for safety.`
        );
      }
      programContextLines.push(
        `When prescribing volumes, assume a typical training session is about ${durationNum} minutes unless clinical notes say otherwise.`
      );
    } else {
      const oneDay =
        sessionSpan === 'one_day' || (Number.isFinite(programDays) && Math.round(programDays) === 1);
      if (oneDay) {
        programContextLines.push(
          `TIME SCOPE: ONE single training day only — one ${durationNum}-minute ${sessionType} session. Title and coaching should read as a single-day plan (not a multi-week mesocycle) unless clinical notes explicitly describe a longer arc.`
        );
      } else {
        if (Number.isFinite(programDays) && programDays >= 2 && programDays <= 120) {
          programContextLines.push(
            `Program timeline context: approximately ${Math.round(programDays)} days — theme this session within that horizon.`
          );
        } else if (Number.isFinite(programWeeks) && programWeeks >= 1 && programWeeks <= 104) {
          programContextLines.push(
            `Program timeline context: approximately ${Math.round(programWeeks)} week(s) — theme this session within that horizon.`
          );
        }
        if (Number.isFinite(phaseCount) && phaseCount >= 1 && phaseCount <= 24) {
          programContextLines.push(
            `Clinician expects ${Math.round(phaseCount)} macro-phase(s) across the programme — reflect the appropriate phase emphasis in this single session.`
          );
        }
      }
    }

    if (patientAge) {
      programContextLines.push(`Patient age (if relevant to dosing / selection): ${patientAge}`);
    }
    if (clinicalNotes) {
      programContextLines.push(
        `Clinical notes (follow unless unsafe; reflect in exercise notes and cues):\n${clinicalNotes}`
      );
    }
    if (patientGoals) {
      const gTail =
        outputKind === 'program'
          ? 'Weave through overview and each phase.'
          : 'Address explicitly in ai_note and exercise selection.';
      programContextLines.push(`Patient goals / priorities (${gTail}):\n${patientGoals}`);
    }

    const programContextSection =
      programContextLines.length > 0
        ? `PROGRAM / CLINICAL CONTEXT:\n${programContextLines.join('\n\n')}\n\n`
        : '';

    const systemPromptSession = `You are ForgeFit's AI coach — an expert strength and conditioning coach with physiotherapy knowledge.

Your job is to generate safe, effective, personalised workout plans in valid JSON.

RULES:
1. PAIN FLAGS are your highest priority. For each flagged area:
   - If severity is 1–3: modify the exercise (change range of motion, load, or position) and note the modification in the exercise notes.
   - If severity is 4–6: substitute with a pain-free alternative that trains the same movement pattern, explain the substitution.
   - If severity 7–10: avoid that body area entirely and note why.
   - Always add a "modification_reason" field to any exercise that was changed due to pain.
2. SESSION HISTORY drives progression:
   - If last RPE was low (≤5): progress load, reps, or complexity.
   - If last RPE was high (≥9) or recovery score is low (≤40): reduce volume or intensity.
   - Vary exercise selection to avoid repeating the exact same session.
   - Reference what changed from last session in the "progression_from_last" field.
3. RECOVERY SCORE adjusts overall volume and intensity:
   - 0–39: reduce sets by 1, keep intensity conservative, prioritise mobility.
   - 40–69: standard programming.
   - 70–100: full programming, can push intensity.
4. Always return ONLY valid JSON — no markdown, no explanation, no preamble.
5. Every string value must use double quotes. Use null (JSON null) where a field has no value — never write the words "number" or "null" as placeholders.
6. When PROGRAM / CLINICAL CONTEXT is provided, respect clinician notes and patient goals — do not contradict explicit clinical instructions unless you flag a safety concern briefly in ai_note.`;

    const systemPromptProgram = `You are ForgeFit's AI coach — an expert strength and conditioning coach with physiotherapy knowledge.

Your job is to output ONE valid JSON object describing a multi-phase PROGRAM (not a single flat workout list at the top level).

RULES:
1. PAIN FLAGS are highest priority — apply the same modification / substitution / avoidance rules as for single sessions, within each phase's exercises.
2. SESSION HISTORY informs progression themes across phases where relevant.
3. RECOVERY SCORE (${recoveryScore}/100) guides overall volume: 0–39 conservative; 40–69 standard; 70–100 full programming.
4. Each phase must include a clear "weeks" (or days) range label and 4–12 exercises appropriate to that block (fewer if early rehab).
5. Return ONLY valid JSON — no markdown, no preamble.
6. Use JSON null (not the word "null" as text) for optional fields.`;

    const userPromptSession = `Generate a ${durationNum}-minute ${sessionType} workout.

SESSION PARAMETERS:
- Body areas: ${bodyAreas.join(', ')}
- Target intensity: ${intensity}/10
- Equipment available: ${equipment}
- Recovery score today: ${recoveryScore}/100
${progressionGuidance ? `- Progression note: ${progressionGuidance}` : ''}

${programContextSection}PAIN & INJURY FLAGS (modify or avoid these areas as per your rules):
${painFlagsText}

RECENT SESSION HISTORY (use this to progress or regress today's session):
${historyText}

Return a single JSON object with this shape (example uses real JSON types):
{
  "title": "descriptive session title",
  "duration_min": 45,
  "intensity": 7,
  "ai_note": "1-2 sentence personalised coaching note referencing their history, pain flags, or recovery score",
  "estimated_tss": 42,
  "exercises": [
    {
      "name": "exercise name",
      "sets": 3,
      "reps": 10,
      "hold_seconds": null,
      "weight_suggestion": "e.g. 65% 1RM or bodyweight",
      "rest_seconds": 90,
      "body_areas": ["area1", "area2"],
      "notes": "coaching cue — technique, tempo, focus",
      "progression_from_last": null,
      "modification_reason": null
    }
  ]
}
Use integers for sets, reps, rest_seconds, estimated_tss, duration_min, intensity.`;

    const userPromptProgram = `Design a full ${sessionType} PROGRAM (multi-phase) for the following.

SESSION PARAMETERS:
- Body areas / diagnosis focus: ${bodyAreas.join(', ')}
- Target intensity anchor: ${intensity}/10 (interpret per phase as appropriate)
- Equipment available: ${equipment}
- Recovery score context: ${recoveryScore}/100

${programContextSection}PAIN & INJURY FLAGS:
${painFlagsText}

RECENT SESSION HISTORY (for progression themes):
${historyText}

Return ONE JSON object with this exact structure (example shows valid types):
{
  "program_name": "Program title",
  "duration_label": "e.g. 21 days · 3 phases",
  "overview": "2-4 sentences for clinician and patient.",
  "pain_rules": ["rule one", "rule two"],
  "phases": [
    {
      "label": "Phase 1",
      "title": "Short focus title",
      "weeks": "Days 1-5 or Weeks 1-2",
      "exercises": [
        {
          "name": "exercise name",
          "sets": 3,
          "reps": 10,
          "hold_seconds": null,
          "weight_suggestion": "bodyweight",
          "rest_seconds": 60,
          "body_areas": ["knee"],
          "notes": "coaching cue",
          "progression_from_last": null,
          "modification_reason": null
        }
      ]
    }
  ]
}
Include every phase requested in PROGRAM / CLINICAL CONTEXT; each phase must have at least 3 exercises unless contraindications require fewer.`;

    const systemPrompt = outputKind === 'program' ? systemPromptProgram : systemPromptSession;
    const userPrompt = outputKind === 'program' ? userPromptProgram : userPromptSession;

    const maxTokens = outputKind === 'program' ? 12000 : 4096;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    let text = '';
    if (Array.isArray(response.content)) {
      for (const block of response.content) {
        if (block?.type === 'text' && block.text) text += block.text;
      }
    }

    if (!String(text).trim()) {
      return Response.json({ error: 'Model returned empty response.' }, { status: 502 });
    }

    if (outputKind === 'program') {
      const parsed = parseProgramFromModelText(text);
      if (parsed.program) {
        return Response.json({ kind: 'program', program: parsed.program });
      }
      const dev = process.env.NODE_ENV === 'development';
      return Response.json(
        {
          error: parsed.error || 'Model returned invalid program JSON.',
          ...(dev && parsed.detail ? { detail: parsed.detail } : {}),
          ...(dev && parsed.snippet ? { rawSnippet: parsed.snippet } : {}),
        },
        { status: 502 }
      );
    }

    const parsed = parseWorkoutFromModelText(text);
    if (parsed.workout) {
      return Response.json({ kind: 'session', workout: parsed.workout });
    }

    const dev = process.env.NODE_ENV === 'development';
    return Response.json(
      {
        error: parsed.error || 'Model returned invalid JSON.',
        ...(dev && parsed.detail ? { detail: parsed.detail } : {}),
        ...(dev && parsed.snippet ? { rawSnippet: parsed.snippet } : {}),
      },
      { status: 502 }
    );
  } catch (error) {
    return Response.json(
      { error: error?.message || 'Failed to generate workout.' },
      { status: 500 }
    );
  }
}
