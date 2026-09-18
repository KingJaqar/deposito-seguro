const { _internal } = require('../withDisguiseIcon');

const launcherFilter = {
  action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
  category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
};

const deepLinkFilter = {
  action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
  category: [
    { $: { 'android:name': 'android.intent.category.DEFAULT' } },
    { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
  ],
  data: [{ $: { 'android:scheme': 'depositoseguro' } }],
};

describe('withDisguiseIcon launcher configuration', () => {
  it('removes MainActivity from the launcher while preserving deep links', () => {
    const app = {
      activity: [
        {
          $: { 'android:name': '.MainActivity' },
          'intent-filter': [launcherFilter, deepLinkFilter],
        },
      ],
      'activity-alias': [
        {
          $: { 'android:name': '.MainActivityAliasDefault', 'android:enabled': 'true' },
          'intent-filter': [launcherFilter],
        },
      ],
    };

    _internal.removeMainActivityLauncherIntentFilter(app);

    expect(app.activity[0]['intent-filter']).toEqual([deepLinkFilter]);
    expect(_internal.isLauncherIntentFilter(app.activity[0]['intent-filter'][0])).toBe(false);
    expect(_internal.isLauncherIntentFilter(app['activity-alias'][0]['intent-filter'][0])).toBe(true);
  });
});
