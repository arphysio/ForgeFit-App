import { gunzipSync } from 'node:zlib';

/**
 * @param {Buffer} buf
 * @returns {Buffer | { error: string }}
 */
export function decodeFitUploadBuffer(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (b.length >= 2 && b[0] === 0x1f && b[1] === 0x8b) {
    try {
      return gunzipSync(b);
    } catch {
      return { error: 'Could not decompress gzip (.fit.gz). The file may be corrupt or not gzip.' };
    }
  }
  return b;
}
