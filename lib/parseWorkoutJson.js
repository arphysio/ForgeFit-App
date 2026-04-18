/**
 * Extract and parse workout JSON from Claude output (handles fences, preamble, trailing commas).
 */

export function stripCodeFences(s) {
  let t = String(s || '').trim();
  t = t.replace(/^\uFEFF/, '');
  // ```json ... ``` or ``` ... ```
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/im;
  const m = t.match(fence);
  if (m) return m[1].trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  return t.trim();
}

/** First top-level `{ ... }` using brace depth; respects double-quoted strings and escapes. */
export function extractBalancedObject(s) {
  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        inString = false;
        continue;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/** Remove illegal trailing commas before } or ]. */
export function stripTrailingCommas(jsonStr) {
  let out = jsonStr;
  let prev;
  do {
    prev = out;
    out = out.replace(/,(\s*[\]}])/g, '$1');
  } while (out !== prev);
  return out;
}

export function parseWorkoutFromModelText(rawText) {
  let cleaned = stripCodeFences(rawText);

  const attempts = [];
  const tryParse = (label, str) => {
    if (!str || !str.trim()) return null;
    try {
      const w = JSON.parse(str);
      if (w && typeof w === 'object' && !Array.isArray(w) && Array.isArray(w.exercises)) {
        return w;
      }
      attempts.push(`${label}: parsed but missing exercises[]`);
    } catch (e) {
      attempts.push(`${label}: ${e.message}`);
    }
    return null;
  };

  let w = tryParse('direct', cleaned);
  if (w) return { workout: w };

  w = tryParse('trailing commas', stripTrailingCommas(cleaned));
  if (w) return { workout: w };

  const extracted = extractBalancedObject(cleaned);
  if (extracted) {
    w = tryParse('extracted', extracted);
    if (w) return { workout: w };
    w = tryParse('extracted+commas', stripTrailingCommas(extracted));
    if (w) return { workout: w };
  }

  return {
    error: 'Model returned invalid JSON.',
    detail: attempts.slice(0, 4).join(' | '),
    snippet: cleaned.slice(0, 400),
  };
}
