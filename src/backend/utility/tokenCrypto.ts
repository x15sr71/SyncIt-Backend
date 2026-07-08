import crypto from 'crypto';

/**
 * AES-256-GCM encryption for OAuth tokens at rest (P1-1).
 *
 * Format: `enc:v1:` + base64(iv[12] | authTag[16] | ciphertext).
 * Values without the prefix are treated as legacy plaintext and returned
 * as-is by decryptToken, so existing rows keep working and get encrypted
 * on their next write (token refresh or reconnect).
 *
 * Key: TOKEN_ENC_KEY env, 32 random bytes base64 (`openssl rand -base64 32`).
 * Missing key => plaintext passthrough with a one-time warning in dev;
 * production refuses to boot without it (see startup/bootstrap.ts).
 */

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let warnedMissingKey = false;

function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENC_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('TOKEN_ENC_KEY must decode to exactly 32 bytes (openssl rand -base64 32)');
  }
  return key;
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (!warnedMissingKey) {
      warnedMissingKey = true;
      console.warn('[TokenCrypto] TOKEN_ENC_KEY not set — storing OAuth tokens in plaintext');
    }
    return plaintext;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptToken(stored: string): string {
  if (!stored || !stored.startsWith(PREFIX)) {
    // Legacy plaintext row — passthrough (re-encrypted on next write).
    return stored;
  }

  const key = getKey();
  if (!key) {
    throw new Error('TOKEN_ENC_KEY is required to decrypt stored tokens but is not set');
  }

  const payload = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag); // GCM: throws on any tampering
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
