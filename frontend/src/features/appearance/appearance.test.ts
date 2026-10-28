import { describe, expect, it } from 'vitest';
import { defaults, parseAppearance } from './appearance';

describe('appearance presets', () => {
  it('keeps a saved preset and widget order', () => {
    const value = parseAppearance({ accent: 'teal', bookView: 'list', widgets: ['inventory', 'overview'] });
    expect(value.accent).toBe('teal');
    expect(value.bookView).toBe('list');
    expect(value.widgets).toEqual(['inventory', 'overview']);
  });
  it('ignores invalid CSS-like values and duplicate widgets', () => {
    const value = parseAppearance({ accent: 'url(javascript:evil)', radius: '9999px',
      widgets: ['inventory', 'inventory'] });
    expect(value.accent).toBe(defaults.accent);
    expect(value.radius).toBe(defaults.radius);
    expect(value.widgets).toEqual(defaults.widgets);
  });
});
