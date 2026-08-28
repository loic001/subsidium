/**
 * Thread lifecycle: reframe, never force. The incidents behind these tests
 * are real — a merchant received the same message several times, and a team
 * member asked in writing to stop receiving automated DMs.
 */
import { describe, expect, it } from 'vitest';
import { nextMove, transition } from '../src/thread';
import type { ThreadState } from '../src/types';

const fresh: ThreadState = { status: 'awaiting_reply', nudgesSinceReply: 0, framesTried: 0 };

describe('nextMove — the anti-rigidity-trap gate', () => {
  it('a fresh awaiting thread may nudge once', () => {
    expect(nextMove(fresh)).toEqual({ move: 'nudge' });
  });

  it('after the nudge budget, the SAME frame can never be forced again', () => {
    const nudged = transition(fresh, { kind: 'nudged' });
    const move = nextMove(nudged);
    expect(move.move).toBe('reframe');
    // The reason names the law, so the UI can display it.
    if (move.move === 'reframe') expect(move.reason).toContain('more force at the same level never works');
  });

  it('a reframe resets the nudge budget — it IS a new conversation move', () => {
    const nudged = transition(fresh, { kind: 'nudged' });
    const reframed = transition(nudged, { kind: 'reframed' });
    expect(reframed.nudgesSinceReply).toBe(0);
    expect(reframed.framesTried).toBe(1);
    expect(nextMove(reframed)).toEqual({ move: 'nudge' });
  });

  it('after maxFrames the thread must close — the topic is exhausted, not the counterpart', () => {
    let s = fresh;
    // frame 1: nudge, reframe → frame 2: nudge, reframe → frame 3: nudge…
    s = transition(s, { kind: 'nudged' });
    s = transition(s, { kind: 'reframed' });
    s = transition(s, { kind: 'nudged' });
    s = transition(s, { kind: 'reframed' });
    s = transition(s, { kind: 'nudged' });
    const move = nextMove(s);
    expect(move.move).toBe('close');
  });

  it('nudging someone who just replied is noise: answered = wait', () => {
    const answered = transition(fresh, { kind: 'counterpart_replied' });
    expect(nextMove(answered)).toEqual({ move: 'wait' });
  });

  it('a reply resets the nudge counter', () => {
    const nudged = transition(fresh, { kind: 'nudged' });
    const answered = transition(nudged, { kind: 'counterpart_replied' });
    expect(answered.nudgesSinceReply).toBe(0);
  });

  it('resolved and abandoned threads are inert', () => {
    expect(nextMove(transition(fresh, { kind: 'goal_reached' }))).toEqual({ move: 'wait' });
    expect(nextMove(transition(fresh, { kind: 'closed' }))).toEqual({ move: 'wait' });
  });
});
