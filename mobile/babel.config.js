module.exports = function (api) {
  // Cache keyed on NODE_ENV so the test env gets its own cache slot.
  api.cache.using(() => process.env.NODE_ENV);
  const isTest = process.env.NODE_ENV === 'test';
  return {
    presets: [
      [
        'babel-preset-expo',
        {
          jsxImportSource: 'nativewind',
          // Disable the Reanimated plugin in Jest — it requires the
          // react-native-worklets peer dep which is not available in the
          // Node test environment. `reanimated: false` suppresses BOTH the
          // react-native-worklets/plugin and react-native-reanimated/plugin
          // auto-injection from babel-preset-expo.
          reanimated: !isTest,
        },
      ],
    ],
    plugins: isTest ? [] : ['react-native-reanimated/plugin'],
  };
};
