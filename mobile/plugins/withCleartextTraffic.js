const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['tools:replace'] = 'android:usesCleartextTraffic';

    const manifest = config.modResults.manifest;
    if (!manifest.$) manifest.$ = {};
    if (!String(manifest.$['xmlns:tools'] || '').includes('android.com/tools')) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    return config;
  });
};
