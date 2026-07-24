/**
 * Renders the reproduction comment.
 *
 * This comment is the product's face: someone scans it for three seconds and
 * has to walk away knowing whether the bug is real. Hence verdict-first, the
 * status word carrying the meaning (never colour alone), evidence next, and
 * the noisy step log collapsed.
 *
 * All copy is English on purpose -- global audience.
 */

export type RunState = 'running' | 'reproduced' | 'not_reproduced' | 'failed';

export interface CommentInput {
  state: RunState;
  /** One plain sentence: what happened and where. */
  summary?: string;
  /** Each step, already prefixed "OK: " / "FAILED: ". */
  steps?: string[];
  /** Public raw URL of the recording. */
  gifUrl?: string;
  /** Short SHA actually tested -- an issue is not pinned to a commit. */
  commit?: string;
  /** Wall-clock duration, e.g. "2m18s". */
  duration?: string;
  /** Target identifier, e.g. "seed-app@main". */
  target?: string;
}

const HEADLINES: Record<RunState, string> = {
  running: '## 🔄 Reproducing…',
  reproduced: '## ✅ Reproduced',
  not_reproduced: '## ❌ Not reproduced',
  failed: "## ⚠️ Couldn't run the reproduction",
};

/** Keep the LLM (and ourselves) to one sentence. */
function oneSentence(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function footer(input: CommentInput): string {
  const parts = [
    input.commit ? `commit ${input.commit}` : null,
    input.duration ?? null,
    input.target ?? null,
  ].filter(Boolean);
  return parts.length ? `\n\n\`${parts.join(' · ')}\`` : '';
}

function stepLog(steps: string[] | undefined, state: RunState): string {
  if (!steps?.length) return '';
  const label = state === 'failed' ? 'Log' : `Steps replayed (${steps.length})`;
  const body = steps.map((s) => `- ${s}`).join('\n');
  return `\n\n<details>\n<summary>${label}</summary>\n\n${body}\n\n</details>`;
}

function evidence(input: CommentInput): string {
  if (!input.gifUrl) return '';
  // Alt text matters: screen readers, and GitHub's email digests where the
  // image may not render at all.
  const alt =
    input.state === 'reproduced'
      ? 'Recording of the reproduced bug'
      : 'Recording of the reproduction attempt';
  return `\n\n![${alt}](${input.gifUrl})`;
}

export function renderComment(input: CommentInput): string {
  const headline = HEADLINES[input.state];

  if (input.state === 'running') {
    return [
      headline,
      '',
      'Spinning up a sandbox and replaying the steps from this issue. This usually takes 1–3 minutes.',
      footer(input).trim() ? footer(input).trimStart() : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  const summary = input.summary ? oneSentence(input.summary) : '';
  // The verdict word carries the meaning; the emoji is only a glyph.
  const body = input.state === 'failed' ? summary : `**${summary}**`;

  const retryHint =
    input.state === 'failed' ? '\n\nRe-add the `Reproducibility` label to try again.' : '';

  return `${headline}\n\n${body}${evidence(input)}${stepLog(input.steps, input.state)}${retryHint}${footer(input)}`;
}
