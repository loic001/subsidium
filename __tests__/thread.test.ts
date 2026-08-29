/**
 * Thread lifecycle: reframe, never force. The incidents behind these tests
 * are real — a merchant received the same message several times, and a team
 * member asked in writing to stop receiving automated DMs.
 */
import { describe, expect, it } from 'vitest';
import {
  nextMove,
  normalizeTopic,
  pickReframe,
  sameThread,
  threadKey,
  threadState,
  transition,
} from '../src/thread';
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

describe('transition — the full state machine', () => {
  it('stalling marks the thread without touching its counters', () => {
    const nudged = transition(fresh, { kind: 'nudged' });
    const stalled = transition(nudged, { kind: 'stalled' });
    expect(stalled).toEqual({ status: 'stalled', nudgesSinceReply: 1, framesTried: 0 });
  });

  it('a stalled thread obeys the same gate: its frame is spent, so it must reframe', () => {
    const stalled = transition(transition(fresh, { kind: 'nudged' }), { kind: 'stalled' });
    expect(nextMove(stalled).move).toBe('reframe');
  });

  it('a stalled thread with a fresh frame may still nudge once', () => {
    const stalled = transition(fresh, { kind: 'stalled' });
    expect(nextMove(stalled)).toEqual({ move: 'nudge' });
  });

  it('a reply revives even a stalled thread', () => {
    const stalled = transition(fresh, { kind: 'stalled' });
    const revived = transition(stalled, { kind: 'counterpart_replied' });
    expect(revived.status).toBe('answered');
    expect(revived.nudgesSinceReply).toBe(0);
  });

  it('the close reason counts frames honestly', () => {
    let s = fresh;
    s = transition(s, { kind: 'nudged' });
    s = transition(s, { kind: 'reframed' });
    s = transition(s, { kind: 'nudged' });
    s = transition(s, { kind: 'reframed' });
    s = transition(s, { kind: 'nudged' });
    const move = nextMove(s);
    expect(move.move).toBe('close');
    if (move.move === 'close') expect(move.reason).toContain('3 frames');
  });

  it('a stricter policy is honored — zero nudges means reframe immediately', () => {
    expect(nextMove(fresh, { maxNudgesPerFrame: 0, maxFrames: 2 }).move).toBe('reframe');
  });

  it('a single-frame policy closes as soon as the frame is spent', () => {
    const nudged = transition(fresh, { kind: 'nudged' });
    expect(nextMove(nudged, { maxNudgesPerFrame: 1, maxFrames: 1 }).move).toBe('close');
  });
});

describe('ThreadId — subject AND topic, never a place or a person', () => {
  it('the same merchant + the same question is one thread, three channels or not', () => {
    const a = { subjectId: 'acc_1', topic: normalizeTopic('compliance_pending') };
    const b = { subjectId: 'acc_1', topic: normalizeTopic('Compliance pending') };
    expect(sameThread(a, b)).toBe(true);
    expect(threadKey(a)).toBe(threadKey(b));
  });

  it('two questions with the same person are two threads', () => {
    expect(
      sameThread(
        { subjectId: 'acc_1', topic: 'compliance_pending' },
        { subjectId: 'acc_1', topic: 'am_contact' },
      ),
    ).toBe(false);
  });

  it('the same question on two merchants is two threads', () => {
    expect(
      sameThread(
        { subjectId: 'acc_1', topic: 'compliance_pending' },
        { subjectId: 'acc_2', topic: 'compliance_pending' },
      ),
    ).toBe(false);
  });

  it('threadState is a copy, not a live view', () => {
    const input = { status: 'awaiting_reply' as const, nudgesSinceReply: 1, framesTried: 2 };
    const s = threadState(input);
    expect(s).toEqual(input);
    input.nudgesSinceReply = 9;
    expect(s.nudgesSinceReply).toBe(1);
  });
});

describe('pickReframe — a new frame must change an axis', () => {
  it('prefers channel, then question, counterpart last', () => {
    expect(pickReframe([])).toBe('channel');
    expect(pickReframe(['channel'])).toBe('question');
    expect(pickReframe(['channel', 'question'])).toBe('counterpart');
  });

  it('returns null when every axis was tried — close, do not invent a fourth', () => {
    expect(pickReframe(['channel', 'question', 'counterpart'])).toBeNull();
  });
});
