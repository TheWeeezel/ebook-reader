// Test-only stubs for backend config.
jest.mock('./config/backend', () => ({
  BACKEND_URL: 'https://backend.test',
}));

// Stub vector icons so we don't need expo-font runtime state in tests.
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  return {
    Ionicons: (props: any) => React.createElement('Icon', props, props.name),
  };
});
