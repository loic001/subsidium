/**
 * subsidium/ui — embeddable dashboard bricks.
 *
 * The kernel (`subsidium`) stays dependency-free. This export is the
 * visual half: drop it in a host app, feed it subjects / a queue /
 * an escalation brief, and the pyramid is on the screen.
 *
 *   import 'subsidium/ui/styles.css'
 *   import { EscalationBriefView, TierBands, TierPyramid } from 'subsidium/ui'
 */
export { EscalationBriefView } from './EscalationBriefView';
export { TierBands, TierChip } from './TierBands';
export { TierPyramid } from './TierPyramid';
