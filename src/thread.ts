/**
 * subsidium · thread lifecycle
 *
 * A thread is scoped to a SUBJECT AND A TOPIC — never to a place or a
 * person. Two laws govern it, both learned the hard way:
 *
 *  ANTI-SCHISMOGENESIS (Bateson): two polite parties can loop forever.
 *  Exchanges are capped; when the cap is hit the ORACLE (the framework's
 *  rules) arbitrates — the participants never do.
 *
 *  REFRAME, NEVER FORCE (Bateson's logical types, measured in panarchy-llm:
 *  decomposition 98% vs escalation 90%): with a human counterpart,
 *  resampling is not free — repetition has a social cost, and it is
 *  punitive. A stalled thread is never re-nudged identically. The next
 *  move must CHANGE something (channel, counterpart, or question) or close
 *  the thread. `nextMove` encodes exactly that.
 */
import type { ThreadState, ThreadStatus } from './types';

export interface ThreadPolicy {
  /** Nudges allowed on the SAME frame before a reframe is forced. */
  maxNudgesPerFrame: number;
  /** Distinct frames tried before the thread must close. */
  maxFrames: number;
}

export const DEFAULT_THREAD_POLICY: ThreadPolicy = {
  maxNudgesPerFrame: 1,
  maxFrames: 3,
};

export type ThreadEvent =
  | { kind: 'counterpart_replied' }
  | { kind: 'goal_reached' }
  | { kind: 'nudged' }
  | { kind: 'reframed' }
  | { kind: 'stalled' }
  | { kind: 'closed' };

/** Pure transition. Unknown combinations keep the state (never throw mid-flow). */
export function transition(state: ThreadState, event: ThreadEvent): ThreadState {
  switch (event.kind) {
    case 'counterpart_replied':
      return { ...state, status: 'answered', nudgesSinceReply: 0 };
    case 'goal_reached':
      return { ...state, status: 'resolved' };
    case 'nudged':
      return { ...state, status: 'awaiting_reply', nudgesSinceReply: state.nudgesSinceReply + 1 };
    case 'reframed':
      return {
        status: 'awaiting_reply',
        nudgesSinceReply: 0,
        framesTried: state.framesTried + 1,
      };
    case 'stalled':
      return { ...state, status: 'stalled' };
    case 'closed':
      return { ...state, status: 'abandoned' };
  }
}

export type Move =
  | { move: 'wait' }
  | { move: 'nudge' }
  | { move: 'reframe'; reason: string }
  | { move: 'close'; reason: string };

/**
 * What is the thread allowed to do next? This is the anti-rigidity-trap
 * gate: it makes "send the same message again" structurally impossible
 * once the frame is exhausted.
 */
export function nextMove(state: ThreadState, policy: ThreadPolicy = DEFAULT_THREAD_POLICY): Move {
  if (state.status === 'resolved' || state.status === 'abandoned') {
    return { move: 'wait' };
  }
  if (state.status === 'answered') {
    // The ball is in our court; nudging someone who just replied is noise.
    return { move: 'wait' };
  }
  if (state.nudgesSinceReply < policy.maxNudgesPerFrame) {
    return { move: 'nudge' };
  }
  if (state.framesTried + 1 < policy.maxFrames) {
    return {
      move: 'reframe',
      reason:
        `frame exhausted after ${state.nudgesSinceReply} nudge(s): ` +
        'change channel, counterpart, or question — more force at the same level never works',
    };
  }
  return {
    move: 'close',
    reason: `${state.framesTried + 1} frames tried without a reply: the topic is exhausted, not the counterpart`,
  };
}

export const THREAD_STATUSES: readonly ThreadStatus[] = [
  'awaiting_reply',
  'answered',
  'stalled',
  'resolved',
  'abandoned',
];
