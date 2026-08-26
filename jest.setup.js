// Shared Jest setup for React Native / Expo module mocks used across the
// store/security smoke tests (Phase 0 baseline — see plans/deposito-seguro-audit-report.md §20).

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// NOTE: deliberately plain functions, not jest.fn(impl) — jest-expo's preset
// sets `resetMocks: true`, which strips mockImplementations (even ones set
// at creation time) between every test. Wrapping these in jest.fn() would
// silently turn them into no-ops after the first test in a file.
// jest-expo's default native-module stub resolves expo-crypto's methods to
// empty/undefined values (no real native binding under Jest), which makes
// hashPassword() silently collapse to '' and defeats every auth test. Back
// it with Node's real `crypto` module so digest/random behavior is genuine.
jest.mock('expo-crypto', () => {
  const nodeCrypto = require('crypto');
  return {
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: async (_algorithm, data) =>
      nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex'),
    getRandomBytes: (byteCount) => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
    getRandomBytesAsync: async (byteCount) => new Uint8Array(nodeCrypto.randomBytes(byteCount)),
  };
});

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: async (key) => (store.has(key) ? store.get(key) : null),
    setItemAsync: async (key, value) => {
      store.set(key, value);
    },
    deleteItemAsync: async (key) => {
      store.delete(key);
    },
  };
});
