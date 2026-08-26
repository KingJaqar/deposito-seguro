/**
 * Smoke tests for the real crypto engine (Phase 1 — see
 * plans/deposito-seguro-audit-report.md §20, Findings S-3/S-4/S-6/S-7).
 */
import CryptoJS from 'crypto-js';
import { SecureCrypto } from '../crypto';

// No Buffer here — it doesn't exist in the Hermes runtime these tests are
// standing in for; use crypto-js's own UTF8<->Base64 codec instead.
const utf8ToBase64 = (s: string) => CryptoJS.enc.Utf8.parse(s).toString(CryptoJS.enc.Base64);
const base64ToUtf8 = (s: string) => CryptoJS.enc.Base64.parse(s).toString(CryptoJS.enc.Utf8);

describe('SecureCrypto', () => {
  it('hashPassword is deterministic for the same password+salt', async () => {
    const h1 = await SecureCrypto.hashPassword('123456', 'abcd1234');
    const h2 = await SecureCrypto.hashPassword('123456', 'abcd1234');
    expect(h1).toBe(h2);
    expect(h1).not.toBe('');
  });

  it('hashPassword differs for a different password or salt', async () => {
    const base = await SecureCrypto.hashPassword('123456', 'abcd1234');
    expect(await SecureCrypto.hashPassword('654321', 'abcd1234')).not.toBe(base);
    expect(await SecureCrypto.hashPassword('123456', 'ffff0000')).not.toBe(base);
  });

  it('generateSaltAsync/generateUUID produce non-degenerate, varying output', async () => {
    const salt1 = await SecureCrypto.generateSaltAsync();
    const salt2 = await SecureCrypto.generateSaltAsync();
    expect(salt1).not.toBe(salt2);
    expect(salt1).toMatch(/^[0-9a-f]{32}$/);

    const uuid = SecureCrypto.generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('encrypt/decrypt round-trips real content', async () => {
    const plaintextBase64 = utf8ToBase64('the quick brown fox');
    const key = 'my-encryption-key';

    const ciphertext = await SecureCrypto.encrypt(plaintextBase64, key);
    expect(ciphertext).not.toContain('the quick brown fox');

    const decrypted = await SecureCrypto.decrypt(ciphertext, key);
    expect(base64ToUtf8(decrypted)).toBe('the quick brown fox');
  });

  it('decrypt rejects the wrong key', async () => {
    const plaintextBase64 = utf8ToBase64('secret payload');
    const ciphertext = await SecureCrypto.encrypt(plaintextBase64, 'key-a');
    await expect(SecureCrypto.decrypt(ciphertext, 'key-b')).rejects.toThrow(/authentication tag mismatch/i);
  });

  it('decrypt rejects tampered ciphertext (authenticated encryption, not just confidentiality)', async () => {
    const plaintextBase64 = utf8ToBase64('secret payload');
    const key = 'a-key';
    const ciphertext = await SecureCrypto.encrypt(plaintextBase64, key);

    const [iv, ct, mac] = ciphertext.split('.');
    const mid = Math.floor(ct.length / 2);
    const flippedChar = ct[mid] === 'A' ? 'B' : 'A';
    const flippedCt = ct.slice(0, mid) + flippedChar + ct.slice(mid + 1);
    const tampered = [iv, flippedCt, mac].join('.');

    await expect(SecureCrypto.decrypt(tampered, key)).rejects.toThrow(/authentication tag mismatch/i);
  });

  it('fingerprint never leaks the raw key', () => {
    const key = 'super-secret-encryption-key-value';
    const fp = SecureCrypto.fingerprint(key);
    expect(fp).not.toContain(key.slice(0, 12));
    expect(fp).toHaveLength(12);
  });

  it('secureCompare behaves like equality but in constant time', () => {
    expect(SecureCrypto.secureCompare('abc', 'abc')).toBe(true);
    expect(SecureCrypto.secureCompare('abc', 'abd')).toBe(false);
    expect(SecureCrypto.secureCompare('abc', 'abcd')).toBe(false);
  });
});
