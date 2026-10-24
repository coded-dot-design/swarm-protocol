// Internal canvas feedback palettes. The host follows the system color scheme.
const light = {
  outline: '#151020',
  kill: '#65ff00', hit: '#00e5ff', miss: '#ff168f',
  shards: ['#ff343b', '#ff168f', '#a855ff'],
};
const dark = {
  outline: '#101010',
  kill: '#65ff00', hit: '#00e5ff', miss: '#ecfcff',
  shards: ['#ff343b', '#ff168f', '#a855ff'],
};

export function feedbackColors(darkMode: boolean) {
  return darkMode ? dark : light;
}
