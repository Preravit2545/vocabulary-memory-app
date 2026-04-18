import { describe, it, expect } from 'vitest';
import { shuffleDeck } from './shuffle';

describe('shuffleDeck', () => {
  it('returns a new array (does not mutate original)', () => {
    const original = [1, 2, 3, 4, 5];
    const result = shuffleDeck(original);
    expect(result).not.toBe(original);
    expect(original).toEqual([1, 2, 3, 4, 5]);
  });

  it('returns an array with the same elements', () => {
    const original = ['a', 'b', 'c', 'd'];
    const result = shuffleDeck(original);
    expect(result).toHaveLength(original.length);
    expect(result.sort()).toEqual([...original].sort());
  });

  it('handles an empty array', () => {
    expect(shuffleDeck([])).toEqual([]);
  });

  it('handles a single-element array', () => {
    expect(shuffleDeck([42])).toEqual([42]);
  });

  it('works with objects (generic)', () => {
    const cards = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const result = shuffleDeck(cards);
    expect(result).toHaveLength(3);
    expect(result.map(c => c.id).sort()).toEqual([1, 2, 3]);
  });
});
