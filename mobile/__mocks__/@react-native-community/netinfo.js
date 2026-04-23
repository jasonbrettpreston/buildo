// Jest mock for @react-native-community/netinfo.
// useNetInfo returns online=true by default so tests behave like a connected device.
// Call netInfoMock.setConnected(false) from a test to simulate offline.
'use strict';

let _connected = true;
const _listeners = new Set();

const netInfoMock = {
  setConnected: (val) => {
    _connected = val;
    _listeners.forEach((fn) => fn({ isConnected: val, isInternetReachable: val }));
  },
};

module.exports = {
  ...netInfoMock,
  default: {
    addEventListener: (listener) => {
      _listeners.add(listener);
      return () => _listeners.delete(listener);
    },
    fetch: () => Promise.resolve({ isConnected: _connected, isInternetReachable: _connected }),
  },
  useNetInfo: () => ({
    isConnected: _connected,
    isInternetReachable: _connected,
    type: _connected ? 'wifi' : 'none',
    details: null,
  }),
  NetInfoStateType: { none: 'none', wifi: 'wifi', cellular: 'cellular', unknown: 'unknown' },
};
