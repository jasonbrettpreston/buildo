'use strict';
/**
 * reanimated-shim.js — Expo Go / Maestro testing compat layer.
 *
 * react-native-reanimated 4.x ships a TurboModule whose native binary is
 * NOT bundled in Expo Go for SDK 54. Running any import of the real package
 * crashes with "installTurboModule called with 1 arguments (expected 0)".
 *
 * This shim provides JS-only stand-ins for every reanimated API the mobile
 * app uses. Animations don't play — shared values settle immediately at their
 * target — but all UI renders correctly and Maestro can interact with it.
 *
 * Wired via metro.config.js resolver.extraNodeModules.
 * Remove the extraNodeModules entry once a real dev build is available.
 */
const React = require('react');
const { View } = require('react-native');

// ─── Shared values ─────────────────────────────────────────────────────────

function useSharedValue(initialValue) {
  const ref = React.useRef({ value: initialValue });
  return ref.current;
}

// Module-level equivalent (used in tabBarStore.ts outside React components).
function makeMutable(initialValue) {
  return { value: initialValue };
}

// ─── Animation builders (return target value immediately) ──────────────────

function withTiming(toValue) { return toValue; }
function withSpring(toValue) { return toValue; }
function withRepeat(animation) { return animation; }
function withSequence(...animations) {
  return animations.length > 0 ? animations[animations.length - 1] : 0;
}
function withDelay(_delayMs, animation) { return animation; }
function cancelAnimation() {}
function runOnJS(fn) { return fn; }
function runOnUI(fn) { return fn; }

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  in: (fn) => fn,
  out: (fn) => fn,
  inOut: (fn) => fn,
  bezier: () => (t) => t,
};

// ─── Hooks ─────────────────────────────────────────────────────────────────

function useAnimatedStyle(fn) {
  try { return fn(); } catch (_e) { return {}; }
}

function useAnimatedProps(fn) {
  try { return fn(); } catch (_e) { return {}; }
}

function useAnimatedScrollHandler() { return {}; }
function useAnimatedRef() { return React.useRef(null); }
function useDerivedValue(fn) {
  const ref = React.useRef({ value: undefined });
  try { ref.current.value = fn(); } catch (_e) {}
  return ref.current;
}

// ─── Animated namespace (mirrors RN's Animated surface) ───────────────────

const ReanimatedAnimated = {
  View: View,
  Text: require('react-native').Text,
  Image: require('react-native').Image,
  ScrollView: require('react-native').ScrollView,
  FlatList: require('react-native').FlatList,
  createAnimatedComponent: (component) => component,
};

// ─── Interpolation ─────────────────────────────────────────────────────────

function interpolate(value, inputRange, outputRange) {
  if (inputRange.length < 2 || outputRange.length < 2) return outputRange[0];
  const [inMin, inMax] = [inputRange[0], inputRange[inputRange.length - 1]];
  const [outMin, outMax] = [outputRange[0], outputRange[outputRange.length - 1]];
  if (inMax === inMin) return outMin;
  const ratio = (value - inMin) / (inMax - inMin);
  return outMin + ratio * (outMax - outMin);
}

const Extrapolation = { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' };

// ─── Exports ───────────────────────────────────────────────────────────────

module.exports = {
  default: ReanimatedAnimated,
  useSharedValue,
  makeMutable,
  useAnimatedStyle,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedRef,
  useDerivedValue,
  withTiming,
  withSpring,
  withRepeat,
  withSequence,
  withDelay,
  cancelAnimation,
  runOnJS,
  runOnUI,
  Easing,
  interpolate,
  Extrapolation,
  // Expose the Animated namespace on the default too
  Animated: ReanimatedAnimated,
};
