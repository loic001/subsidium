/**
 * Inbox bands — a queue grouped by derived tier, bottom of the pyramid first.
 * Host renders each item. The brick owns the band header (label + why).
 */
import type { ReactNode } from 'react';
import { bandByTier, tierMeta, type UiLang } from '../src/dashboard';

export function TierBands<T>({
  items,
  tierOf,
  lang = 'en',
  renderItem,
}: {
  items: readonly T[];
  tierOf: (item: T) => number;
  lang?: UiLang;
  renderItem: (item: T) => ReactNode;
}) {
  const bands = bandByTier(items, tierOf);
  return (
    <>
      {bands.map((band) => {
        const meta = tierMeta(band.tier, lang);
        return (
          <section key={band.tier} className="sub-band">
            <h3>{meta.label}</h3>
            <p>{meta.explanation}</p>
            {band.items.map((item, i) => (
              <div key={i}>{renderItem(item)}</div>
            ))}
          </section>
        );
      })}
    </>
  );
}

export function TierChip({
  tier,
  lang = 'en',
  title,
}: {
  tier: number;
  lang?: UiLang;
  title?: string;
}) {
  const meta = tierMeta(tier, lang);
  return (
    <span className="sub-chip sub-accent" title={title ?? meta.explanation}>
      {meta.label.split(' · ')[0]}
    </span>
  );
}
