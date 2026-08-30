/**
 * The pyramid itself — all six tiers, always visible.
 * T5 (human) at the top, T0 (autonomous) at the bottom. Empty rows stay
 * so the shape does not collapse when today's queue skipped a rung.
 */
import { countByTier, tierMeta, type UiLang } from '../src/dashboard';

export function TierPyramid<T>({
  items,
  tierOf,
  lang = 'en',
}: {
  items: readonly T[];
  tierOf: (item: T) => number;
  lang?: UiLang;
}) {
  const rows = countByTier(items, tierOf);
  const title = lang === 'fr' ? 'Pyramide de subsidiarité' : 'Subsidiarity pyramid';
  return (
    <div className="sub-pyramid" role="img" aria-label={title}>
      <p className="sub-kicker">{title}</p>
      <ol className="sub-pyramid-stack">
        {[...rows].reverse().map(({ tier, count }) => {
          const meta = tierMeta(tier, lang);
          const [code, rest] = meta.label.split(' · ');
          return (
            <li
              key={tier}
              className={count === 0 ? 'sub-pyramid-row is-empty' : 'sub-pyramid-row'}
              style={{ width: `${100 - tier * 9}%` }}
              title={meta.explanation}
            >
              <span className="sub-pyramid-code">{code}</span>
              <span className="sub-pyramid-n">{count}</span>
              <span className="sub-pyramid-why">{rest ?? meta.explanation}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
