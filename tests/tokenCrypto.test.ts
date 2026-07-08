import crypto from 'crypto';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { encryptToken, decryptToken } from '../src/backend/utility/tokenCrypto';

const KEY = crypto.randomBytes(32).toString('base64');
const ORIGINAL_KEY = process.env.TOKEN_ENC_KEY;

describe('tokenCrypto (AES-256-GCM at rest)', () => {
  beforeEach(() => {
    process.env.TOKEN_ENC_KEY = KEY;
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.TOKEN_ENC_KEY;
    else process.env.TOKEN_ENC_KEY = ORIGINAL_KEY;
  });

  it('round-trips arbitrary token strings', () => {
    const secrets = ['BQDx-access-token', 'refresh/token+with=padding', '🎵 unicode', ''];
    for (const secret of secrets) {
      const stored = encryptToken(secret);
      expect(decryptToken(stored)).toBe(secret);
    }
  });

  it('produces ciphertext, not plaintext, with the versioned prefix', () => {
    const stored = encryptToken('super-secret-token');
    expect(stored.startsWith('enc:v1:')).toBe(true);
    expect(stored).not.toContain('super-secret-token');
  });

  it('uses a unique IV per encryption (same plaintext, different ciphertext)', () => {
    const a = encryptToken('same-token');
    const b = encryptToken('same-token');
    expect(a).not.toBe(b);
    const ivA = Buffer.from(a.slice('enc:v1:'.length), 'base64').subarray(0, 12);
    const ivB = Buffer.from(b.slice('enc:v1:'.length), 'base64').subarray(0, 12);
    expect(ivA.equals(ivB)).toBe(false);
  });

  it('detects tampering via the GCM auth tag', () => {
    const stored = encryptToken('super-secret-token');
    const payload = Buffer.from(stored.slice('enc:v1:'.length), 'base64');
    payload[payload.length - 1] ^= 0xff; // flip a ciphertext bit
    const tampered = 'enc:v1:' + payload.toString('base64');
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('passes legacy plaintext values through unchanged', () => {
    expect(decryptToken('plain-legacy-token')).toBe('plain-legacy-token');
  });

  it('rejects keys that are not exactly 32 bytes', () => {
    process.env.TOKEN_ENC_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });

  it('refuses to decrypt encrypted values without a key', () => {
    const stored = encryptToken('secret');
    delete process.env.TOKEN_ENC_KEY;
    expect(() => decryptToken(stored)).toThrow(/TOKEN_ENC_KEY/);
  });
});
