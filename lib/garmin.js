// Garmin Connect API workout push.
// Requires user to have authorized via OAuth 2.0 flow.

async function readGarminError(res) {
  const raw = await res.text();
  try {
    const j = raw ? JSON.parse(raw) : null;
    if (j && (j.error || j.errorId)) {
      const id = j.errorId ? ` errorId=${j.errorId}` : '';
      const msg = j.clientMessage ? ` ${j.clientMessage}` : '';
      return `${j.error || 'Error'}${id}${msg}`.trim();
    }
  } catch {
    /* ignore */
  }
  return raw?.slice(0, 500) || String(res.status);
}

export async function fetchGarminDailyMetrics(accessToken, date) {
  const query = new URLSearchParams({ date });
  const res = await fetch(
    `https://apis.garmin.com/wellness-api/rest/dailies?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    const detail = await readGarminError(res);
    throw new Error(`Garmin metrics fetch failed (${res.status}): ${detail}`);
  }

  const payload = await res.json();
  const daily = Array.isArray(payload) ? payload[0] : payload?.daily ?? payload;

  return {
    hrv_ms: daily?.hrv ?? daily?.hrv_ms ?? null,
    body_battery: daily?.bodyBattery ?? daily?.body_battery ?? null,
    sleep_score: daily?.sleepScore ?? daily?.sleep_score ?? null,
  };
}

export async function pushWorkoutToGarmin(accessToken, workout) {
  const garminPayload = {
    workoutName: workout.title,
    sport: workout.sport,
    estimatedDurationInSecs: workout.steps.reduce(
      (sum, s) => sum + (s.duration_type === 'TIME' ? s.duration_value : 0),
      0
    ),
    workoutSegments: [
      {
        segmentOrder: 1,
        sportType: { sportTypeKey: workout.sport.toLowerCase() },
        workoutSteps: workout.steps.map((step, i) => ({
          stepOrder: i + 1,
          stepType: { stepTypeKey: step.type.toLowerCase() },
          durationType: { durationTypeKey: step.duration_type.toLowerCase() },
          durationValue: step.duration_value,
          targetType: { workoutTargetTypeKey: step.target_type.toLowerCase() },
          targetValueLow: step.target_low,
          targetValueHigh: step.target_high,
        })),
      },
    ],
  };

  const res = await fetch('https://apis.garmin.com/workout-service/workout', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(garminPayload),
  });

  if (!res.ok) {
    const detail = await readGarminError(res);
    throw new Error(`Garmin workout push failed (${res.status}): ${detail}`);
  }
  return res.json(); // returns { workoutId: "..." }
}
