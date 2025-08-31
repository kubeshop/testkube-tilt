import { expect, test } from 'vitest';
import { sum } from '../v1/x';

test('adds numbers', () => {
  expect(sum(2, 3)).toBe(5);
});
