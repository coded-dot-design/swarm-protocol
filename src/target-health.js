// A solid health fill. Lower health gives the beacon a slower cadence.
export function targetSignal(health, powerColor = '#06c4ff') {
  const fill = Math.max(0, Math.min(100, health));
  return {
    fill: Math.round(fill * 10) / 10,
    color: fill > 60 ? powerColor : fill > 25 ? '#cdde00' : '#f4457a',
    period: .7 + 2.1 * (1 - fill / 100),
  };
}

// A short, damped ripple is painted only after a bite, at a bounded cadence.
// The SVG is a background layer, so labels, icons and click targets stay intact.
export function liquidFill(fill, color, energy = 0, time = 0, bite = .5, opacity = 1, bubbles = null) {
  if (!bubbles && opacity === 1 && (energy <= 0 || fill <= 0 || fill >= 100)) {
    return `linear-gradient(to top,${color} 0%,${color} ${fill}%,transparent ${fill}%,transparent 100%)`;
  }
  const level = 100 - fill;
  let path = `M0 ${level}H100V100H0Z`;
  if (energy > 0 && fill > 0 && fill < 100) {
    const amplitude = Math.min(7, fill * .45, level * .45) * energy * energy;
    const points = Array.from({ length: 7 }, (_, i) => {
      const x = i * 100 / 6;
      const distance = Math.abs(x / 100 - bite);
      const dip = Math.exp(-distance * distance * 28) * Math.exp(-time * 12);
      const wave = Math.sin(distance * 15 - time * 20) * (1 - Math.exp(-time * 16));
      const y = level + amplitude * (dip + wave * .55);
      return [x, y];
    });
    path = `M0 ${points[0][1].toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1], next = points[i];
      const middle = ((previous[0] + next[0]) / 2).toFixed(2);
      path += `C${middle} ${previous[1].toFixed(2)} ${middle} ${next[1].toFixed(2)} ${next[0].toFixed(2)} ${next[1].toFixed(2)}`;
    }
    path += 'L100 100H0Z';
  }
  // Three tiny circles are clipped inside the liquid, behind the real label.
  // Positions are deterministic: decorative motion never changes game RNG.
  let circles = '';
  if (bubbles && fill > 0) {
    for (let i = 0; i < 3; i++) {
      const phase = (bubbles.time * .22 + i / 3) % 1;
      const x = 14 + i * 34 + Math.sin(bubbles.time * 1.3 + i * 2) * 3;
      const y = 100 - phase * fill;
      const radius = 1.5 + i * .4;
      circles += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(radius / bubbles.width * 100).toFixed(2)}" ry="${(radius / bubbles.height * 100).toFixed(2)}" fill="${bubbles.color}" fill-opacity="${(.32 * Math.sin(phase * Math.PI)).toFixed(2)}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><clipPath id="l"><path d="${path}"/></clipPath></defs><g opacity="${opacity}" clip-path="url(#l)"><rect width="100" height="100" fill="${color}"/>${circles}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
