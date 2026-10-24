// Damage colors are independent of the host button's brand color.
export const healthColor = (health: number) => health > 75 ? '#74dfa1' : health > 35 ? '#ffb96b' : '#ff6b6b';
export function fadeSignal(from: string, to: string, progress: number) {
  if (progress >= 1 || from === to) return to;
  if (progress <= 0) return from;
  return `color-mix(in srgb, ${to} ${Math.round(progress * 100)}%, ${from})`;
}
const bubbleRadii = [1.25, 2.2, 3.8, 1.7, 5.2, 3.1];

// A solid health fill. Lower health gives the beacon a slower cadence.
export function targetSignal(health:number, powerColor = '#06c4ff') {
  const fill = Math.max(0, Math.min(100, health));
  return {
    fill: Math.round(fill * 10) / 10,
    color: fill >= 100 ? powerColor : healthColor(fill),
    period: .7 + 2.1 * (1 - fill / 100),
  };
}

// A short, damped ripple is painted only after a bite, at a bounded cadence.
// The SVG is a background layer, so labels, icons and click targets stay intact.
export function liquidFill(fill:number, color:string, energy = 0, time = 0, bite = .5, opacity = 1, bubbles: {time:number;width:number;height:number;color:string} | null = null) {
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
  // Six varied circles are clipped inside the liquid, behind the real label.
  // Positions are deterministic: decorative motion never changes game RNG.
  let circles = '';
  if (bubbles && fill > 0) {
    for (let i = 0; i < 6; i++) {
      const phase = (bubbles.time * (.18 + i * .025) + i / 6) % 1;
      const x = 9 + i * 16 + Math.sin(bubbles.time * 1.8 + i * 2) * 4;
      const y = 100 - phase * fill;
      const radius = bubbleRadii[i];
      circles += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${(radius / bubbles.width * 100).toFixed(2)}" ry="${(radius / bubbles.height * 100).toFixed(2)}" fill="${bubbles.color}" fill-opacity="${(.42 * Math.sin(phase * Math.PI)).toFixed(2)}"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none"><defs><clipPath id="l"><path d="${path}"/></clipPath></defs><g opacity="${opacity}" clip-path="url(#l)"><rect width="100" height="100" fill="${color}"/>${circles}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// Opposite light/dark tone of the native surface, rather than another brand
// color. Computed RGB and hex values cover the common button palettes.
export function bubbleContrast(color:string) {
  const lightness = color.match(/^(oklch|oklab|lch|lab)\(\s*([\d.]+)(%?)/i);
  if (lightness) {
    const level = +lightness[2] / (lightness[3] || !lightness[1].startsWith('ok') ? 100 : 1);
    return level < .6 ? '#ffffff' : '#101010';
  }
  const hex = color.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  const rgb = hex ? (hex.length === 3 ? [...hex].map(c => c + c).join('') : hex).match(/../g)!.map(c => parseInt(c, 16))
    : color.startsWith('color(') ? color.match(/^color\((?:srgb|display-p3)\s+([^)]+)\)/)?.[1].trim().split(/[ /]+/).slice(0, 3).map(c => +c * 255)
    : color.match(/^rgba?\(([^)]+)\)/)?.[1].trim().split(/[, /]+/).slice(0, 3).map(c => parseFloat(c) * (c.endsWith('%') ? 2.55 : 1));
  return rgb?.length === 3 && rgb.every(Number.isFinite) && rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 140 ? '#ffffff' : '#101010';
}
