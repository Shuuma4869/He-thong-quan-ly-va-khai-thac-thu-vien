import { expect, it } from 'vitest';
import { formatDate, formatTime } from './circulation-labels';

it('formats circulation timestamps and dates in the Vietnam business timezone', () => {
  expect(formatTime('2026-10-30T00:00:00Z')).toBe('07:00:00 30/10/2026');
  expect(formatDate('2026-10-30T20:00:00Z')).toBe('31/10/2026');
});
