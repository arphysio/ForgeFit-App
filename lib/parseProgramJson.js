import { extractBalancedObject, stripCodeFences, stripTrailingCommas } from '@/lib/parseWorkoutJson';

function tryParseProgram(str, attempts, label) {
  if (!str || !str.trim()) return null;
  try {
    const o = JSON.parse(str);
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      attempts.push(`${label}: not an object`);
      return null;
    }
    const name = o.program_name || o.programName || o.name;
    const phases = o.phases;
    if (!Array.isArray(phases) || phases.length < 1) {
      attempts.push(`${label}: missing phases[]`);
      return null;
    }
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (!ph || typeof ph !== 'object' || !Array.isArray(ph.exercises) || ph.exercises.length < 1) {
        attempts.push(`${label}: phase ${i} missing exercises[]`);
        return null;
      }
    }
    return o;
  } catch (e) {
    attempts.push(`${label}: ${e.message}`);
    return null;
  }
}

/**
 * Parse multi-phase program JSON from model output.
 */
export function parseProgramFromModelText(rawText) {
  let cleaned = stripCodeFences(rawText);
  const attempts = [];

  let p = tryParseProgram(cleaned, attempts, 'direct');
  if (p) return { program: p };

  p = tryParseProgram(stripTrailingCommas(cleaned), attempts, 'trailing commas');
  if (p) return { program: p };

  const extracted = extractBalancedObject(cleaned);
  if (extracted) {
    p = tryParseProgram(extracted, attempts, 'extracted');
    if (p) return { program: p };
    p = tryParseProgram(stripTrailingCommas(extracted), attempts, 'extracted+commas');
    if (p) return { program: p };
  }

  return {
    error: 'Model returned invalid program JSON.',
    detail: attempts.slice(0, 5).join(' | '),
    snippet: cleaned.slice(0, 400),
  };
}
