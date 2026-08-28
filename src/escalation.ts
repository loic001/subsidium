/**
 * subsidium · escalation compressor
 *
 * Beer's algedonic signal: what ascends the hierarchy when a level failed
 * to absorb. Errors ascend COMPRESSED — never the full context. The tier
 * above needs to know WHAT failed and what was already tried, not to
 * re-read the whole history; handing a human the raw dump is how you spend
 * their attention budget on reading instead of deciding.
 */
import type { EscalationSignal } from './types';

export const MAX_SUMMARY_LENGTH = 300;

export interface AttemptRecord {
  what: string;
  outcome: string;
}

export function buildEscalationSignal(
  subjectId: string,
  about: string,
  attempts: readonly AttemptRecord[],
): EscalationSignal {
  // Most recent first: the freshest failure is the most informative, and
  // the cap will truncate the oldest, not the newest.
  const lines = [...attempts]
    .reverse()
    .map((a) => `${a.what} -> ${a.outcome}`)
    .join(' · ');
  return {
    subjectId,
    about,
    attempts: attempts.length,
    failureSummary: lines.length > MAX_SUMMARY_LENGTH ? `${lines.slice(0, MAX_SUMMARY_LENGTH - 1)}…` : lines,
  };
}
