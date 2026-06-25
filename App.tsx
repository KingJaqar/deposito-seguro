import { ExpoRoot } from 'expo-router';

// @ts-expect-error - require.context is a Metro bundler feature
const ctx = require.context('./src/app');

export default function App() {
  return <ExpoRoot context={ctx} />;
}
