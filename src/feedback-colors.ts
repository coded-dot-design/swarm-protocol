// Internal canvas feedback palettes. The host follows the system color scheme.
const light = {
  outline: '#ffffff',
  kill: '#127646', hit: '#036c8f', miss: '#384858',
  shards: ['#b42332', '#8523a7', '#5140b5'],
};
const dark = {
  outline: '#101010',
  kill: '#74dfa1', hit: '#06c4ff', miss: '#ecfcff',
  shards: ['#ff6b6b', '#d984ff', '#8573ee'],
};

export function feedbackColors(darkMode: boolean) {
  return darkMode ? dark : light;
}
