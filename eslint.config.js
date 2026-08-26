// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");
const globals = require("globals");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".kilo/worktrees/**"],
  },
  {
    // jest.setup.js and the test files under __tests__/ use Jest's global
    // `jest`/`describe`/`it`/`expect` APIs (see jest.setup.js, jest.config
    // in package.json) without importing them — tell ESLint about the Jest
    // global environment so `no-undef` doesn't flag them.
    files: ["jest.setup.js", "**/__tests__/**/*.{js,ts,tsx}"],
    languageOptions: {
      globals: globals.jest,
    },
  },
]);
