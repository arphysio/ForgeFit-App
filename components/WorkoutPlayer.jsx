import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function buildPhysitrackSSOUrl(physitrackExerciseId) {
  // TODO: Implement Physitrack SSO deep link URL builder for your tenant.
  // You typically generate an SSO URL that opens a specific exercise.
  void physitrackExerciseId;
  return null;
}

function normalizeExerciseSearchName(name) {
  return String(name || '')
    .replace(/\(.*?\)/g, '')
    .replace(/dumbbell/gi, '')
    .trim()
    .toLowerCase();
}

async function fetchYouTubeVideo(exerciseName) {
  const res = await fetch(`/api/youtube?q=${encodeURIComponent(exerciseName)}`);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.videoId) return null;
  return {
    type: 'youtube',
    url: `https://www.youtube.com/watch?v=${data.videoId}`,
    title: data?.title ?? null,
  };
}

function useExerciseMedia(exerciseName, physitrackId) {
  const [media, setMedia] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);

      // Option A: Physitrack SSO deep link.
      if (physitrackId) {
        const url = buildPhysitrackSSOUrl(physitrackId);
        if (!cancelled && url) setMedia({ type: 'physitrack_sso', url });
        if (!cancelled) setLoading(false);
        return;
      }

      // Option B: ExerciseDB (RapidAPI).
      const apiKey = process.env.NEXT_PUBLIC_EXERCISEDB_KEY;
      if (!exerciseName) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        let found = false;

        if (apiKey) {
          const searchName = normalizeExerciseSearchName(exerciseName);
          const res = await fetch(
            `https://exercisedb.p.rapidapi.com/exercises/name/${encodeURIComponent(searchName)}?limit=1`,
            {
              headers: {
                'X-RapidAPI-Key': apiKey,
                'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
              },
            }
          );
          if (res.ok) {
            const data = await res.json();
            if (!cancelled && Array.isArray(data) && data.length > 0 && data[0]?.gifUrl) {
              setMedia({ type: 'gif', url: data[0].gifUrl });
              found = true;
            }
          }
        }

        if (!found) {
          const youtube = await fetchYouTubeVideo(exerciseName);
          if (!cancelled && youtube) {
            setMedia(youtube);
          }
        }
      } catch {
        // Fail silently.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [exerciseName, physitrackId]);

  return { media, loading };
}

function ProgressBar({ completedSets, totalSets }) {
  const pct = totalSets > 0 ? Math.round((completedSets / totalSets) * 100) : 0;
  return (
    <div className="h-1 w-full bg-gray-100 overflow-hidden rounded-full">
      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

function RestTimer({ totalSeconds }) {
  const [remaining, setRemaining] = useState(null); // null = idle
  const [running, setRunning] = useState(false);
  const intervalRef = useRef(null);

  const start = useCallback(() => {
    setRemaining(Number(totalSeconds) || 0);
    setRunning(true);
  }, [totalSeconds]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
    setRunning(false);
    setRemaining(null);
  }, []);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r == null || r <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          return null;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]);

  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const frac = remaining !== null && totalSeconds ? remaining / totalSeconds : 0;
  const strokeDash = frac * circ;

  if (remaining !== null && running) {
    return (
      <div className="mt-2 flex items-center gap-3 rounded-lg bg-gray-50 px-3 py-2">
        <div className="relative h-11 w-11 flex-shrink-0">
          <svg className="-rotate-90 h-11 w-11" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
            <circle
              cx="22"
              cy="22"
              r={radius}
              fill="none"
              stroke="#10b981"
              strokeWidth="2.5"
              strokeDasharray={`${strokeDash} ${circ}`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-800">
            {remaining}
          </span>
        </div>
        <span className="flex-1 text-sm text-gray-600">
          Rest — <strong className="text-gray-900">{remaining}s</strong> remaining
        </span>
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 transition-colors hover:bg-red-50"
        >
          Stop
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-gray-400">Rest {totalSeconds}s after each set</span>
      <button
        type="button"
        onClick={start}
        className="ml-auto rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 transition-colors hover:bg-gray-50"
      >
        Start rest ▶
      </button>
    </div>
  );
}

function ExerciseThumb({ exercise }) {
  const { media, loading } = useExerciseMedia(
    exercise?.name,
    exercise?.physitrack_exercise_id ?? null
  );

  const displayMediaUrl = exercise?.media_url
    ? { type: 'gif', url: exercise.media_url }
    : media;

  const bodyAreas = Array.isArray(exercise?.body_areas) ? exercise.body_areas : [];
  const areaIcons = useMemo(
    () => ({
      Chest: '🏋️',
      Back: '💪',
      Shoulders: '🔝',
      Core: '⚡',
      Legs: '🦵',
      Glutes: '🍑',
      default: '🏃',
    }),
    []
  );
  const icon = bodyAreas.reduce((acc, a) => areaIcons[a] ?? acc, areaIcons.default);

  return (
    <div className="relative h-[110px] w-[110px] min-w-[110px] flex-shrink-0 overflow-hidden rounded-l-xl bg-gray-100 flex items-center justify-center">
      {loading && !exercise?.media_url ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
        </div>
      ) : null}

      {displayMediaUrl?.type === 'gif' ? (
        <img src={displayMediaUrl.url} alt={exercise?.name || 'Exercise media'} className="h-full w-full object-cover" />
      ) : null}

      {displayMediaUrl?.type === 'physitrack_sso' ? (
        <a
          href={displayMediaUrl.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-blue-600 transition-colors hover:bg-blue-50"
        >
          <span className="text-2xl">{icon}</span>
          <span className="text-xs font-medium">Watch demo</span>
        </a>
      ) : null}

      {displayMediaUrl?.type === 'youtube' ? (
        <a
          href={displayMediaUrl.url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-red-600 transition-colors hover:bg-red-50"
        >
          <span className="text-2xl">{icon}</span>
          <span className="text-xs font-medium">Watch on YouTube</span>
        </a>
      ) : null}

      {!displayMediaUrl ? (
        <div className="flex flex-col items-center gap-1 text-gray-400">
          <span className="text-2xl">{icon}</span>
          <span className="text-xs">No video</span>
        </div>
      ) : null}
    </div>
  );
}

function ExerciseCard({
  exercise,
  setsCompleted,
  onToggleSet,
  expanded,
  onToggleExpanded,
}) {
  const repLabel = exercise?.hold_seconds
    ? `${exercise.hold_seconds}s hold`
    : `${exercise?.reps ?? ''} reps`;

  const allDone = setsCompleted.every(Boolean);

  return (
    <div
      className={[
        'mb-3 overflow-hidden rounded-xl border transition-colors',
        allDone ? 'border-emerald-400' : 'border-gray-200',
      ].join(' ')}
    >
      <div className="flex">
        <ExerciseThumb exercise={exercise} />
        <div className="flex-1 p-3">
          <p className="mb-2 text-sm font-medium leading-tight text-gray-900">
            {exercise?.name}
          </p>

          <div className="mb-2 flex flex-wrap gap-2">
            {[
              { label: 'Sets', value: exercise?.sets },
              { label: exercise?.hold_seconds ? 'Hold' : 'Reps', value: repLabel },
              { label: 'Rest', value: `${exercise?.rest_seconds ?? 0}s` },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-md bg-gray-50 px-2 py-1">
                <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
          </div>

          <p className="text-xs leading-snug text-gray-500">{exercise?.weight_suggestion}</p>

          <div className="mt-2 flex gap-1.5">
            {setsCompleted.map((done, si) => (
              <button
                key={si}
                type="button"
                onClick={() => onToggleSet(si)}
                className={[
                  'flex h-5 w-5 items-center justify-center rounded-full border text-xs transition-all',
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-gray-300 text-gray-400 hover:border-gray-400',
                ].join(' ')}
                aria-label={`Toggle set ${si + 1}`}
              >
                {done ? '✓' : si + 1}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="px-3 pb-2">
        <RestTimer totalSeconds={exercise?.rest_seconds ?? 0} />
      </div>

      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-center justify-between border-t border-gray-100 px-3 py-2 text-left text-xs text-gray-500 transition-colors hover:bg-gray-50"
      >
        <span>Coaching notes{exercise?.progression_from_last ? ' + progression' : ''}</span>
        <span>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded ? (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-3 py-2.5 text-xs leading-relaxed text-gray-600">
          <p>
            <strong className="text-gray-800">Technique:</strong> {exercise?.notes}
          </p>
          {exercise?.progression_from_last ? (
            <p>
              <strong className="text-gray-800">Progression:</strong> {exercise.progression_from_last}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-1.5 pt-1">
            {(exercise?.body_areas ?? []).map((area) => (
              <span
                key={area}
                className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] text-teal-700"
              >
                {area}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SessionLogPanel({ workout, onSessionLog }) {
  const [rpe, setRpe] = useState('');
  const [painScore, setPainScore] = useState('');
  const [painLocation, setPainLocation] = useState('');
  const [notes, setNotes] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (typeof onSessionLog !== 'function') return;
    const rpeNum = rpe === '' ? null : Number(rpe);
    const painNum = painScore === '' ? 0 : Number(painScore);
    onSessionLog({
      date: new Date().toISOString(),
      workout_title: workout?.title ?? '',
      duration_min: workout?.duration_min ?? null,
      intensity: workout?.intensity ?? null,
      rpe: rpeNum,
      pain_score: painNum,
      pain_location: painNum > 0 ? (painLocation.trim() || null) : null,
      notes: notes.trim(),
    });
    setRpe('');
    setPainScore('');
    setPainLocation('');
    setNotes('');
  }

  return (
    <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-900">Log this session</h3>
      <p className="mb-3 text-xs text-gray-500">
        Save how it went — it will be prepended to your history for the next workout generation.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Session RPE (0–10)</label>
            <input
              type="number"
              min="0"
              max="10"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Pain (0–10)</label>
            <input
              type="number"
              min="0"
              max="10"
              value={painScore}
              onChange={(e) => setPainScore(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        </div>
        {Number(painScore) > 0 && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">Pain location</label>
            <input
              type="text"
              value={painLocation}
              onChange={(e) => setPainLocation(e.target.value)}
              placeholder="e.g. left shoulder"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-gray-500">Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="How did the session feel?"
            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Add to session history
        </button>
      </form>
    </div>
  );
}

export default function WorkoutPlayer({ workout, onSessionLog }) {
  const exercises = Array.isArray(workout?.exercises) ? workout.exercises : [];

  const totalSets = useMemo(
    () => exercises.reduce((sum, ex) => sum + (Number(ex?.sets) || 0), 0),
    [exercises]
  );

  const [completedByExercise, setCompletedByExercise] = useState(() =>
    exercises.map((ex) => Array(Number(ex?.sets) || 0).fill(false))
  );

  const [expandedByExercise, setExpandedByExercise] = useState(() =>
    exercises.map(() => false)
  );

  useEffect(() => {
    setCompletedByExercise(exercises.map((ex) => Array(Number(ex?.sets) || 0).fill(false)));
    setExpandedByExercise(exercises.map(() => false));
  }, [exercises]);

  const completedSets = useMemo(() => {
    let c = 0;
    for (const arr of completedByExercise) for (const v of arr) if (v) c += 1;
    return c;
  }, [completedByExercise]);

  const onToggleSetFactory = useCallback(
    (exerciseIndex) => (setIndex) => {
      setCompletedByExercise((prev) =>
        prev.map((arr, i) =>
          i === exerciseIndex ? arr.map((v, si) => (si === setIndex ? !v : v)) : arr
        )
      );
    },
    []
  );

  const onToggleExpandedFactory = useCallback(
    (exerciseIndex) => () => {
      setExpandedByExercise((prev) => prev.map((v, i) => (i === exerciseIndex ? !v : v)));
    },
    []
  );

  if (!workout) return null;

  return (
    <div className="mx-auto max-w-lg px-4 pb-8">
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-100">
        <div className="py-2">
          <ProgressBar completedSets={completedSets} totalSets={totalSets} />
        </div>
      </div>

      <div className="py-5 border-b border-gray-100 mb-4">
        <h2 className="text-lg font-medium text-gray-900 leading-snug">{workout?.title}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            {workout?.duration_min} min
          </span>
          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Intensity {workout?.intensity}/10
          </span>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
            {exercises.length} exercises · {totalSets} sets
          </span>
        </div>
      </div>

      {exercises.map((ex, i) => (
        <ExerciseCard
          key={i}
          exercise={ex}
          setsCompleted={completedByExercise[i] ?? []}
          onToggleSet={onToggleSetFactory(i)}
          expanded={expandedByExercise[i] ?? false}
          onToggleExpanded={onToggleExpandedFactory(i)}
        />
      ))}

      {typeof onSessionLog === 'function' ? (
        <SessionLogPanel workout={workout} onSessionLog={onSessionLog} />
      ) : null}
    </div>
  );
}

