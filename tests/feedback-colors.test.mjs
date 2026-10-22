import test from 'node:test';
import assert from 'node:assert/strict';
import { feedbackColors } from '../src/feedback-colors.js';

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(first, second) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

for (const [name, dark, surface] of [['light', false, '#ffffff'], ['dark', true, '#101010']]) {
  test(`${name} feedback has readable scores and distinct bursts`, () => {
    const colors = feedbackColors(dark);
    const minimumScoreContrast = dark ? 7 : 3; // Light mode uses the approved brand pink.
    assert.ok(contrast(colors.score, surface) >= minimumScoreContrast, 'Opaque scores meet the palette contrast floor');
    assert.ok(contrast(colors.score, colors.outline) >= minimumScoreContrast, 'The outline separates scores from mixed page content');
    for (const color of [colors.kill, colors.hit, colors.miss, ...colors.shards]) {
      assert.ok(contrast(color, surface) >= 3, `${color} remains visible on ${surface}`);
    }
  });
}

test('missing system color-scheme support uses the light palette', () => {
  assert.equal(feedbackColors(undefined), feedbackColors(false));
});
