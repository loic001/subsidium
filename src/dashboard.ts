/**
 * subsidium · dashboard primitives (pure)
 *
 * The visual layer is built FROM these, never the other way around. Plug a
 * host system into the kernel (channels, actions, subjects, a queue) and
 * these helpers are what the embeddable UI uses to render the pyramid,
 * the inbox bands, and the escalation briefing — without knowing merchants,
 * Slack, or any host product.
 */
import type { Tier } from './types';

export type UiLang = 'en' | 'fr';

export interface EscalationBriefData {
  subject: { name: string; domain?: string | null; blocker?: string | null };
  ask: { body: string; recipient?: string | null };
  problem?: {
    explanation?: string | null;
    recommendation?: string | null;
    confidence?: number | null;
  };
  pyramid: { tier: number; mode: string; reasons: string[]; why: string };
  timeline: Array<{ at: string; kind: string; summary: string }>;
  refs?: string[];
  lang?: UiLang;
}

export interface TierMeta {
  label: string;
  explanation: string;
}

const META: Record<Tier, Record<UiLang, TierMeta>> = {
  0: {
    en: { label: 'T0 · silent', explanation: 'acts and logs — should not appear in a human queue' },
    fr: { label: 'T0 · silencieuse', explanation: 'agit et journalise — ne devrait pas apparaître ici' },
  },
  1: {
    en: { label: 'T1 · notified', explanation: 'acts, then tells — should not appear in a human queue' },
    fr: { label: 'T1 · notifiée', explanation: 'agit puis raconte — ne devrait pas apparaître ici' },
  },
  2: {
    en: {
      label: 'T2 · veto candidates',
      explanation: 'irreversible but INTERNAL — fires unless a human objects',
    },
    fr: {
      label: 'T2 · candidates au veto',
      explanation: 'irréversibles mais INTERNES — partent sauf opposition',
    },
  },
  3: {
    en: {
      label: 'T3 · consent',
      explanation: 'irreversible and visible OUTSIDE — an explicit click stays required',
    },
    fr: {
      label: 'T3 · consentement',
      explanation: 'irréversibles et visibles DEHORS — un clic restera toujours requis',
    },
  },
  4: {
    en: {
      label: 'T4 · human decision',
      explanation: 'no known right answer — the system prepares the file, a human decides',
    },
    fr: {
      label: 'T4 · décision humaine',
      explanation: 'pas de bonne réponse connue — le système prépare le dossier, un humain décide',
    },
  },
  5: {
    en: { label: 'T5 · out of scope', explanation: 'the system only signals' },
    fr: { label: 'T5 · hors périmètre', explanation: 'le système ne fait que signaler' },
  },
};

function asTier(n: number): Tier {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  if (n === 4) return 4;
  return 5;
}

/** Labels + why-this-band-exists, for inbox headers and chips. */
export function tierMeta(tier: number, lang: UiLang = 'en'): TierMeta {
  return META[asTier(tier)][lang];
}

/**
 * Why this item rose the pyramid to a human. The automatic tiers failed to
 * absorb it — that sentence is the product. Derived from the tier, never
 * invented per host.
 */
export function whyEscalated(tier: number, lang: UiLang = 'en'): string {
  const t = asTier(tier);
  if (lang === 'fr') {
    if (t <= 1) {
      return "Ceci aurait dû rester automatique (T0–T1). Un humain le voit parce que le palier inférieur n'a pas pu l'absorber.";
    }
    if (t === 2) {
      return "Les paliers automatiques (T0–T1) n'ont pas pu traiter ça : l'action est irréversible, même si elle reste interne. Elle a remonté la pyramide jusqu'à vous — cette page est l'historique qui a rendu l'escalade nécessaire.";
    }
    if (t === 3) {
      return "Visible dehors et irréversible : le système ne peut pas agir sans un humain. Ça n'a pas pu rester dans la pyramide automatique — d'où ce message.";
    }
    return "Pas de bonne réponse connue en bas de la pyramide. Le système a préparé le dossier ; c'est à vous de décider.";
  }
  if (t <= 1) {
    return 'This should have stayed automatic (T0–T1). A human is seeing it because the lower tier could not absorb it.';
  }
  if (t === 2) {
    return 'The automatic tiers (T0–T1) could not take this: the action is irreversible, even though it stays inside the team. It rose the pyramid to you — this page is the history that made that necessary.';
  }
  if (t === 3) {
    return 'Externally visible and irreversible: the system cannot act without a human. It could not stay in the automatic pyramid — that is why you got this message.';
  }
  return 'No known right answer at the lower tiers. The system prepared the file; a human decides.';
}

/**
 * Band a queue from the bottom of the pyramid (most autonomous) to the top
 * (most human). Empty bands are omitted — a vacant T0 must not take space.
 */
export function bandByTier<T>(
  items: readonly T[],
  tierOf: (item: T) => number,
): Array<{ tier: number; items: T[] }> {
  const bands = new Map<number, T[]>();
  for (const item of items) {
    const t = asTier(tierOf(item));
    const arr = bands.get(t) ?? [];
    arr.push(item);
    bands.set(t, arr);
  }
  return [...bands.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, grouped]) => ({ tier, items: grouped }));
}

/**
 * All six tiers, always — empty included. The overview pyramid must not
 * vanish just because today's queue skipped T0.
 */
export function countByTier<T>(
  items: readonly T[],
  tierOf: (item: T) => number,
): Array<{ tier: number; count: number }> {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const item of items) counts[asTier(tierOf(item))]++;
  return counts.map((count, tier) => ({ tier, count }));
}
