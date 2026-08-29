import { describe, expect, it } from 'vitest';
import { bandByTier, tierMeta, whyEscalated } from '../src/dashboard';

describe('tierMeta', () => {
  it('labels every tier in both languages', () => {
    for (const t of [0, 1, 2, 3, 4, 5] as const) {
      expect(tierMeta(t, 'en').label).toMatch(/^T/);
      expect(tierMeta(t, 'fr').label).toMatch(/^T/);
      expect(tierMeta(t, 'en').explanation.length).toBeGreaterThan(0);
    }
  });

  it('clamps out of range to T0 / T5', () => {
    expect(tierMeta(-3).label).toMatch(/^T0/);
    expect(tierMeta(99).label).toMatch(/^T5/);
  });
});

describe('whyEscalated', () => {
  it('T0–T1: should have stayed automatic', () => {
    expect(whyEscalated(0)).toMatch(/automatic/);
    expect(whyEscalated(1, 'fr')).toMatch(/automatique/);
  });

  it('T2: rose because irreversible and internal', () => {
    expect(whyEscalated(2)).toMatch(/irreversible/);
    expect(whyEscalated(2, 'fr')).toMatch(/pyramide/);
  });

  it('T3: externally visible', () => {
    expect(whyEscalated(3)).toMatch(/Externally visible/);
    expect(whyEscalated(3, 'fr')).toMatch(/Visible dehors/);
  });

  it('T4–T5: no known right answer', () => {
    expect(whyEscalated(4)).toMatch(/No known right answer/);
    expect(whyEscalated(5, 'fr')).toMatch(/Pas de bonne réponse/);
  });
});

describe('bandByTier', () => {
  it('sorts low to high and omits empty bands', () => {
    const bands = bandByTier(
      [
        { id: 'c', t: 3 },
        { id: 'a', t: 2 },
        { id: 'b', t: 2 },
      ],
      (x) => x.t,
    );
    expect(bands.map((b) => b.tier)).toEqual([2, 3]);
    expect(bands[0].items.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('clamps unknown tiers into the pyramid', () => {
    const bands = bandByTier([{ t: 9 }], (x) => x.t);
    expect(bands).toEqual([{ tier: 5, items: [{ t: 9 }] }]);
  });
});
