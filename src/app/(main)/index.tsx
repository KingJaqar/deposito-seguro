import { Redirect } from 'expo-router';

/**
 * I-19 remediation (plans/deposito-seguro-audit-report.md §11): this used to
 * be byte-identical to src/app/index.tsx, redirecting to /(auth)/onboarding
 * even though (main)/_layout.tsx's render-time auth guard (Finding I-1)
 * guarantees nothing reaches this file unless isAuthenticated is already
 * true — bouncing back through onboarding just added an extra redirect hop
 * before onboarding.tsx's own effect sent the user right back to dashboard.
 * Landing on the actual destination directly is both simpler and correct.
 */
export default function IndexScreen() {
  return <Redirect href="/(main)/dashboard" />;
}