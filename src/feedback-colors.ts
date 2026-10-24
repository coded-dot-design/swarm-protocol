// Internal canvas feedback palettes. The host follows the system color scheme.
const light = {
  outline: '#151020',
  kill: '#74dfa1', hit: '#06c4ff', miss: '#d984ff',
  shards: ['#ff6b6b', '#d984ff', '#8573ee'],
};
const dark = {
  outline: '#101010',
  kill: '#74dfa1', hit: '#06c4ff', miss: '#ecfcff',
  shards: ['#ff6b6b', '#d984ff', '#8573ee'],
};

export function feedbackColors(darkMode: boolean) {
  return darkMode ? dark : light;
}
