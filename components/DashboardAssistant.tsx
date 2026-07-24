'use client';

/**
 * The dashboard assistant.
 *
 * Answers questions about what has been reproduced lately, which runs failed and
 * what keeps recurring -- the things you would otherwise get by opening a dozen
 * GitHub threads.
 *
 * It is given the run history and nothing else, and is told to answer only from
 * it. A copilot on top of a tool whose whole point is "only report what you
 * actually observed" cannot be the component that starts guessing.
 */

import { CopilotKit, useCopilotReadable } from '@copilotkit/react-core';
import { CopilotSidebar } from '@copilotkit/react-ui';
import '@copilotkit/react-ui/styles.css';

import type { RunRecord, RunStats } from '@/worker/runs';

const INSTRUCTIONS = `You are the assistant on the Preview Dog dashboard.

Preview Dog watches GitHub repositories. When someone adds the "Reproducibility"
label to an issue, it replays the reported steps in a sandboxed browser and
answers whether the bug reproduced. When the label goes on a pull request, it
records a walkthrough of what the change does and posts it as a Preview, with no
verdict attached.

You have the full run history and the aggregate stats. Answer only from them.
If the history does not contain the answer, say so plainly -- never estimate a
number, invent a run, or describe a repository that is not in the data. Verdicts
are the tool's, not yours: report what a run concluded, don't re-judge it.

Be brief. Cite runs as "<repo>#<number>" so the reader can go and look.`;

function RunContext({ runs, stats }: { runs: RunRecord[]; stats: RunStats }) {
  useCopilotReadable({
    description:
      'Aggregate statistics across every Preview Dog run: totals, reproduction rate, median duration.',
    value: JSON.stringify(stats),
  });

  useCopilotReadable({
    description:
      'Every Preview Dog run, newest first. Each has: repo, issue or PR number, title, kind ' +
      '(bug or preview), verdict (reproduced, not_reproduced, preview, failed), the summary the ' +
      'agent wrote from what it saw, commit, duration in seconds, and step count.',
    value: JSON.stringify(runs),
  });

  return null;
}

export function DashboardAssistant({ runs, stats }: { runs: RunRecord[]; stats: RunStats }) {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit">
      <RunContext runs={runs} stats={stats} />
      <CopilotSidebar
        instructions={INSTRUCTIONS}
        defaultOpen={false}
        clickOutsideToClose
        labels={{
          title: 'Preview Dog assistant',
          initial:
            "Ask me about your runs — what reproduced recently, which ones failed, or what keeps coming back.",
        }}
      />
    </CopilotKit>
  );
}
