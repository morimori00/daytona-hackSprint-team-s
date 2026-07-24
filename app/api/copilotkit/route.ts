/**
 * CopilotKit runtime for the dashboard assistant.
 *
 * Points at Fireworks rather than OpenAI: it speaks the OpenAI wire format, and
 * it is already the provider driving the browser agent -- one key, one bill, one
 * model to reason about.
 *
 * The agent is declared explicitly. Constructing CopilotRuntime with no agents
 * gives you a default BuiltInAgent on an OpenAI model, which would quietly
 * demand an OPENAI_API_KEY this project doesn't have.
 *
 * This route sits inside the middleware matcher on purpose. It answers questions
 * about a team's run history, so it is a protected resource and should require
 * the same session the dashboard does.
 */

import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { CopilotRuntime, copilotRuntimeNextJSAppRouterEndpoint } from '@copilotkit/runtime';
import { BuiltInAgent } from '@copilotkit/runtime/v2';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = process.env.COPILOT_MODEL ?? 'accounts/fireworks/models/glm-5p2';

const fireworks = createOpenAICompatible({
  name: 'fireworks',
  baseURL: process.env.FIREWORKS_BASE_URL ?? 'https://api.fireworks.ai/inference/v1',
  apiKey: process.env.FIREWORKS_API_KEY ?? '',
});

const copilotRuntime = new CopilotRuntime({
  agents: {
    default: new BuiltInAgent({ model: fireworks(MODEL) as never }),
  },
});

export const POST = async (req: NextRequest) => {
  if (!process.env.FIREWORKS_API_KEY) {
    // Better than a stack trace in the chat window.
    return new Response(JSON.stringify({ error: 'FIREWORKS_API_KEY is not set' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    });
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime: copilotRuntime,
    endpoint: '/api/copilotkit',
  });

  return handleRequest(req);
};
