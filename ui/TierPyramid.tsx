/**
 * The pyramid itself — all six tiers, always visible.
 * T5 (human) at the top, T0 (autonomous) at the bottom. Empty rows stay
 * so the shape does not collapse when today's queue skipped a rung.
 *
 * When `onSelect` is passed the rungs are the filter: click to keep one
 * tier, click again to show the whole queue.
 */
import { countByTier, tierMeta, type UiLang } from '../src/dashboard';

export function TierPyramid<T>({
  items,
  tierOf,
  lang = 'en',
  selected = null,
  onSelect,
}: {
  items: readonly T[];
  tierOf: (item: T) => number;
  lang?: UiLang;
  selected?: number | null;
  onSelect?: (tier: number | null) => void;
}) {
  const rows = countByTier(items, tierOf);
  const title = lang === 'fr' ? 'Pyramide de subsidiarité' : 'Subsidiarity pyramid';
  const hint = onSelect
    ? lang === 'fr'
      ? 'Clique un palier pour filtrer · reclique pour tout voir'
      : 'Click a rung to filter · click again to show all'
    : null;
  const interactive = Boolean(onSelect);

  return (
    <div className={interactive ? 'sub-pyramid is-interactive' : 'sub-pyramid'}>
      <p className="sub-kicker">{title}</p>
      {hint && <p className="sub-pyramid-hint">{hint}</p>}
      <ol
        className="sub-pyramid-stack"
        role={interactive ? 'listbox' : 'list'}
        aria-label={title}
        aria-orientation="vertical"
      >
        {[...rows].reverse().map(({ tier, count }) => {
          const meta = tierMeta(tier, lang);
          const [code, rest] = meta.label.split(' · ');
          const active = selected === tier;
          const cls = [
            'sub-pyramid-row',
            count === 0 ? 'is-empty' : '',
            active ? 'is-active' : '',
          ]
            .filter(Boolean)
            .join(' ');
          const width = `${100 - tier * 9}%`;
          const inner = (
            <>
              <span className="sub-pyramid-code">{code}</span>
              <span className="sub-pyramid-n">{count}</span>
              <span className="sub-pyramid-why">{rest ?? meta.explanation}</span>
            </>
          );
          if (!interactive) {
            return (
              <li key={tier} className={cls} style={{ width }} title={meta.explanation}>
                {inner}
              </li>
            );
          }
          return (
            <li key={tier} style={{ width }}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                disabled={count === 0 && !active}
                className={cls}
                title={meta.explanation}
                onClick={() => onSelect?.(active ? null : tier)}
              >
                {inner}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
