import crypto from 'crypto';

function getSecret() {
  return (
    process.env.INTEGRATIONS_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_KEY ||
    'forgefit-dev-secret'
  );
}

export function createState(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

export function readState(state) {
  if (!state || !state.includes('.')) return null;
  const [raw, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', getSecret()).update(raw).digest('base64url');
  if (sig !== expected) return null;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
