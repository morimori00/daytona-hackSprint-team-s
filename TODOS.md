# TODOS

Deferred scope from the /plan-eng-review of the bug-reproduction agent (2026-07-24).
These are intentionally NOT in the MVP demo. Each has enough context to pick up later.

## Post-MVP / production

- [ ] **Per-repo config (`.reproducibility.yml`)**
  - Why: "one webhook is all a user configures" is false for real repos. Each needs
    package manager, install cmd, start cmd, port, health endpoint, env vars, branch/ref.
  - Context: MVP hardcodes the seed app's config. Generality (the pitch) needs a committed
    per-repo manifest the orchestrator reads. This is what turns a 1-repo demo into a product.
  - Depends on: MVP loop working.

- [ ] **Security boundary for untrusted target code**
  - Why: `npm ci` runs lifecycle scripts and `npm run dev` executes arbitrary repo code,
    sharing a sandbox with the LLM key + outbound network. Tolerable for the seed demo,
    not for the enterprise claim.
  - Context: isolate secrets from the target process; scope network egress; least-privilege token.
  - Depends on: per-repo config.

- [ ] **Deterministic bug oracle (replace LLM self-judgment)**
  - Why: MVP has the LLM write its own verdict (self-scoring, lower objectivity). A real
    product needs an external, deterministic check of the reported failure state.
  - Context: define an oracle per issue (selector/text/HTTP assertion) that runs outside the LLM.
  - Depends on: per-repo config + MVP loop.

- [ ] **Approach B: GitHub App + job queue + history dashboard**
  - Why: multi-repo install, permissions, run history, webhook fast-200 via queue.
  - Context: MVP uses resident Node + ngrok. GitHub App is the productionization path.

- [ ] **WorkOS auth on the dashboard**
  - Why: sponsor prize + gate the dashboard/history. Off the demo critical path.
  - Context: AuthKit login on the Next.js control plane.

- [ ] **Daytona-native Docker support**
  - Why: MVP dropped Docker/DinD for `npm run dev`. Real "docker web apps" need Docker.
  - Context: verify whether Daytona provides a per-sandbox Docker daemon (avoid nested DinD).

## Stretch (demo polish)

- [ ] **Approach C: live-view of the browser-use run on the dashboard**
  - Why: double whoa (live watch + landed GIF). Only if the spike lands on day 1 and A is stable.
  - Context: WebSocket or Daytona live view.
