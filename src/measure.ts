/**
 * subsidium · honest measurement
 *
 * A SOP claims to move a metric; this module decides whether that claim is
 * TRUE, and refuses the three classic ways of lying with numbers:
 *
 *  A NUMBER WITHOUT n IS A VIBE — every reading carries its sample size,
 *  and below `minN` the only honest verdict is `too_early`, never
 *  "trending well". (n=3 is an anecdote; this framework's authors once
 *  shipped an 81% apparent reply rate that was 11% real.)
 *
 *  THE DEFINITION IS PART OF THE READING — any improvement obtained by
 *  changing WHO or WHAT is counted is a regression wearing a costume.
 *  Two readings taken under different definitions are `not_comparable`,
 *  full stop. Goodhart enters through renamed denominators.
 *
 *  COMPARED TO WHAT? — a metric that moved proves nothing without a
 *  baseline (before, or an untouched control group). `judge` takes both
 *  sides explicitly; there is no single-reading "success" verdict.
 *
 * This is deliberately NOT a significance test — no p-values, no illusion
 * of rigor. It is a coarse honesty gate: enough n, same definition, a
 * difference big enough to act on. For real inference, export the readings.
 */

export interface MetricSpec {
  id: string;
  /**
   * What is counted, precisely — numerator AND denominator ("replies from
   * `them`-side counterparts / threads nudged, 30d window"). This exact
   * string is pinned into every reading; changing it forks the metric.
   */
  definition: string;
  unit: string;
  /** Which direction is better. A metric without a direction is a chart, not a goal. */
  direction: 'up' | 'down';
}

export interface MetricReading {
  metricId: string;
  /** The definition under which the reading was taken (pinned, verbatim). */
  definition: string;
  value: number;
  /** Sample size behind the value. */
  n: number;
}

/** The only way to build a reading: the spec's definition is pinned in. */
export function reading(spec: MetricSpec, value: number, n: number): MetricReading {
  return { metricId: spec.id, definition: spec.definition, value, n };
}

export interface JudgeOptions {
  /** Minimum sample size on EACH side before any verdict beyond too_early. */
  minN: number;
  /** Minimum relative difference to call an effect (0.1 = 10%). */
  minRelDiff: number;
}

export const DEFAULT_JUDGE_OPTIONS: JudgeOptions = {
  minN: 20,
  minRelDiff: 0.1,
};

export type MeasureVerdict = 'not_comparable' | 'too_early' | 'no_effect' | 'improved' | 'regressed';

export interface MeasureResult {
  verdict: MeasureVerdict;
  /** Signed relative difference vs baseline; null when the baseline is 0. */
  relDiff: number | null;
  reason: string;
}

/**
 * Did `treated` beat `baseline` on this metric? `baseline` is the before
 * measurement or the control group — the caller must have one; the absence
 * of a baseline is not a verdict, it is a missing experiment.
 */
export function judge(
  spec: MetricSpec,
  treated: MetricReading,
  baseline: MetricReading,
  opts: JudgeOptions = DEFAULT_JUDGE_OPTIONS,
): MeasureResult {
  if (
    treated.metricId !== spec.id ||
    baseline.metricId !== spec.id ||
    treated.definition !== spec.definition ||
    baseline.definition !== spec.definition
  ) {
    return {
      verdict: 'not_comparable',
      relDiff: null,
      reason:
        'the metric or its definition differs between readings — an improvement obtained by changing what is counted is a regression',
    };
  }

  if (treated.n < opts.minN || baseline.n < opts.minN) {
    return {
      verdict: 'too_early',
      relDiff: null,
      reason: `n=${Math.min(treated.n, baseline.n)} < ${opts.minN} — below this, a difference is an anecdote`,
    };
  }

  const relDiff = baseline.value === 0 ? null : (treated.value - baseline.value) / Math.abs(baseline.value);
  const delta = treated.value - baseline.value;
  const bigEnough = relDiff === null ? delta !== 0 : Math.abs(relDiff) >= opts.minRelDiff;

  if (!bigEnough) {
    return {
      verdict: 'no_effect',
      relDiff,
      reason: `difference below ${Math.round(opts.minRelDiff * 100)}% — not enough to act on`,
    };
  }

  const better = spec.direction === 'up' ? delta > 0 : delta < 0;
  return {
    verdict: better ? 'improved' : 'regressed',
    relDiff,
    reason: relDiff === null ? 'baseline was 0' : `${Math.round(relDiff * 100)}% vs baseline (n=${treated.n}/${baseline.n})`,
  };
}
