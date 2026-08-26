import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

/**
 * Real cryptographic primitives for the vault (replaces the previous
 * 1000-round manual SHA-256 chain and single-byte-repeating-key XOR cipher —
 * see plans/deposito-seguro-audit-report.md Findings S-3, S-4, S-6, S-7).
 *
 * - Password hashing: PBKDF2-HMAC-SHA256 (crypto-js), salted, with the salt
 *   sourced from expo-crypto's CSPRNG.
 * - Confidentiality + integrity: AES-256-CBC encryption followed by an
 *   HMAC-SHA256 tag over (IV || ciphertext) — a standard Encrypt-then-MAC
 *   construction. crypto-js has no GCM mode, so EtM is used instead of
 *   AES-GCM to get the same authenticated-encryption guarantee (tampering
 *   is detected, not just "silently produces garbage on decrypt").
 * - All randomness (salts, IVs, generated keys) is sourced from
 *   expo-crypto's getRandomBytes/getRandomBytesAsync (OS CSPRNG) — never
 *   Math.random()/Date.now(), which the previous implementation used
 *   despite claiming otherwise.
 *
 * crypto-js is pure JavaScript (no native module), so none of this
 * interacts with the native/prebuild work in plugins/withDisguiseIcon.js.
 */

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToWordArray(hex: string): CryptoJS.lib.WordArray {
  return CryptoJS.enc.Hex.parse(hex);
}

/** Constant-time string compare — prevents timing side-channels on secret comparisons (S-7). */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still walk `a` against itself so the failure path takes comparable
    // time regardless of length mismatch, rather than returning instantly.
    let dummy = 0;
    for (let i = 0; i < a.length; i++) dummy |= a.charCodeAt(i) ^ a.charCodeAt(i);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export class SecureCrypto {
  /**
   * PBKDF2-HMAC-SHA256 iteration count.
   *
   * This runs in pure JS (crypto-js) with no native acceleration, so it has
   * to trade off against interactive unlock latency on a real device —
   * OWASP's current PBKDF2-HMAC-SHA256 minimum (600,000) would make every
   * PIN unlock take several seconds to tens of seconds on a mid/low-end
   * phone's JS engine. Benchmarked inside the project's own Jest/Hermes-like
   * (Babel-transformed, no JIT) test environment: ~240ms @ 5k iterations,
   * ~500ms @ 10k, ~960ms @ 20k, ~2.7s @ 60k. 10,000 was chosen to keep
   * unlock feeling near-instant (~10x more expensive to brute-force than
   * the previous 1000-round SHA-256 chain) and MUST still be re-benchmarked
   * on a real target device before shipping, and raised if a native crypto
   * module is ever added to the project.
   */
  static readonly PBKDF2_ITERATIONS = 10_000;

  /** Cryptographically secure random salt (hex-encoded), via expo-crypto's CSPRNG. */
  static async generateSaltAsync(): Promise<string> {
    const bytes = await Crypto.getRandomBytes(16);
    return bytesToHex(bytes);
  }

  /**
   * Cryptographically secure random UUID v4, via expo-crypto's CSPRNG.
   * Deliberately synchronous (like the previous implementation) —
   * `vaultStore.ts` has several call sites that assign the return value
   * directly to an `id:` field without awaiting it.
   */
  static generateUUID(): string {
    const bytes = Crypto.getRandomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = bytesToHex(bytes);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /** PBKDF2-HMAC-SHA256 password/PIN hash. `salt` is hex, as produced by generateSaltAsync(). */
  static async hashPassword(password: string, salt: string): Promise<string> {
    const derived = CryptoJS.PBKDF2(password, hexToWordArray(salt), {
      keySize: 256 / 32,
      iterations: SecureCrypto.PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256,
    });
    return derived.toString(CryptoJS.enc.Hex);
  }

  /** Constant-time comparison for secret/hash equality checks (S-7). */
  static secureCompare(a: string, b: string): boolean {
    return constantTimeEqual(a, b);
  }

  /** UTF8 string -> base64, without relying on Node's `Buffer` (not present in the Hermes runtime). */
  static utf8ToBase64(text: string): string {
    return CryptoJS.enc.Utf8.parse(text).toString(CryptoJS.enc.Base64);
  }

  /** base64 -> UTF8 string, without relying on Node's `Buffer`. */
  static base64ToUtf8(base64: string): string {
    return CryptoJS.enc.Base64.parse(base64).toString(CryptoJS.enc.Utf8);
  }

  /**
   * Generates a raw encryption key. With a user-supplied passphrase, derives
   * one via PBKDF2 (salt embedded in the returned string as `salt:hash`);
   * otherwise generates 32 truly random bytes.
   */
  static async generateEncryptionKey(customKey?: string): Promise<string> {
    if (customKey?.trim()) {
      const salt = await SecureCrypto.generateSaltAsync();
      const hash = await SecureCrypto.hashPassword(customKey.trim(), salt);
      return `${salt}:${hash}`;
    }
    const bytes = await Crypto.getRandomBytes(32);
    return bytesToHex(bytes);
  }

  /** One-way fingerprint for display (never the secret itself, unlike the previous substring-of-the-key implementation). */
  static fingerprint(key: string): string {
    return CryptoJS.SHA256(key).toString(CryptoJS.enc.Hex).slice(0, 12).toUpperCase();
  }

  /**
   * Encrypts a base64-encoded plaintext string with AES-256-CBC + HMAC-SHA256
   * (Encrypt-then-MAC). Returns `base64(iv).base64(ciphertext).base64(mac)`.
   * A fresh random IV is generated per call.
   */
  static async encrypt(plaintextBase64: string, key: string): Promise<string> {
    const ivBytes = await Crypto.getRandomBytes(16);
    const iv = CryptoJS.lib.WordArray.create(ivBytes as unknown as number[]);
    const keyWA = CryptoJS.SHA256(key);
    const plaintext = CryptoJS.enc.Base64.parse(plaintextBase64);

    const encrypted = CryptoJS.AES.encrypt(plaintext, keyWA, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    const ciphertext = encrypted.ciphertext;
    const mac = CryptoJS.HmacSHA256(iv.clone().concat(ciphertext), keyWA);

    return [iv, ciphertext, mac].map((wa) => CryptoJS.enc.Base64.stringify(wa)).join('.');
  }

  /**
   * Decrypts a payload produced by `encrypt`. Verifies the HMAC tag
   * (constant-time) before decrypting — throws if the tag doesn't match
   * (wrong key, or the ciphertext was tampered with/corrupted), rather than
   * silently returning garbage.
   */
  static async decrypt(payload: string, key: string): Promise<string> {
    const parts = payload.split('.');
    if (parts.length !== 3) {
      throw new Error('Malformed ciphertext payload');
    }
    const [ivB64, ctB64, macB64] = parts;
    const iv = CryptoJS.enc.Base64.parse(ivB64);
    const ciphertext = CryptoJS.enc.Base64.parse(ctB64);
    const keyWA = CryptoJS.SHA256(key);

    const expectedMac = CryptoJS.HmacSHA256(iv.clone().concat(ciphertext), keyWA).toString(CryptoJS.enc.Base64);
    if (!constantTimeEqual(expectedMac, macB64)) {
      throw new Error('Decryption failed: authentication tag mismatch (wrong key or corrupted/tampered data)');
    }

    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext } as CryptoJS.lib.CipherParams,
      keyWA,
      { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }
    );
    return CryptoJS.enc.Base64.stringify(decrypted);
  }
}
