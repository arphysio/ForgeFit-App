/**
 * Built-in race / distance plan skeletons (zone-based run structures).
 * Copy this file pattern to add plans you export from TrainingPeaks: paste validated
 * `structure` JSON per slot after importing a single workout in CardioFit.
 *
 * Slots: weekOffset from plan week 0 (anchor Monday), day 1–7 (Mon–Sun), optional structure.
 */

/** @typedef {{ weekOffset: number, day: number, title: string, type?: string, sport?: 'run'|'bike', time?: string, notes?: string, structure?: object }} RacePlanSlot */

/** @typedef {{ id: string, name: string, distanceKey: string, weeks: number, description: string, slots: RacePlanSlot[] }} RacePlanTemplate */

const PLANS = /** @type {RacePlanTemplate[]} */ ([
  {
    id: '5k-foundation-4wk',
    name: '5K — 4 week foundation (demo)',
    distanceKey: '5k',
    weeks: 4,
    description:
      'Three runs per week: easy aerobic, strides or steady, and long easy. Replace slots with your own TrainingPeaks exports as you build the library.',
    slots: [
      {
        weekOffset: 0,
        day: 2,
        title: 'Easy aerobic',
        type: 'run',
        sport: 'run',
        notes: 'Conversational. Demo template — swap structure from TP import if desired.',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            {
              kind: 'step',
              label: 'Warmup',
              durationMin: 8,
              intensityMode: 'zone',
              zone: 1,
              zoneBasis: 'pace',
            },
            {
              kind: 'step',
              label: 'Easy aerobic',
              durationMin: 22,
              intensityMode: 'zone',
              zone: 2,
              zoneBasis: 'pace',
            },
            {
              kind: 'step',
              label: 'Cooldown',
              durationMin: 5,
              intensityMode: 'zone',
              zone: 1,
              zoneBasis: 'pace',
            },
          ],
        },
      },
      {
        weekOffset: 0,
        day: 4,
        title: 'Steady / strides',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 10, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Steady', durationMin: 18, intensityMode: 'zone', zone: 3, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 7, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 0,
        day: 6,
        title: 'Long easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Long easy', durationMin: 40, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 1,
        day: 2,
        title: 'Easy aerobic',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 8, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
            { kind: 'step', label: 'Easy', durationMin: 28, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 5, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 1,
        day: 4,
        title: 'Steady',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 10, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Steady', durationMin: 22, intensityMode: 'zone', zone: 3, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 8, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 1,
        day: 6,
        title: 'Long easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Long easy', durationMin: 48, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 2,
        day: 2,
        title: 'Easy + strides',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Easy', durationMin: 25, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Strides', durationMin: 8, intensityMode: 'zone', zone: 4, zoneBasis: 'pace' },
            { kind: 'step', label: 'Easy jog', durationMin: 8, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 2,
        day: 4,
        title: 'Tempo touch',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 12, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Tempo', durationMin: 15, intensityMode: 'zone', zone: 4, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 10, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 2,
        day: 6,
        title: 'Long easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Long easy', durationMin: 52, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 3,
        day: 2,
        title: 'Easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Easy', durationMin: 35, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 3,
        day: 4,
        title: 'Race prep (short)',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 10, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Race pace touches', durationMin: 12, intensityMode: 'zone', zone: 4, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 10, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 3,
        day: 6,
        title: 'Easy shakeout',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Easy', durationMin: 30, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
    ],
  },
  {
    id: 'half-marathon-base-3wk',
    name: 'Half marathon — 3 week aerobic base (demo)',
    distanceKey: 'half_marathon',
    weeks: 3,
    description:
      'Placeholder micro-cycle: Tue / Thu / Sat. Extend by duplicating weeks in lib/racePlanTemplates.js or add JSON exports from TrainingPeaks per slot.',
    slots: [
      {
        weekOffset: 0,
        day: 2,
        title: 'Aerobic',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 10, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Aerobic', durationMin: 40, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 8, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 0,
        day: 4,
        title: 'Steady aerobic',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Steady', durationMin: 45, intensityMode: 'zone', zone: 3, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 0,
        day: 6,
        title: 'Long run',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Long easy', durationMin: 70, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 1,
        day: 2,
        title: 'Easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Easy', durationMin: 45, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 1,
        day: 4,
        title: 'Progressive aerobic',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Easy start', durationMin: 20, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'Steady finish', durationMin: 25, intensityMode: 'zone', zone: 3, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 1,
        day: 6,
        title: 'Long run',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Long easy', durationMin: 80, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 2,
        day: 2,
        title: 'Easy',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Easy', durationMin: 40, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
      {
        weekOffset: 2,
        day: 4,
        title: 'Marathon-pace touches',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [
            { kind: 'step', label: 'Warmup', durationMin: 12, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' },
            { kind: 'step', label: 'MP blocks', durationMin: 22, intensityMode: 'zone', zone: 4, zoneBasis: 'pace' },
            { kind: 'step', label: 'Cooldown', durationMin: 12, intensityMode: 'zone', zone: 1, zoneBasis: 'pace' },
          ],
        },
      },
      {
        weekOffset: 2,
        day: 6,
        title: 'Long run',
        type: 'run',
        sport: 'run',
        structure: {
          sport: 'run',
          zoneBasis: 'pace',
          steps: [{ kind: 'step', label: 'Long easy', durationMin: 90, intensityMode: 'zone', zone: 2, zoneBasis: 'pace' }],
        },
      },
    ],
  },
]);

const BY_ID = new Map(PLANS.map((p) => [p.id, p]));

export function listRacePlanTemplates() {
  return PLANS.map((p) => ({
    id: p.id,
    name: p.name,
    distanceKey: p.distanceKey,
    weeks: p.weeks,
    description: p.description,
    sessionCount: (p.slots || []).length,
  }));
}

/** @returns {RacePlanTemplate|null} */
export function getRacePlanTemplate(id) {
  return BY_ID.get(String(id || '').trim()) || null;
}
