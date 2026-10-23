// A solid health fill. Lower health gives the beacon a slower cadence.
export function targetSignal(health) {
  const fill = Math.max(0, Math.min(100, health));
  return {
    fill: Math.round(fill * 10) / 10,
    color: fill > 60 ? '#74dfa1' : fill > 25 ? '#cdde00' : '#f4457a',
    period: .7 + 2.1 * (1 - fill / 100),
  };
}

// A short, damped ripple is painted only after a bite, at a bounded cadence.
// The SVG is a background layer, so labels, icons and click targets stay intact.
export function liquidFill(fill, color, energy = 0, time = 0, bite = .5) {
  if (energy <= 0 || fill <= 0 || fill >= 100) {
    return `linear-gradient(to top,${color} 0%,${color} ${fill}%,transparent ${fill}%,transparent 100%)`;
  }
  const level = 100 - fill;
  const amplitude = Math.min(7, fill * .45, level * .45) * energy * energy;
  const points = Array.from({ length: 7 }, (_, i) => {
    const x = i * 100 / 6;
    const distance = Math.abs(x / 100 - bite);
    const dip = Math.exp(-distance * distance * 28) * Math.exp(-time * 12);
    const wave = Math.sin(distance * 15 - time * 20) * (1 - Math.exp(-time * 16));
    const y = level + amplitude * (dip + wave * .55);
    return [x, y];
  });
  let path = `M0 ${points[0][1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1], next = points[i];
    const middle = ((previous[0] + next[0]) / 2).toFixed(2);
    path += `C${middle} ${previous[1].toFixed(2)} ${middle} ${next[1].toFixed(2)} ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
  }
  path += 'L100 100H0Z';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path fill="${color}" d="${path}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
