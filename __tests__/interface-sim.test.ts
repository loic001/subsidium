/**
 * The prices of principles 17, 18 and 19, in a closed world. Seeded and
 * deterministic: these numbers are what PRINCIPLES.md quotes.
 */
import { describe, expect, it } from 'vitest';
import {
  averageOver,
  defaultBridgeWorld,
  defaultDriftWorld,
  defaultSeamWorld,
  simulateBridge,
  simulateReconcile,
  simulateRepair,
} from '../src/interface-sim';

const SEEDS = [11, 42, 137, 1001, 9090];

describe('17 · repair the costliest seams, not the loudest', () => {
  const run = (p: Parameters<typeof simulateRepair>[0]) => averageOver((s) => simulateRepair(p, defaultSeamWorld(), s), SEEDS);
  const none = run('none');
  const volume = run('by_volume');
  const silenceFree = run('by_price_silence_free');
  const price = run('by_price');

  it('is reproducible', () => {
    expect(simulateRepair('by_price', defaultSeamWorld(), 42)).toEqual(simulateRepair('by_price', defaultSeamWorld(), 42));
  });

  it('price beats price-with-free-silence beats volume, and every policy beats doing nothing', () => {
    expect(none.saved).toBe(0);
    expect(price.saved).toBeGreaterThan(silenceFree.saved);
    expect(silenceFree.saved).toBeGreaterThan(volume.saved);
    expect(volume.saved).toBeGreaterThan(0);
  });

  it('pins the quoted numbers', () => {
    expect(none.totalCost).toBe(778537.8);
    expect(volume.saved).toBe(138975.8);
    expect(silenceFree.saved).toBe(149954.8);
    expect(price.saved).toBe(152723.4);
  });
});

describe('18 · watch the divergence and reconcile', () => {
  const blind = averageOver((s) => simulateReconcile('blind', defaultDriftWorld(), s), SEEDS);
  const watch = averageOver((s) => simulateReconcile('watch', defaultDriftWorld(), s), SEEDS);

  it('cuts drifted decisions by most of an order of magnitude, with no false alarm on honest noise', () => {
    expect(blind).toEqual({ driftedDecisions: 273, reconciliations: 0, falseAlarms: 0 });
    expect(watch).toEqual({ driftedDecisions: 31.8, reconciliations: 2.8, falseAlarms: 0 });
  });

  it('honest judgement under the ceiling never triggers a reconciliation', () => {
    const quiet = averageOver((s) => simulateReconcile('watch', { ...defaultDriftWorld(), driftChance: 0 }, s), SEEDS);
    expect(quiet.reconciliations).toBe(0);
  });

  it('noise over the ceiling is flagged as such: a false alarm, counted', () => {
    const loud = simulateReconcile('watch', { ...defaultDriftWorld(), driftChance: 0, noise: 0.3 }, 42);
    expect(loud.falseAlarms).toBeGreaterThan(0);
    expect(loud.falseAlarms).toBe(loud.reconciliations);
  });
});

describe('19 · spread the only bridge', () => {
  const ignore = averageOver((s) => simulateBridge('ignore', defaultBridgeWorld(), s), SEEDS);
  const spread = averageOver((s) => simulateBridge('spread', defaultBridgeWorld(), s), SEEDS);

  it('a flagged and spread group waits a fraction of what a one-person group waits', () => {
    expect(ignore).toEqual({ waitHours: 4760, flaggedWeeks: 26 });
    expect(spread).toEqual({ waitHours: 296, flaggedWeeks: 3.4 });
  });

  it('a group already spread is never flagged', () => {
    const r = simulateBridge('ignore', { ...defaultBridgeWorld(), topShare: 0.2 }, 42);
    expect(r.flaggedWeeks).toBe(0);
  });
});
