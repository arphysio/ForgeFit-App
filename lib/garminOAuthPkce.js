import crypto from 'crypto';

/**
 * RFC 7636 PKCE pair for Garmin Connect Developer Program OAuth 2.0.
 * @see https://developer.garmin.com/gc-developer-program/ — OAuth2 with PKCE (not connectapi legacy OAuth).
 */
export function generateGarminPkcePair() {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return { codeVerifier, codeChallenge };
}
