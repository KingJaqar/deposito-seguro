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

// Item 15 (component tests): react-native-safe-area-context has no native
// measurement layer under Jest, so useSafeAreaInsets()/useSafeAreaFrame()
// would otherwise throw without a real device. The library ships its own
// jest mock (fixed 320x640 frame, zero insets, falls back to those defaults
// even with no <SafeAreaProvider> in the tree) — shared here so every
// component test gets it for free rather than re-mocking per test file.
jest.mock('react-native-safe-area-context', () => {
  // The library's own jest mock is an ES `export default {...}` — compiled
  // to `{ __esModule: true, default: {...} }` under CJS require(). Returning
  // that whole wrapper as-is from a jest.mock factory would leave consumers'
  // `{ useSafeAreaInsets } from 'react-native-safe-area-context'` looking for
  // `.useSafeAreaInsets` on the wrapper instead of on `.default`. Unwrap it.
  const mock = require('react-native-safe-area-context/jest/mock');
  return mock.default ?? mock;
});
