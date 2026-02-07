import { describe, expect, it } from 'vitest';
import { ASPECT_RATIO_OPTIONS, STYLE_PRESETS } from '../src/services/stylePresets';

describe('style presets', () => {
  it('contains at least ten style options', () => {
    expect(STYLE_PRESETS.length).toBeGreaterThanOrEqual(10);
  });

  it('contains common aspect ratio options', () => {
    expect(ASPECT_RATIO_OPTIONS).toContain('1:1');
    expect(ASPECT_RATIO_OPTIONS).toContain('16:9');
    expect(ASPECT_RATIO_OPTIONS).toContain('9:16');
  });
});
