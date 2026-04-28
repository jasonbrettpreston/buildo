const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const config = getDefaultConfig(__dirname);

const finalConfig = withNativeWind(config, { input: './global.css' });

// Redirect react-native-reanimated to a JS-only shim for Expo Go / Maestro
// testing. The real package requires a compiled TurboModule binary that Expo
// Go for SDK 54 does not bundle (4.x vs 3.x arity mismatch on installTurboModule).
// Remove this override once a proper dev build (npx expo run:android) is available.
finalConfig.resolver.extraNodeModules = {
  ...finalConfig.resolver.extraNodeModules,
  'react-native-reanimated': path.resolve(__dirname, 'src/mocks/reanimated-shim.js'),
};

module.exports = finalConfig;
