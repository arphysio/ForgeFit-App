import { NextResponse } from 'next/server';

export const FORGEFIT_PORTAL_SECRET_HEADER = 'x-forgefit-portal-secret';

/** Trim, strip CR/BOM/zero-width chars, and one layer of matching quotes. */
function normalizePortalSecret(value) {
  if (value == null) return '';
  let s = String(value)
    .replace(/\r/g, '')
    .replace(/\uFEFF/g, '')
    .replace(/[\u200B-\u200D]/g, '')
    .trim();
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      s = s.slice(1, -1).trim();
    }
  }
  return s;
}

/** If the browser pasted a full .env line by mistake, keep only the value after '='. */
function stripAssignmentIfPresent(value) {
  const s = String(value ?? '');
  const m = s.match(/^\s*FORGEFIT_PORTAL_SECRET\s*=\s*(.*)$/i);
  if (m) return m[1];
  return s;
}

/**
 * Clinician portal + admin APIs: shared secret in env and request header.
 * Returns a NextResponse to return early, or null if authorized.
 */
export function assertClinicianPortalRequest(request) {
  const envRaw = process.env.FORGEFIT_PORTAL_SECRET;
  const env = normalizePortalSecret(stripAssignmentIfPresent(envRaw));
  const headerRaw =
    request.headers.get(FORGEFIT_PORTAL_SECRET_HEADER) ??
    request.headers.get('X-ForgeFit-Portal-Secret');
  const header = normalizePortalSecret(stripAssignmentIfPresent(headerRaw));

  if (!env) {
    return NextResponse.json(
      {
        error:
          'Server is missing FORGEFIT_PORTAL_SECRET. Add it to .env.local in the ForgeFit project root, then stop and restart `npm run dev` (env is only read at startup).',
      },
      { status: 401 }
    );
  }

  if (!header) {
    return NextResponse.json(
      {
        error:
          'Request had no X-ForgeFit-Portal-Secret header. In the clinician portal: Settings → Integrations → Portal messaging secret → enter the same value as FORGEFIT_PORTAL_SECRET → Save, then refresh.',
      },
      { status: 401 }
    );
  }

  if (header !== env) {
    const devHint =
      process.env.NODE_ENV === 'development'
        ? ` (dev: character counts — server=${env.length}, browser=${header.length}. If they differ, there is an invisible character or the strings are not the same.)`
        : '';
    return NextResponse.json(
      {
        error:
          'Portal secret mismatch. The value saved in the portal must match FORGEFIT_PORTAL_SECRET in .env.local exactly. Clear the field in Settings, paste again, Save, then refresh. Restart `npm run dev` after any .env change.' +
          devHint,
      },
      { status: 401 }
    );
  }

  return null;
}
