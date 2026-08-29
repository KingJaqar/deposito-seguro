/**
 * Local Expo config plugin that makes the calculator-disguise / FLAG_SECURE
 * native Android customization survive `expo prebuild` (including the
 * `--clean` regeneration a CNG/SDK upgrade performs).
 *
 * Previously these files were hand-edited directly inside the gitignored,
 * untracked `android/` folder (see audit Finding N-1) — a clean prebuild
 * would silently produce a project missing this module, the app-icon
 * disguise and the (dead) MainActivity FLAG_SECURE path with no error.
 *
 * This plugin, run on every prebuild, re-creates:
 *   - DisguiseIconModule.kt / DisguiseIconPackage.kt (native module)
 *   - registration of DisguiseIconPackage in MainApplication.kt
 *   - the 4 activity-alias entries + android:allowBackup="false" in
 *     AndroidManifest.xml
 *   - the calculator-icon mipmap PNGs (identical source image copied into
 *     every density bucket, matching how they exist in the repo today)
 */
const { withDangerousMod, withMainApplication, withAndroidManifest } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/anonymous/depositoseguro';

const DISGUISE_ICON_MODULE_KT = `package com.anonymous.depositoseguro

import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class DisguiseIconModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  private val appContext: Context = reactContext.applicationContext

  override fun getName(): String = "DisguiseIconModule"

  @ReactMethod
  fun setIcon(theme: String, promise: Promise) {
    try {
      val packageManager = appContext.packageManager
      val pkg = appContext.packageName

      val aliasClassName = when (theme) {
        "white" -> "$pkg.MainActivityAliasWhite"
        "orange" -> "$pkg.MainActivityAliasOrange"
        "red" -> "$pkg.MainActivityAliasRed"
        else -> "$pkg.MainActivityAliasDefault"
      }

      val aliases = listOf(
        "$pkg.MainActivityAliasDefault",
        "$pkg.MainActivityAliasWhite",
        "$pkg.MainActivityAliasOrange",
        "$pkg.MainActivityAliasRed"
      )

      for (alias in aliases) {
        val component = ComponentName(appContext, alias)
        val state = if (component.className == aliasClassName)
          PackageManager.COMPONENT_ENABLED_STATE_ENABLED
        else
          PackageManager.COMPONENT_ENABLED_STATE_DISABLED

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          packageManager.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
        } else {
          @Suppress("DEPRECATION")
          packageManager.setComponentEnabledSetting(component, state, PackageManager.DONT_KILL_APP)
        }
      }

      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("ICON_SWITCH_FAILED", e.message ?: "Unknown error", e)
    }
  }

  @ReactMethod
  fun setFlagSecure(enabled: Boolean, promise: Promise) {
    val activity = reactContext.currentActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "Activity not available")
      return
    }
    // @ReactMethod bodies run on a background thread by default, but
    // Window/View mutations are UI-thread-only — calling addFlags/clearFlags
    // directly here throws android.view.ViewRootImpl.CalledFromWrongThreadException
    // ("Only the original thread that created a view hierarchy can touch its
    // views"), silently caught below every single time on a real device.
    // Found on-device (2026-08-29 Phase E pass): this meant the S-9
    // screenshot-protection feature — on by default — never actually applied
    // FLAG_SECURE at all. Fixed by hopping to the UI thread via
    // Activity.runOnUiThread, matching how setIcon above is already safe
    // (setComponentEnabledSetting is not a View/Window API, so it never had
    // this problem).
    activity.runOnUiThread {
      try {
        if (enabled) {
          activity.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        } else {
          activity.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("FLAG_SECURE_FAILED", e.message ?: "Unknown error", e)
      }
    }
  }
}
`;

const DISGUISE_ICON_PACKAGE_KT = `package com.anonymous.depositoseguro

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class DisguiseIconPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(DisguiseIconModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`;

const ICON_THEMES = ['black-white', 'black-orange', 'black-red'];
const DENSITIES = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];

// Android file-based resource names (mipmap PNG filenames, and the
// @mipmap/<name> references to them) may only contain lowercase a-z, 0-9,
// and underscore — aapt2 rejects a hyphen outright. `calculator-icon-${theme}`
// is a valid *asset* filename (assets/icons/calculator-icons/ isn't a
// resource directory) but not a valid *resource* filename once copied into
// android/app/src/main/res/mipmap-*/. Route every mipmap filename and every
// manifest icon reference through this so they can't drift out of sync.
function mipmapResourceName(theme) {
  return `calculator_icon_${theme.replace(/-/g, '_')}`;
}

function withDisguiseIconNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const javaDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        PACKAGE_PATH
      );
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(path.join(javaDir, 'DisguiseIconModule.kt'), DISGUISE_ICON_MODULE_KT);
      fs.writeFileSync(path.join(javaDir, 'DisguiseIconPackage.kt'), DISGUISE_ICON_PACKAGE_KT);

      const iconSrcDir = path.join(config.modRequest.projectRoot, 'assets/icons/calculator-icons');
      for (const theme of ICON_THEMES) {
        const srcFile = path.join(iconSrcDir, `calculator-icon-${theme}.png`);
        if (!fs.existsSync(srcFile)) {
          console.warn(`[withDisguiseIcon] missing source icon: ${srcFile}`);
          continue;
        }
        for (const density of DENSITIES) {
          const destDir = path.join(
            config.modRequest.platformProjectRoot,
            `app/src/main/res/mipmap-${density}`
          );
          fs.mkdirSync(destDir, { recursive: true });
          // Android file-based resource names must be lowercase a-z/0-9/underscore
          // only — a hyphen (as the source asset filenames use, and as this used
          // to copy straight through) makes aapt2 reject the whole resource merge
          // with "'-' is not a valid file-based resource name character", which
          // only ever surfaces on an actual native build (never caught by
          // tsc/eslint/jest — see plans/what-are-the-next-jaunty-deer.md's Phase E
          // notes). mipmapResourceName() below applies the same substitution here
          // and to the manifest's @mipmap/... references so the two stay in sync.
          fs.copyFileSync(srcFile, path.join(destDir, `${mipmapResourceName(theme)}.png`));
        }
      }

      return config;
    },
  ]);
}

function withDisguiseIconPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    const marker = 'add(DisguiseIconPackage())';
    if (!config.modResults.contents.includes(marker)) {
      const before = config.modResults.contents;
      config.modResults.contents = config.modResults.contents.replace(
        /(PackageList\(this\)\.packages\.apply \{\n)([ \t]*)/,
        (_match, open, indent) => `${open}${indent}  ${marker}\n${indent}`
      );
      if (config.modResults.contents === before) {
        console.warn(
          '[withDisguiseIcon] could not find PackageList(this).packages.apply { ... } block in MainApplication.kt — DisguiseIconPackage was NOT registered. Manual patch required.'
        );
      }
    }
    return config;
  });
}

function withDisguiseIconManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const app = manifest.application[0];

    // S-2 remediation: stop android:allowBackup from exposing app-private
    // storage (including the plaintext-secret AsyncStorage blob) via
    // `adb backup`/OEM cloud backup.
    app.$['android:allowBackup'] = 'false';

    if (!app['activity-alias']) app['activity-alias'] = [];

    const desiredAliases = [
      { name: '.MainActivityAliasDefault', icon: '@mipmap/ic_launcher', enabled: 'true' },
      { name: '.MainActivityAliasWhite', icon: `@mipmap/${mipmapResourceName('black-white')}`, enabled: 'false' },
      { name: '.MainActivityAliasOrange', icon: `@mipmap/${mipmapResourceName('black-orange')}`, enabled: 'false' },
      { name: '.MainActivityAliasRed', icon: `@mipmap/${mipmapResourceName('black-red')}`, enabled: 'false' },
    ];

    for (const alias of desiredAliases) {
      const exists = app['activity-alias'].some((a) => a.$['android:name'] === alias.name);
      if (exists) continue;
      app['activity-alias'].push({
        $: {
          'android:name': alias.name,
          'android:icon': alias.icon,
          'android:enabled': alias.enabled,
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }

    return config;
  });
}

/** @type {import('expo/config-plugins').ConfigPlugin} */
module.exports = function withDisguiseIcon(config) {
  config = withDisguiseIconNativeFiles(config);
  config = withDisguiseIconPackageRegistration(config);
  config = withDisguiseIconManifest(config);
  return config;
};
