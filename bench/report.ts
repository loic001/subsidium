/**
 * subsidium · closed-world report — `npm run sim`
 *
 * Free, seeded, deterministic. Prints the policy comparison the tests pin,
 * with the numbers visible — a claim without an n and a reproducible script
 * is a vibe. Change the world in src/sim.ts (defaultWorld) and re-run.
 */
import {
  averageGating,
  averageSop,
  defaultSopWorld,
  defaultWorld,
  simulateOutreach,
  type GatingPolicy,
  type OutreachConfig,
  type SopPolicy,
} from '../src/sim';

const SEEDS = [11, 42, 137, 1001, 9090];
const world = defaultWorld();

const pad = (v: string | number, w: number): string => String(v).padStart(w);

console.log('subsidium · closed world — 60 days, 20 proposals/day, 60 human-minutes/day, 5 seeds\n');

console.log('GATING — who is allowed to fire an action?');
console.log(
  `  ${'policy'.padEnd(18)}${pad('unblocked', 10)}${pad('incidents', 10)}${pad('bad fired', 10)}${pad('h-minutes', 10)}${pad('queue@end', 10)}${pad('unbl/hour', 10)}`,
);
for (const policy of ['all_auto', 'all_consent', 'pyramid', 'pyramid_governor'] as GatingPolicy[]) {
  const cfg = policy === 'pyramid_governor' ? { ...world, governor: { minTrack: 15, errorBudget: 0.25 } } : world;
  const r = averageGating(policy, cfg, SEEDS);
  console.log(
    `  ${policy.padEnd(18)}${pad(r.unblocked, 10)}${pad(r.incidents, 10)}${pad(r.badFired, 10)}${pad(r.humanMinutes, 10)}${pad(r.queuedEnd, 10)}${pad(r.unblockedPerHour, 10)}`,
  );
}

console.log('\nGATING under drift — merchant_message turns rotten at day 30 (80% good -> 15%)');
const drifted = {
  ...world,
  drift: { day: 30, kind: 'merchant_message', goodRate: 0.15 },
  governor: { minTrack: 15, errorBudget: 0.25 },
};
console.log(`  ${'policy'.padEnd(28)}${pad('bad fired', 10)}${pad('incidents', 10)}`);
for (const [label, cfg] of [
  ['pyramid (static)', drifted],
  ['governor + cliff', drifted],
  ['governor, NO cliff', { ...drifted, human: { ...drifted.human, contestRate: 0 } }],
] as const) {
  const policy: GatingPolicy = label === 'pyramid (static)' ? 'pyramid' : 'pyramid_governor';
  const r = averageGating(policy, cfg, SEEDS);
  console.log(`  ${label.padEnd(28)}${pad(r.badFired, 10)}${pad(r.incidents, 10)}`);
}

console.log('\nSOP CHAINS — weakest-link tier (deriveSopTier) vs average-of-steps (the tempting bug)');
const sopWorld = defaultSopWorld();
console.log(
  `  ${'policy'.padEnd(18)}${pad('runs fired', 11)}${pad('dangerous-auto', 15)}${pad('incidents', 10)}${pad('stopped', 9)}${pad('h-minutes', 10)}`,
);
for (const policy of ['weakest_link', 'average_tier'] as SopPolicy[]) {
  const r = averageSop(policy, sopWorld, SEEDS);
  console.log(
    `  ${policy.padEnd(18)}${pad(r.runsFired, 11)}${pad(r.dangerousAutoFired, 15)}${pad(r.incidents, 10)}${pad(r.stopped, 9)}${pad(r.humanMinutes, 10)}`,
  );
}
console.log('  dangerous-auto = chains containing an irreversible+external step fired with NOBODY in the loop.');
console.log('  Averaging looks faster on every dashboard metric — the incidents are what the dashboard does not show.');

console.log('\nOUTREACH — 500 counterparts, hidden preferred channel, patience threshold 1');
const outreach: OutreachConfig = {
  seed: 42,
  counterparts: 500,
  channels: 3,
  bestChannelRate: 0.5,
  otherChannelRate: 0.05,
  annoyanceThreshold: 1,
  naiveCap: 6,
};
console.log(`  ${'policy'.padEnd(18)}${pad('replies', 10)}${pad('messages', 10)}${pad('annoyed', 10)}${pad('closed', 10)}`);
for (const policy of ['naive', 'law'] as const) {
  const r = simulateOutreach(policy, outreach);
  console.log(`  ${policy.padEnd(18)}${pad(r.replies, 10)}${pad(r.messagesSent, 10)}${pad(r.annoyanceEvents, 10)}${pad(r.closed, 10)}`);
}

console.log('\nWhat this proves: the orderings, under stated assumptions. Production keeps the final word.');
